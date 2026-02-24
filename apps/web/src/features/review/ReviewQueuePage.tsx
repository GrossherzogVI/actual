import { useMemo, useState } from 'react';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  FileSearch,
  Sparkles,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

import {
  listReviewItems,
  acceptReviewItem,
  dismissReviewItem,
  snoozeReviewItem,
  batchAcceptReviewItems,
  listCategories,
} from '../../core/api/finance-api';
import type { ReviewItem, Category } from '../../core/types/finance';
import { ReviewItemCard } from './ReviewItemCard';

type StatusFilter = ReviewItem['status'] | 'all';
type TypeFilter = string | 'all';
type PriorityFilter = ReviewItem['priority'] | 'all';

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'pending', label: 'Offen' },
  { value: 'all', label: 'Alle' },
  { value: 'accepted', label: 'Uebernommen' },
  { value: 'dismissed', label: 'Verworfen' },
  { value: 'snoozed', label: 'Zurueckgestellt' },
];

const TYPE_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: 'all', label: 'Alle Typen' },
  { value: 'uncategorized', label: 'Nicht kategorisiert' },
  { value: 'low-confidence', label: 'Geringe Konfidenz' },
  { value: 'contract-deadline', label: 'Vertragsfrist' },
];

const PRIORITY_OPTIONS: { value: PriorityFilter; label: string; color: string }[] = [
  { value: 'all', label: 'Alle', color: 'var(--fo-muted)' },
  { value: 'critical', label: 'Kritisch', color: '#ef4444' },
  { value: 'high', label: 'Hoch', color: '#f97316' },
  { value: 'medium', label: 'Mittel', color: '#eab308' },
  { value: 'low', label: 'Niedrig', color: '#3b82f6' },
];

export function ReviewQueuePage() {
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');

  // Track which individual items are mutating
  const [mutatingIds, setMutatingIds] = useState<
    Map<string, 'accept' | 'dismiss' | 'snooze'>
  >(new Map());

  // ---- Data fetching ----

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['review-items', statusFilter],
    queryFn: () =>
      listReviewItems(statusFilter === 'all' ? undefined : statusFilter),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: listCategories,
  });

  // Build a map of category ID -> name for display in cards
  const categoryMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const cat of categories) {
      map.set(cat.id, cat.name);
    }
    return map;
  }, [categories]);

  // ---- Mutations ----

  function markMutating(id: string, action: 'accept' | 'dismiss' | 'snooze') {
    setMutatingIds(prev => new Map(prev).set(id, action));
  }

  function clearMutating(id: string) {
    setMutatingIds(prev => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }

  const acceptMutation = useMutation({
    mutationFn: acceptReviewItem,
    onMutate: (id) => markMutating(id, 'accept'),
    onSettled: (_, __, id) => {
      clearMutating(id);
      queryClient.invalidateQueries({ queryKey: ['review-items'] });
    },
  });

  const dismissMutation = useMutation({
    mutationFn: dismissReviewItem,
    onMutate: (id) => markMutating(id, 'dismiss'),
    onSettled: (_, __, id) => {
      clearMutating(id);
      queryClient.invalidateQueries({ queryKey: ['review-items'] });
    },
  });

  const snoozeMutation = useMutation({
    mutationFn: snoozeReviewItem,
    onMutate: (id) => markMutating(id, 'snooze'),
    onSettled: (_, __, id) => {
      clearMutating(id);
      queryClient.invalidateQueries({ queryKey: ['review-items'] });
    },
  });

  const batchAcceptMutation = useMutation({
    mutationFn: batchAcceptReviewItems,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['review-items'] });
    },
  });

  // ---- Filtering ----

  const filtered = useMemo(() => {
    let list = items;

    if (typeFilter !== 'all') {
      list = list.filter(i => i.type === typeFilter);
    }
    if (priorityFilter !== 'all') {
      list = list.filter(i => i.priority === priorityFilter);
    }

    return list;
  }, [items, typeFilter, priorityFilter]);

  // ---- Stats (computed from unfiltered pending items) ----

  const stats = useMemo(() => {
    // Stats always reflect all items from the current query (before type/priority filter)
    const pending = items.filter(i => i.status === 'pending');
    const byPriority: Record<ReviewItem['priority'], number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };
    for (const item of pending) {
      byPriority[item.priority]++;
    }
    return { total: pending.length, byPriority };
  }, [items]);

  // Items eligible for batch accept: pending + confidence >= 0.9
  const highConfidenceIds = useMemo(() => {
    return filtered
      .filter(
        i =>
          i.status === 'pending' &&
          i.ai_suggestion?.confidence != null &&
          i.ai_suggestion.confidence >= 0.9,
      )
      .map(i => i.id);
  }, [filtered]);

  function handleBatchAccept() {
    if (highConfidenceIds.length === 0) return;
    batchAcceptMutation.mutate(highConfidenceIds);
  }

  // ---- Loading state ----

  if (isLoading) {
    return (
      <motion.div
        className="p-5"
        style={{ display: 'grid', gap: 20 }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <section className="fo-panel">
          <header className="fo-panel-header">
            <h2>Pruefungen</h2>
          </header>
          <div className="fo-stack">
            {Array.from({ length: 5 }, (_, i) => (
              <div
                key={i}
                className="h-28 rounded-md bg-[var(--fo-bg)] animate-pulse"
              />
            ))}
          </div>
        </section>
      </motion.div>
    );
  }

  // ---- Render ----

  return (
    <motion.div
      className="p-5 h-full overflow-auto"
      style={{ display: 'grid', gap: 20, alignContent: 'start' }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* Summary stats */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: 12,
        }}
      >
        <SummaryCard
          label="Offen gesamt"
          value={String(stats.total)}
          accent="var(--fo-text)"
        />
        <SummaryCard
          label="Kritisch"
          value={String(stats.byPriority.critical)}
          accent="#ef4444"
        />
        <SummaryCard
          label="Hoch"
          value={String(stats.byPriority.high)}
          accent="#f97316"
        />
        <SummaryCard
          label="Mittel"
          value={String(stats.byPriority.medium)}
          accent="#eab308"
        />
        <SummaryCard
          label="Niedrig"
          value={String(stats.byPriority.low)}
          accent="#3b82f6"
        />
      </div>

      {/* Main panel */}
      <section className="fo-panel">
        <header className="fo-panel-header">
          <div className="fo-space-between">
            <h2>Pruefungen</h2>
            {highConfidenceIds.length > 0 && (
              <button
                type="button"
                className="fo-btn fo-row"
                style={{
                  padding: '6px 12px',
                  fontSize: 13,
                  gap: 6,
                  color: '#34d399',
                  backgroundColor: 'rgba(52,211,153,0.1)',
                  border: '1px solid rgba(52,211,153,0.2)',
                }}
                onClick={handleBatchAccept}
                disabled={batchAcceptMutation.isPending}
              >
                <Sparkles size={14} />
                {batchAcceptMutation.isPending
                  ? 'Wird uebernommen...'
                  : `${highConfidenceIds.length} sichere uebernehmen`}
              </button>
            )}
          </div>
        </header>

        {/* Filter bar */}
        <div style={{ display: 'grid', gap: 10 }}>
          {/* Status + type filters */}
          <div className="fo-row" style={{ flexWrap: 'wrap', gap: 8 }}>
            {/* Status chips */}
            {STATUS_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                className={`fo-chip ${statusFilter === opt.value ? 'fo-chip-active' : ''}`}
                style={{ fontSize: 11 }}
                onClick={() => setStatusFilter(opt.value)}
              >
                {opt.label}
                {opt.value === 'pending' && stats.total > 0 && (
                  <span
                    className="ml-1 inline-flex items-center justify-center rounded-full text-[9px] font-bold"
                    style={{
                      minWidth: 16,
                      height: 16,
                      padding: '0 4px',
                      backgroundColor: 'rgba(255,255,255,0.1)',
                    }}
                  >
                    {stats.total}
                  </span>
                )}
              </button>
            ))}

            {/* Divider */}
            <span
              className="inline-block w-px self-stretch"
              style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}
            />

            {/* Type dropdown */}
            <select
              className="fo-input"
              style={{
                width: 'auto',
                minWidth: 160,
                fontSize: 12,
                padding: '5px 8px',
              }}
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value as TypeFilter)}
            >
              {TYPE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Priority chips */}
          <div className="fo-row" style={{ flexWrap: 'wrap', gap: 8 }}>
            {PRIORITY_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                className={`fo-chip ${priorityFilter === opt.value ? 'fo-chip-active' : ''}`}
                style={{
                  fontSize: 11,
                  borderColor:
                    priorityFilter === opt.value && opt.value !== 'all'
                      ? opt.color
                      : undefined,
                }}
                onClick={() => setPriorityFilter(opt.value)}
              >
                {opt.value !== 'all' && (
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full mr-1"
                    style={{ backgroundColor: opt.color }}
                  />
                )}
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Review items list */}
        {filtered.length === 0 ? (
          <EmptyState hasAnyItems={items.length > 0} />
        ) : (
          <div className="fo-stack" style={{ gap: 8 }}>
            <AnimatePresence mode="popLayout">
              {filtered.map((item, i) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8, height: 0 }}
                  transition={{ duration: 0.15, delay: i * 0.03 }}
                >
                  <ReviewItemCard
                    item={item}
                    categoryMap={categoryMap}
                    onAccept={id => acceptMutation.mutate(id)}
                    onDismiss={id => dismissMutation.mutate(id)}
                    onSnooze={id => snoozeMutation.mutate(id)}
                    isAccepting={mutatingIds.get(item.id) === 'accept'}
                    isDismissing={mutatingIds.get(item.id) === 'dismiss'}
                    isSnoozing={mutatingIds.get(item.id) === 'snooze'}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* Count footer */}
        {filtered.length > 0 && (
          <div className="text-xs text-[var(--fo-muted)] text-center">
            {filtered.length} von {items.length} Eintraegen
          </div>
        )}
      </section>
    </motion.div>
  );
}

// ---- Sub-components ----

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="fo-metric-card">
      <span
        className="text-lg font-semibold tabular-nums"
        style={{ color: accent, fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </span>
      <span className="text-xs text-[var(--fo-muted)]">{label}</span>
    </div>
  );
}

function EmptyState({ hasAnyItems }: { hasAnyItems: boolean }) {
  return (
    <div className="fo-card text-center py-12">
      {hasAnyItems ? (
        <>
          <FileSearch
            size={24}
            className="mx-auto mb-2 text-[var(--fo-muted)]"
          />
          <p className="text-sm text-[var(--fo-muted)]">
            Keine Pruefungen fuer diesen Filter gefunden.
          </p>
        </>
      ) : (
        <>
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.3, type: 'spring' }}
            className="mb-3"
          >
            <Check
              size={32}
              className="mx-auto text-emerald-400"
            />
          </motion.div>
          <p className="text-sm text-[var(--fo-text)]">
            Keine offenen Pruefungen — alles erledigt!
          </p>
          <p className="text-xs text-[var(--fo-muted)] mt-1">
            Neue Eintraege erscheinen hier automatisch, wenn die KI unsichere
            Klassifizierungen oder Vertragsfristen erkennt.
          </p>
        </>
      )}
    </div>
  );
}

import { motion } from 'motion/react';
import {
  AlertTriangle,
  Check,
  Clock,
  FileSearch,
  Sparkles,
  X,
} from 'lucide-react';

import type { ReviewItem } from '../../core/types/finance';
import { AIExplainButton, ConfidenceBadge } from '../intelligence';

const PRIORITY_CONFIG: Record<
  ReviewItem['priority'],
  { label: string; color: string; bg: string }
> = {
  critical: { label: 'Kritisch', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  high: { label: 'Hoch', color: '#f97316', bg: 'rgba(249,115,22,0.12)' },
  medium: { label: 'Mittel', color: '#eab308', bg: 'rgba(234,179,8,0.12)' },
  low: { label: 'Niedrig', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
};

const TYPE_LABELS: Record<string, string> = {
  'uncategorized': 'Nicht kategorisiert',
  'low-confidence': 'Geringe Konfidenz',
  'contract-deadline': 'Vertragsfrist',
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatDate(dateStr: string): string {
  try {
    return new Intl.DateTimeFormat('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
}

function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

export function ReviewItemCard({
  item,
  categoryMap,
  onAccept,
  onDismiss,
  onSnooze,
  isAccepting,
  isDismissing,
  isSnoozing,
}: {
  item: ReviewItem;
  categoryMap: Map<string, string>;
  onAccept: (id: string) => void;
  onDismiss: (id: string) => void;
  onSnooze: (id: string) => void;
  isAccepting: boolean;
  isDismissing: boolean;
  isSnoozing: boolean;
}) {
  const priority = PRIORITY_CONFIG[item.priority];
  const typeLabel = TYPE_LABELS[item.type] ?? item.type;
  const confidence = item.ai_suggestion?.confidence;
  const isHighConfidence = confidence != null && confidence > 0.7;
  const isResolved = item.status !== 'pending';
  const suggestedCategoryName = item.ai_suggestion?.suggested_category
    ? categoryMap.get(item.ai_suggestion.suggested_category) ??
      item.ai_suggestion.suggested_category
    : undefined;

  return (
    <motion.div
      layout
      className="fo-card"
      style={{
        display: 'grid',
        gap: 10,
        opacity: isResolved ? 0.5 : 1,
      }}
      exit={{ opacity: 0, height: 0, marginTop: 0, marginBottom: 0, overflow: 'hidden' }}
      transition={{ duration: 0.2 }}
    >
      {/* Header row: badges + date */}
      <div className="fo-space-between">
        <div className="fo-row" style={{ gap: 6 }}>
          {/* Priority badge */}
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
            style={{
              color: priority.color,
              backgroundColor: priority.bg,
            }}
          >
            {item.priority === 'critical' && <AlertTriangle size={10} />}
            {priority.label}
          </span>

          {/* Type badge */}
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-[rgba(255,255,255,0.06)] text-[var(--fo-muted)]">
            {item.type === 'contract-deadline' ? (
              <Clock size={10} />
            ) : (
              <FileSearch size={10} />
            )}
            {typeLabel}
          </span>
        </div>

        {item.created_at && (
          <span className="text-[10px] text-[var(--fo-muted)]">
            {formatDate(item.created_at)}
          </span>
        )}
      </div>

      {/* Transaction details */}
      {item.transaction_payee_name && (
        <div style={{ display: 'grid', gap: 2 }}>
          <div className="fo-space-between">
            <span className="text-sm font-medium text-[var(--fo-text)]">
              {item.transaction_payee_name}
            </span>
            {item.transaction_amount != null && (
              <span
                className="text-sm font-semibold tabular-nums"
                style={{
                  color:
                    item.transaction_amount < 0 ? '#f87171' : '#34d399',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {formatCurrency(item.transaction_amount)}
              </span>
            )}
          </div>
          <div className="fo-row text-[11px] text-[var(--fo-muted)]" style={{ gap: 8 }}>
            {item.transaction_date && (
              <span>{formatDate(item.transaction_date)}</span>
            )}
            {item.transaction_notes && (
              <span className="truncate" style={{ maxWidth: 200 }}>
                {item.transaction_notes}
              </span>
            )}
          </div>
        </div>
      )}

      {/* AI suggestion (transaction types) */}
      {(item.type === 'low-confidence' || item.type === 'uncategorized') &&
        item.ai_suggestion && (
          <div
            className="rounded-md px-3 py-2"
            style={{
              backgroundColor: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
              display: 'grid',
              gap: 4,
            }}
          >
            <div className="fo-row text-[11px] text-[var(--fo-muted)]" style={{ gap: 4 }}>
              <Sparkles size={11} />
              <span>KI-Vorschlag</span>
            </div>
            <div className="fo-space-between">
              {suggestedCategoryName && (
                <span className="text-sm text-[var(--fo-text)]">
                  {suggestedCategoryName}
                </span>
              )}
              {confidence != null && (
                <ConfidenceBadge confidence={confidence} showPercentage />
              )}
            </div>
            {item.ai_suggestion.error && (
              <span className="text-[10px] text-red-400">
                {item.ai_suggestion.error}
              </span>
            )}
          </div>
        )}

      {/* Contract deadline details */}
      {item.type === 'contract-deadline' && item.ai_suggestion && (
        <div
          className="rounded-md px-3 py-2"
          style={{
            backgroundColor: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
            display: 'grid',
            gap: 4,
          }}
        >
          <div className="fo-row text-[11px] text-[var(--fo-muted)]" style={{ gap: 4 }}>
            <Clock size={11} />
            <span>Vertragsfrist</span>
          </div>
          {item.ai_suggestion.contract_name && (
            <span className="text-sm text-[var(--fo-text)]">
              {item.ai_suggestion.contract_name}
            </span>
          )}
          {item.ai_suggestion.action && (
            <span className="text-xs text-[var(--fo-muted)]">
              Empfehlung: {item.ai_suggestion.action}
            </span>
          )}
        </div>
      )}

      {/* AI explanation */}
      {!isResolved && item.ai_suggestion && (
        <AIExplainButton
          reviewItemId={item.id}
          existingExplanation={item.explanation}
        />
      )}

      {/* Action buttons */}
      {!isResolved && (
        <div className="fo-row" style={{ gap: 6, justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="fo-row rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
            style={{
              gap: 4,
              color: '#eab308',
              backgroundColor: 'rgba(234,179,8,0.08)',
              border: '1px solid rgba(234,179,8,0.15)',
            }}
            onClick={() => onSnooze(item.id)}
            disabled={isSnoozing}
          >
            <Clock size={12} />
            {isSnoozing ? 'Wird verschoben...' : 'Spaeter'}
          </button>

          <button
            type="button"
            className="fo-row rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
            style={{
              gap: 4,
              color: 'var(--fo-muted)',
              backgroundColor: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
            onClick={() => onDismiss(item.id)}
            disabled={isDismissing}
          >
            <X size={12} />
            {isDismissing ? 'Wird verworfen...' : 'Verwerfen'}
          </button>

          <button
            type="button"
            className="fo-row rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
            style={{
              gap: 4,
              color: '#34d399',
              backgroundColor: isHighConfidence
                ? 'rgba(52,211,153,0.15)'
                : 'rgba(52,211,153,0.08)',
              border: `1px solid ${
                isHighConfidence
                  ? 'rgba(52,211,153,0.3)'
                  : 'rgba(52,211,153,0.15)'
              }`,
              fontWeight: isHighConfidence ? 600 : 500,
            }}
            onClick={() => onAccept(item.id)}
            disabled={isAccepting}
          >
            <Check size={12} />
            {isAccepting ? 'Wird uebernommen...' : 'Uebernehmen'}
          </button>
        </div>
      )}

      {/* Resolved status indicator */}
      {isResolved && (
        <div className="text-[10px] text-[var(--fo-muted)] text-right">
          {item.status === 'accepted' && 'Uebernommen'}
          {item.status === 'dismissed' && 'Verworfen'}
          {item.status === 'snoozed' && 'Zurueckgestellt'}
          {item.resolved_at && ` — ${formatDate(item.resolved_at)}`}
        </div>
      )}
    </motion.div>
  );
}

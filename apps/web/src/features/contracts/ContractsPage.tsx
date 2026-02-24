import { useMemo, useState } from 'react';

import { useQuery } from '@tanstack/react-query';
import {
  FileText,
  Plus,
  Search,
} from 'lucide-react';
import { motion } from 'motion/react';

import { listContracts } from '../../core/api/finance-api';
import type { Contract } from '../../core/types/finance';
import { ContractCard, HEALTH_CONFIG, TYPE_CONFIG } from './ContractCard';
import { ContractForm } from './ContractForm';

type HealthFilter = Contract['health'] | 'all';
type TypeFilter = Contract['type'] | 'all';

const TYPE_OPTIONS: { value: TypeFilter; label: string }[] = [
  { value: 'all', label: 'Alle Typen' },
  ...Object.entries(TYPE_CONFIG).map(([key, cfg]) => ({
    value: key as Contract['type'],
    label: cfg.label,
  })),
];

const HEALTH_OPTIONS: { value: HealthFilter; label: string; color: string }[] = [
  { value: 'all', label: 'Alle', color: 'var(--fo-muted)' },
  { value: 'green', label: 'Aktiv', color: '#34d399' },
  { value: 'yellow', label: 'Ablauf nahe', color: '#fbbf24' },
  { value: 'red', label: 'Dringend', color: '#f87171' },
  { value: 'grey', label: 'Gekuendigt', color: '#a6a6a6' },
];

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(amount);
}

function computeMonthly(contract: Contract): number {
  const multipliers: Record<Contract['interval'], number> = {
    weekly: 52 / 12,
    monthly: 1,
    quarterly: 1 / 3,
    'semi-annual': 1 / 6,
    annual: 1 / 12,
    custom: 1,
  };
  return contract.amount * (multipliers[contract.interval] ?? 1);
}

export function ContractsPage() {
  const [search, setSearch] = useState('');
  const [healthFilter, setHealthFilter] = useState<HealthFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');

  const [formOpen, setFormOpen] = useState(false);
  const [editingContract, setEditingContract] = useState<Contract | undefined>();

  const { data: contracts, isLoading } = useQuery({
    queryKey: ['contracts'],
    queryFn: listContracts,
  });

  // Filtered list
  const filtered = useMemo(() => {
    let list = contracts ?? [];

    if (healthFilter !== 'all') {
      list = list.filter(c => c.health === healthFilter);
    }
    if (typeFilter !== 'all') {
      list = list.filter(c => c.type === typeFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        c =>
          c.name.toLowerCase().includes(q) ||
          c.provider.toLowerCase().includes(q),
      );
    }

    return list;
  }, [contracts, healthFilter, typeFilter, search]);

  // Summary stats
  const stats = useMemo(() => {
    const all = contracts ?? [];
    const totalMonthly = all.reduce((sum, c) => sum + computeMonthly(c), 0);
    const totalAnnual = all.reduce((sum, c) => sum + c.annual_cost, 0);
    const byHealth: Record<Contract['health'], number> = {
      green: 0,
      yellow: 0,
      red: 0,
      grey: 0,
    };
    for (const c of all) {
      byHealth[c.health]++;
    }
    return { totalMonthly, totalAnnual, byHealth, total: all.length };
  }, [contracts]);

  function openCreate() {
    setEditingContract(undefined);
    setFormOpen(true);
  }

  function openEdit(contract: Contract) {
    setEditingContract(contract);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingContract(undefined);
  }

  // Loading state
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
            <h2>Vertraege</h2>
          </header>
          <div className="fo-stack">
            {Array.from({ length: 6 }, (_, i) => (
              <div
                key={i}
                className="h-24 rounded-md bg-[var(--fo-bg)] animate-pulse"
              />
            ))}
          </div>
        </section>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="p-5 h-full overflow-auto"
      style={{ display: 'grid', gap: 20, alignContent: 'start' }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* Summary bar */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 12,
        }}
      >
        <SummaryCard
          label="Monatliche Kosten"
          value={formatCurrency(stats.totalMonthly)}
          accent="var(--fo-text)"
        />
        <SummaryCard
          label="Jaehrliche Kosten"
          value={formatCurrency(stats.totalAnnual)}
          accent="var(--fo-text)"
        />
        <SummaryCard
          label="Gesamt"
          value={String(stats.total)}
          accent="var(--fo-text)"
        />
        {(Object.keys(stats.byHealth) as Contract['health'][]).map(h => {
          const cfg = HEALTH_CONFIG[h];
          return (
            <SummaryCard
              key={h}
              label={cfg.label}
              value={String(stats.byHealth[h])}
              accent={cfg.color}
            />
          );
        })}
      </div>

      {/* Main panel */}
      <section className="fo-panel">
        <header className="fo-panel-header">
          <div className="fo-space-between">
            <h2>Vertraege</h2>
            <button
              type="button"
              className="fo-btn fo-row"
              style={{ padding: '6px 12px', fontSize: 13, gap: 6 }}
              onClick={openCreate}
            >
              <Plus size={14} />
              Neuer Vertrag
            </button>
          </div>
        </header>

        {/* Filter bar */}
        <div style={{ display: 'grid', gap: 10 }}>
          {/* Search */}
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--fo-muted)]"
            />
            <input
              type="text"
              className="fo-input pl-8"
              placeholder="Nach Name oder Anbieter suchen..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Type + health filters */}
          <div className="fo-row" style={{ flexWrap: 'wrap', gap: 8 }}>
            {/* Type dropdown */}
            <select
              className="fo-input"
              style={{ width: 'auto', minWidth: 140, fontSize: 12, padding: '5px 8px' }}
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value as TypeFilter)}
            >
              {TYPE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            {/* Health chips */}
            {HEALTH_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                className={`fo-chip ${healthFilter === opt.value ? 'fo-chip-active' : ''}`}
                style={{
                  fontSize: 11,
                  borderColor:
                    healthFilter === opt.value && opt.value !== 'all'
                      ? opt.color
                      : undefined,
                }}
                onClick={() => setHealthFilter(opt.value)}
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

        {/* Contract list */}
        {filtered.length === 0 ? (
          <div className="fo-card text-center py-8">
            <FileText size={24} className="mx-auto mb-2 text-[var(--fo-muted)]" />
            <p className="text-sm text-[var(--fo-muted)]">
              {(contracts ?? []).length === 0
                ? 'Noch keine Vertraege vorhanden.'
                : 'Keine Vertraege fuer diesen Filter gefunden.'}
            </p>
            {(contracts ?? []).length === 0 && (
              <button
                type="button"
                className="fo-btn mt-3"
                style={{ fontSize: 13, padding: '6px 14px' }}
                onClick={openCreate}
              >
                Ersten Vertrag anlegen
              </button>
            )}
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 10,
            }}
          >
            {filtered.map((contract, i) => (
              <motion.div
                key={contract.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15, delay: i * 0.03 }}
              >
                <ContractCard contract={contract} onEdit={openEdit} />
              </motion.div>
            ))}
          </div>
        )}

        {/* Count footer */}
        {filtered.length > 0 && (
          <div className="text-xs text-[var(--fo-muted)] text-center">
            {filtered.length} von {(contracts ?? []).length} Vertraegen
          </div>
        )}
      </section>

      {/* Form slide-over */}
      <ContractForm
        contract={editingContract}
        open={formOpen}
        onClose={closeForm}
      />
    </motion.div>
  );
}

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

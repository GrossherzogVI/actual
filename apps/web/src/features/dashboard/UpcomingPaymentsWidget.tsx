import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, HelpCircle, XCircle } from 'lucide-react';
import { motion } from 'motion/react';

import { listContracts } from '../../core/api/finance-api';
import type { Contract } from '../../core/types/finance';
import { AmountDisplay } from '../finance/AmountDisplay';
import { WidgetError } from './WidgetError';

const INTERVAL_LABELS: Record<Contract['interval'], string> = {
  monthly: 'mtl.',
  quarterly: 'vrtl.',
  'semi-annual': 'halbj.',
  annual: 'jrl.',
  weekly: 'wtl.',
  custom: 'ind.',
};

const HEALTH_CONFIG: Record<
  Contract['health'],
  { icon: typeof CheckCircle2; colorClass: string; label: string }
> = {
  green: {
    icon: CheckCircle2,
    colorClass: 'text-emerald-400',
    label: 'OK',
  },
  yellow: {
    icon: AlertTriangle,
    colorClass: 'text-amber-400',
    label: 'Achtung',
  },
  red: {
    icon: XCircle,
    colorClass: 'text-red-400',
    label: 'Kritisch',
  },
  grey: {
    icon: HelpCircle,
    colorClass: 'text-[var(--fo-muted)]',
    label: 'Unbekannt',
  },
};

export function UpcomingPaymentsWidget() {
  const { data: contracts, isLoading, isError, refetch } = useQuery({
    queryKey: ['contracts'],
    queryFn: listContracts,
  });

  if (isLoading) {
    return (
      <motion.section
        className="fo-panel"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.2 }}
      >
        <header className="fo-panel-header">
          <h2>Laufende Vertraege</h2>
        </header>
        <div className="fo-stack">
          {[1, 2, 3, 4, 5].map(i => (
            <div
              key={i}
              className="h-12 rounded-md bg-[var(--fo-bg)] animate-pulse"
            />
          ))}
        </div>
      </motion.section>
    );
  }

  if (isError) {
    return (
      <motion.section
        className="fo-panel"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.2 }}
      >
        <header className="fo-panel-header">
          <h2>Laufende Vertraege</h2>
        </header>
        <WidgetError message="Vertragsdaten konnten nicht geladen werden" onRetry={() => void refetch()} />
      </motion.section>
    );
  }

  const sorted = [...(contracts ?? [])]
    .filter(c => c.status === 'active')
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

  const totalMonthly = sorted.reduce((sum, c) => {
    const multiplier: Record<Contract['interval'], number> = {
      weekly: 4.33,
      monthly: 1,
      quarterly: 1 / 3,
      'semi-annual': 1 / 6,
      annual: 1 / 12,
      custom: 1,
    };
    return sum + Math.abs(c.amount) * (multiplier[c.interval] ?? 1);
  }, 0);

  return (
    <motion.section
      className="fo-panel"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: 0.2 }}
    >
      <header className="fo-panel-header">
        <div className="fo-space-between">
          <h2>Laufende Vertraege</h2>
          <span className="text-xs text-[var(--fo-muted)] tabular-nums">
            ~{new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(totalMonthly)}/Monat
          </span>
        </div>
      </header>

      {sorted.length === 0 ? (
        <p className="text-sm text-[var(--fo-muted)]">
          Keine aktiven Vertraege.
        </p>
      ) : (
        <div className="fo-stack" style={{ maxHeight: 320, overflow: 'auto' }}>
          {sorted.map(contract => {
            const health = HEALTH_CONFIG[contract.health] ?? HEALTH_CONFIG.grey;
            const HealthIcon = health.icon;

            return (
              <div key={contract.id} className="fo-card">
                <div className="fo-space-between">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">
                      {contract.name}
                    </div>
                    <div className="text-xs text-[var(--fo-muted)] truncate">
                      {contract.provider}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <AmountDisplay
                        amount={-Math.abs(contract.amount)}
                        size="sm"
                      />
                      <div className="text-xs text-[var(--fo-muted)]">
                        {INTERVAL_LABELS[contract.interval]}
                      </div>
                    </div>
                    <HealthIcon
                      size={14}
                      className={health.colorClass}
                      aria-label={health.label}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </motion.section>
  );
}

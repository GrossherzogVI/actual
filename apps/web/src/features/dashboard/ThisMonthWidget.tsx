import { useQuery } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, Equal } from 'lucide-react';
import { motion } from 'motion/react';

import { getThisMonth } from '../../core/api/finance-api';
import { AmountDisplay } from '../finance/AmountDisplay';

function formatCount(n: number): string {
  return new Intl.NumberFormat('de-DE').format(n);
}

export function ThisMonthWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ['this-month'],
    queryFn: getThisMonth,
  });

  const monthName = new Intl.DateTimeFormat('de-DE', {
    month: 'long',
  }).format(new Date());

  if (isLoading) {
    return (
      <motion.section
        className="fo-panel"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.1 }}
      >
        <header className="fo-panel-header">
          <h2>Dieser Monat</h2>
          <small className="capitalize">{monthName}</small>
        </header>
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map(i => (
            <div
              key={i}
              className="h-20 rounded-md bg-[var(--fo-bg)] animate-pulse"
            />
          ))}
        </div>
      </motion.section>
    );
  }

  const income = data?.income ?? 0;
  const expenses = data?.expenses ?? 0;
  const net = data?.net ?? 0;
  const count = data?.transaction_count ?? 0;

  const metrics = [
    {
      label: 'Einnahmen',
      amount: income,
      icon: ArrowDownLeft,
      accentClass: 'border-t-2 border-t-emerald-500/60',
    },
    {
      label: 'Ausgaben',
      amount: expenses,
      icon: ArrowUpRight,
      accentClass: 'border-t-2 border-t-red-500/60',
    },
    {
      label: 'Netto',
      amount: net,
      icon: Equal,
      accentClass:
        net >= 0
          ? 'border-t-2 border-t-emerald-500/60'
          : 'border-t-2 border-t-red-500/60',
    },
  ] as const;

  return (
    <motion.section
      className="fo-panel"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: 0.1 }}
    >
      <header className="fo-panel-header">
        <h2>Dieser Monat</h2>
        <small className="capitalize">{monthName}</small>
      </header>

      <div className="grid grid-cols-3 gap-3">
        {metrics.map(metric => {
          const Icon = metric.icon;
          return (
            <div
              key={metric.label}
              className={`fo-card ${metric.accentClass}`}
            >
              <div className="fo-row">
                <Icon size={14} className="text-[var(--fo-muted)]" />
                <small className="text-xs text-[var(--fo-muted)] font-medium">
                  {metric.label}
                </small>
              </div>
              <AmountDisplay amount={metric.amount} size="md" />
            </div>
          );
        })}
      </div>

      <div className="text-center">
        <small className="text-xs text-[var(--fo-muted)]">
          {formatCount(count)} Transaktionen
        </small>
      </div>
    </motion.section>
  );
}

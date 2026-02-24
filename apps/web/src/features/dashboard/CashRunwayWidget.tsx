import { useQuery } from '@tanstack/react-query';
import { Clock, ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react';
import { motion } from 'motion/react';

import { getDashboardPulse, getThisMonth } from '../../core/api/finance-api';

function computeRunway(totalBalance: number, expenses: number): number | null {
  const now = new Date();
  const dayOfMonth = now.getDate();

  // Need at least 1 day of data to extrapolate
  if (dayOfMonth < 1 || expenses === 0) return null;

  const dailyBurn = Math.abs(expenses) / dayOfMonth;
  if (dailyBurn === 0) return null;

  return Math.round(totalBalance / dailyBurn);
}

function getRunwayConfig(days: number | null) {
  if (days === null) {
    return {
      icon: ShieldQuestion,
      colorClass: 'text-[var(--fo-muted)]',
      bgClass: '',
      label: 'Keine Daten',
    };
  }
  if (days > 60) {
    return {
      icon: ShieldCheck,
      colorClass: 'text-emerald-400',
      bgClass: 'border-t-2 border-t-emerald-500/60',
      label: 'Komfortabel',
    };
  }
  if (days >= 30) {
    return {
      icon: Clock,
      colorClass: 'text-amber-400',
      bgClass: 'border-t-2 border-t-amber-500/60',
      label: 'Aufpassen',
    };
  }
  return {
    icon: ShieldAlert,
    colorClass: 'text-red-400',
    bgClass: 'border-t-2 border-t-red-500/60',
    label: 'Kritisch',
  };
}

export function CashRunwayWidget() {
  const { data: pulse, isLoading: pulseLoading } = useQuery({
    queryKey: ['dashboard-pulse'],
    queryFn: getDashboardPulse,
  });

  const { data: thisMonth, isLoading: monthLoading } = useQuery({
    queryKey: ['this-month'],
    queryFn: getThisMonth,
  });

  const isLoading = pulseLoading || monthLoading;

  if (isLoading) {
    return (
      <motion.section
        className="fo-panel"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.15 }}
      >
        <header className="fo-panel-header">
          <h2>Cash Runway</h2>
        </header>
        <div className="h-24 rounded-md bg-[var(--fo-bg)] animate-pulse" />
      </motion.section>
    );
  }

  const totalBalance = pulse?.total_balance ?? 0;
  const expenses = thisMonth?.expenses ?? 0;
  const days = computeRunway(totalBalance, expenses);
  const config = getRunwayConfig(days);
  const RunwayIcon = config.icon;

  return (
    <motion.section
      className={`fo-panel ${config.bgClass}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: 0.15 }}
    >
      <header className="fo-panel-header">
        <h2>Cash Runway</h2>
        <small>Wie lange reicht das Geld?</small>
      </header>

      <div className="flex items-center justify-center gap-4 py-3">
        <RunwayIcon size={28} className={config.colorClass} />
        <div className="text-center">
          {days !== null ? (
            <>
              <div
                className={`text-3xl font-bold tabular-nums ${config.colorClass}`}
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {days}
              </div>
              <div className="text-xs text-[var(--fo-muted)] font-medium">
                Tage
              </div>
            </>
          ) : (
            <div className="text-sm text-[var(--fo-muted)]">
              Noch keine Ausgaben diesen Monat
            </div>
          )}
        </div>
      </div>

      <div className="text-center">
        <small className={`text-xs font-medium ${config.colorClass}`}>
          {config.label}
        </small>
      </div>
    </motion.section>
  );
}

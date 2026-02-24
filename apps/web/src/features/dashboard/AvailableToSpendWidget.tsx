import { useQuery } from '@tanstack/react-query';
import { CircleDollarSign, Lock, Wallet } from 'lucide-react';
import { motion } from 'motion/react';

import { getAvailableToSpend } from '../../core/api/finance-api';

const EUR = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

type MetricRowProps = {
  icon: typeof Wallet;
  label: string;
  amount: number;
  amountClass?: string;
};

function MetricRow({ icon: Icon, label, amount, amountClass = 'text-[var(--fo-text)]' }: MetricRowProps) {
  return (
    <div className="fo-space-between py-1">
      <div className="fo-row">
        <Icon size={13} className="text-[var(--fo-muted)]" />
        <small className="text-xs text-[var(--fo-muted)] font-medium">{label}</small>
      </div>
      <span
        className={`text-sm tabular-nums font-medium ${amountClass}`}
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {EUR.format(amount)}
      </span>
    </div>
  );
}

export function AvailableToSpendWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ['available-to-spend'],
    queryFn: getAvailableToSpend,
  });

  if (isLoading) {
    return (
      <motion.section
        className="fo-panel"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.12 }}
      >
        <header className="fo-panel-header">
          <h2>Verfügbar</h2>
        </header>
        <div className="fo-stack">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-8 rounded-md bg-[var(--fo-bg)] animate-pulse" />
          ))}
        </div>
      </motion.section>
    );
  }

  const balance = data?.balance ?? 0;
  const committed = data?.committed ?? 0;
  const available = data?.available ?? 0;
  const availableClass = available >= 0 ? 'text-emerald-400' : 'text-red-400';

  return (
    <motion.section
      className="fo-panel"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: 0.12 }}
    >
      <header className="fo-panel-header">
        <h2>Verfügbar</h2>
        <small>Kontostand minus Festausgaben</small>
      </header>

      <div className="fo-stack">
        <MetricRow icon={CircleDollarSign} label="Kontostand" amount={balance} />
        <MetricRow icon={Lock} label="Festgelegt" amount={-Math.abs(committed)} amountClass="text-[var(--fo-muted)]" />

        <div className="border-t border-[var(--fo-border)] pt-2">
          <div className="fo-space-between">
            <div className="fo-row">
              <Wallet size={13} className={availableClass} />
              <small className="text-xs font-semibold text-[var(--fo-text)]">Verfügbar</small>
            </div>
            <span
              className={`text-base tabular-nums font-bold ${availableClass}`}
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {EUR.format(available)}
            </span>
          </div>
        </div>
      </div>
    </motion.section>
  );
}

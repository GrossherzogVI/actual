import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { motion } from 'motion/react';

import type { MonthDelta } from '../../core/types/finance';
import { ChartContainer } from './ChartContainer';

const fmt = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
});

const pctFmt = new Intl.NumberFormat('de-DE', {
  style: 'percent',
  maximumFractionDigits: 0,
  signDisplay: 'always',
});

type WhatChangedCardProps = {
  data: MonthDelta[] | undefined;
  isLoading: boolean;
  error: Error | null;
  currentMonth: string;
  previousMonth: string;
};

function formatMonthLabel(ym: string): string {
  const [year, month] = ym.split('-');
  const date = new Date(Number(year), Number(month) - 1);
  return new Intl.DateTimeFormat('de-DE', {
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export function WhatChangedCard({
  data,
  isLoading,
  error,
  currentMonth,
  previousMonth,
}: WhatChangedCardProps) {
  // Show only significant changes (top 10 by absolute delta)
  const significant = (data ?? []).slice(0, 10);

  return (
    <ChartContainer
      title="Was hat sich geaendert?"
      isLoading={isLoading}
      error={error}
    >
      <p className="text-xs text-[var(--fo-muted)] mb-3">
        {formatMonthLabel(currentMonth)} vs. {formatMonthLabel(previousMonth)}
      </p>

      {significant.length === 0 ? (
        <div className="fo-card text-center py-8">
          <Minus size={20} className="mx-auto mb-2 text-[var(--fo-muted)]" />
          <p className="text-sm text-[var(--fo-muted)]">
            Keine signifikanten Veraenderungen.
          </p>
        </div>
      ) : (
        <div className="fo-stack" style={{ gap: 8 }}>
          {significant.map((item, i) => {
            const increased = item.delta > 0;
            const unchanged = item.delta === 0;
            const DeltaIcon = unchanged
              ? Minus
              : increased
                ? ArrowUp
                : ArrowDown;
            const colorClass = unchanged
              ? 'text-[var(--fo-muted)]'
              : increased
                ? 'text-[var(--fo-danger)]'
                : 'text-emerald-400';

            return (
              <motion.div
                key={item.category_name}
                className="fo-card"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.15, delay: i * 0.03 }}
              >
                <div className="fo-space-between">
                  <div>
                    <span className="text-sm text-[var(--fo-text)] font-medium">
                      {item.category_name}
                    </span>
                    <div className="fo-row mt-1">
                      <span className="text-xs text-[var(--fo-muted)] tabular-nums">
                        {fmt.format(item.previous)}
                      </span>
                      <span className="text-xs text-[var(--fo-muted)]">
                        →
                      </span>
                      <span
                        className="text-xs tabular-nums font-medium"
                        style={{ fontVariantNumeric: 'tabular-nums' }}
                      >
                        {fmt.format(item.current)}
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className={`fo-row ${colorClass}`}>
                      <DeltaIcon size={14} />
                      <span
                        className="text-sm font-semibold tabular-nums"
                        style={{ fontVariantNumeric: 'tabular-nums' }}
                      >
                        {fmt.format(Math.abs(item.delta))}
                      </span>
                    </div>
                    {!unchanged && (
                      <span
                        className={`text-xs tabular-nums ${colorClass}`}
                        style={{ fontVariantNumeric: 'tabular-nums' }}
                      >
                        {pctFmt.format(item.delta_pct)}
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </ChartContainer>
  );
}

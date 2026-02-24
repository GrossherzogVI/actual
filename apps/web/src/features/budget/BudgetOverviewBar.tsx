import type { BudgetSummary } from '../../core/types/finance';
import { computePercentage, getProgressColor, formatEur } from './budget-utils';

type BudgetOverviewBarProps = {
  summary: BudgetSummary;
};

export function BudgetOverviewBar({ summary }: BudgetOverviewBarProps) {
  const { total_budgeted, total_spent, total_remaining, envelope_count } =
    summary;

  const percentage = computePercentage(total_spent, total_budgeted);
  const barColor = getProgressColor(percentage);
  const barWidth = `${Math.min(percentage, 100)}%`;

  return (
    <div
      className="fo-panel"
      style={{ display: 'grid', gap: 12 }}
    >
      {/* Metrics row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
          gap: 12,
        }}
      >
        <MetricCell
          label="Budgetiert"
          value={formatEur(total_budgeted)}
          accent="var(--fo-text)"
        />
        <MetricCell
          label="Ausgegeben"
          value={formatEur(total_spent)}
          accent={barColor}
        />
        <MetricCell
          label="Verbleibend"
          value={formatEur(total_remaining)}
          accent={
            total_remaining < 0 ? 'var(--fo-danger)' : 'var(--fo-ok)'
          }
        />
        <MetricCell
          label="Budgets aktiv"
          value={String(envelope_count)}
          accent="var(--fo-muted)"
        />
      </div>

      {/* Progress bar */}
      <div>
        <div className="fo-space-between" style={{ marginBottom: 4 }}>
          <span className="text-xs text-[var(--fo-muted)]">Gesamtfortschritt</span>
          <span
            className="text-xs tabular-nums font-medium"
            style={{ color: barColor, fontVariantNumeric: 'tabular-nums' }}
          >
            {percentage.toFixed(1)} %
          </span>
        </div>
        <div
          style={{
            height: 8,
            borderRadius: 4,
            background: 'rgba(255,255,255,0.06)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: barWidth,
              borderRadius: 4,
              background: barColor,
              transition: 'width 0.5s ease, background 0.3s ease',
            }}
          />
        </div>
      </div>
    </div>
  );
}

function MetricCell({
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

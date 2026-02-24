import { Trash2 } from 'lucide-react';

import type { BudgetEnvelopeData } from '../../core/types/finance';
import { getProgressColor, formatEur } from './budget-utils';
import { BudgetProgressRing } from './BudgetProgressRing';

type BudgetEnvelopeProps = {
  envelope: BudgetEnvelopeData;
  onEdit: (envelope: BudgetEnvelopeData) => void;
  onDelete: (id: string) => void;
};

export function BudgetEnvelope({
  envelope,
  onEdit,
  onDelete,
}: BudgetEnvelopeProps) {
  const { category_name, amount, spent, remaining, percentage } = envelope;
  const barColor = getProgressColor(percentage);
  const barWidth = `${Math.min(percentage, 100)}%`;
  const isOver = percentage >= 100;

  function handleDeleteClick(e: React.MouseEvent) {
    e.stopPropagation();
    onDelete(envelope.id);
  }

  return (
    <button
      type="button"
      className="fo-card text-left cursor-pointer"
      style={{ display: 'grid', gap: 10, position: 'relative' }}
      onClick={() => onEdit(envelope)}
    >
      {/* Top row: category name + ring */}
      <div className="fo-space-between" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Category name with color dot */}
          <div className="fo-row" style={{ gap: 6, marginBottom: 2 }}>
            <span
              className="inline-block w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: barColor, marginTop: 1 }}
            />
            <span
              className="text-sm font-medium truncate"
              style={{ color: 'var(--fo-text)' }}
            >
              {category_name}
            </span>
          </div>

          {/* Spent / budgeted label */}
          <div
            className="text-xs tabular-nums"
            style={{
              color: 'var(--fo-muted)',
              fontVariantNumeric: 'tabular-nums',
              paddingLeft: 14,
            }}
          >
            {formatEur(spent)} von {formatEur(amount)}
          </div>
        </div>

        {/* Progress ring */}
        <div style={{ flexShrink: 0, marginLeft: 8 }}>
          <BudgetProgressRing percentage={percentage} size={52} />
        </div>
      </div>

      {/* Progress bar */}
      <div
        style={{
          height: 6,
          borderRadius: 3,
          background: 'rgba(255,255,255,0.06)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: barWidth,
            borderRadius: 3,
            background: barColor,
            transition: 'width 0.5s ease, background 0.3s ease',
          }}
        />
      </div>

      {/* Bottom row: remaining + delete */}
      <div className="fo-space-between" style={{ alignItems: 'center' }}>
        <span
          className="text-xs tabular-nums"
          style={{
            color: isOver ? 'var(--fo-danger)' : 'var(--fo-muted)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {isOver
            ? `${formatEur(Math.abs(remaining))} überschritten`
            : `${formatEur(remaining)} verbleibend`}
        </span>

        {/* Delete button — subtle, only visible on hover via opacity */}
        <button
          type="button"
          aria-label={`Budget "${category_name}" löschen`}
          onClick={handleDeleteClick}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--fo-muted)',
            padding: '2px 4px',
            borderRadius: 4,
            opacity: 0.5,
            transition: 'opacity 0.15s, color 0.15s',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.opacity = '1';
            (e.currentTarget as HTMLButtonElement).style.color =
              'var(--fo-danger)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.opacity = '0.5';
            (e.currentTarget as HTMLButtonElement).style.color =
              'var(--fo-muted)';
          }}
        >
          <Trash2 size={13} />
        </button>
      </div>
    </button>
  );
}

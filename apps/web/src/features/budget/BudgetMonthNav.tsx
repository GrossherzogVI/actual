import { useEffect } from 'react';

import { ChevronLeft, ChevronRight } from 'lucide-react';

import { formatMonth, getAdjacentMonth } from './budget-utils';

type BudgetMonthNavProps = {
  month: string;
  onChange: (month: string) => void;
};

export function BudgetMonthNav({ month, onChange }: BudgetMonthNavProps) {
  const prevMonth = getAdjacentMonth(month, -1);
  const nextMonth = getAdjacentMonth(month, 1);

  // Keyboard arrow support
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Only fire when no input/select/textarea is focused
      const tag = (e.target as HTMLElement).tagName.toLowerCase();
      if (tag === 'input' || tag === 'select' || tag === 'textarea') return;

      if (e.key === 'ArrowLeft') {
        onChange(prevMonth);
      } else if (e.key === 'ArrowRight') {
        onChange(nextMonth);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [prevMonth, nextMonth, onChange]);

  return (
    <div
      className="fo-row fo-space-between"
      style={{ alignItems: 'center', gap: 12 }}
    >
      <button
        type="button"
        aria-label={`Vorheriger Monat: ${formatMonth(prevMonth)}`}
        className="fo-btn-secondary"
        style={{ padding: '6px 10px', borderRadius: 8 }}
        onClick={() => onChange(prevMonth)}
      >
        <ChevronLeft size={16} />
      </button>

      <h2
        style={{
          margin: 0,
          fontSize: 16,
          fontWeight: 600,
          color: 'var(--fo-text)',
          textAlign: 'center',
          minWidth: 160,
        }}
      >
        {formatMonth(month)}
      </h2>

      <button
        type="button"
        aria-label={`Naechster Monat: ${formatMonth(nextMonth)}`}
        className="fo-btn-secondary"
        style={{ padding: '6px 10px', borderRadius: 8 }}
        onClick={() => onChange(nextMonth)}
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

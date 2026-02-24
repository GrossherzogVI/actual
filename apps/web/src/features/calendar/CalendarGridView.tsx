import { motion } from 'motion/react';

import { AmountDisplay } from '../finance/AmountDisplay';
import type { CalendarDay } from './useCalendarData';

type CalendarGridViewProps = {
  days: CalendarDay[];
  year: number;
  month: number; // 0-indexed
};

const WEEKDAY_HEADERS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] as const;

function toDateString(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function getTodayStr(): string {
  const now = new Date();
  return toDateString(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * Returns the ISO weekday for the first day of the month.
 * Monday = 0, Sunday = 6 (shifted from JS's Sunday = 0).
 */
function getFirstWeekday(year: number, month: number): number {
  const d = new Date(year, month, 1).getDay();
  return d === 0 ? 6 : d - 1;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

type CellData = {
  day: number;
  dateStr: string;
  calendarDay: CalendarDay | undefined;
  isToday: boolean;
  isWeekend: boolean;
};

function buildGrid(
  year: number,
  month: number,
  dayMap: Map<string, CalendarDay>,
): (CellData | null)[] {
  const firstWeekday = getFirstWeekday(year, month);
  const daysInMonth = getDaysInMonth(year, month);
  const todayStr = getTodayStr();
  const cells: (CellData | null)[] = [];

  // Leading empty cells
  for (let i = 0; i < firstWeekday; i++) {
    cells.push(null);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = toDateString(year, month, d);
    const colIndex = (firstWeekday + d - 1) % 7;
    cells.push({
      day: d,
      dateStr,
      calendarDay: dayMap.get(dateStr),
      isToday: dateStr === todayStr,
      isWeekend: colIndex >= 5,
    });
  }

  return cells;
}

function getCellStyle(
  cell: CellData,
): { borderColor: string; bg: string } {
  if (cell.isToday) {
    return {
      borderColor: 'rgba(59, 130, 246, 0.5)',
      bg: 'rgba(59, 130, 246, 0.06)',
    };
  }
  if (!cell.calendarDay || cell.calendarDay.payments.length === 0) {
    return {
      borderColor: cell.isWeekend ? 'var(--fo-border)' : 'var(--fo-border)',
      bg: cell.isWeekend ? 'var(--fo-bg)' : 'var(--fo-bg-2)',
    };
  }

  const total = cell.calendarDay.payments.reduce(
    (sum, p) => sum + p.amount,
    0,
  );

  if (total > 0) {
    return {
      borderColor: 'rgba(16, 185, 129, 0.35)',
      bg: 'rgba(16, 185, 129, 0.05)',
    };
  }
  if (total < -200) {
    return {
      borderColor: 'rgba(239, 68, 68, 0.35)',
      bg: 'rgba(239, 68, 68, 0.05)',
    };
  }
  if (total < 0) {
    return {
      borderColor: 'rgba(245, 158, 11, 0.35)',
      bg: 'rgba(245, 158, 11, 0.05)',
    };
  }
  return { borderColor: 'var(--fo-border)', bg: 'var(--fo-bg-2)' };
}

export function CalendarGridView({ days, year, month }: CalendarGridViewProps) {
  const dayMap = new Map<string, CalendarDay>();
  for (const d of days) {
    dayMap.set(d.date, d);
  }

  const cells = buildGrid(year, month, dayMap);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      {/* Weekday headers */}
      <div
        className="grid gap-1.5 mb-1.5"
        style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}
      >
        {WEEKDAY_HEADERS.map(day => (
          <div
            key={day}
            className="text-center text-xs font-medium text-[var(--fo-muted)] py-1"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div
        className="grid gap-1.5"
        style={{ gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}
      >
        {cells.map((cell, i) => {
          if (!cell) {
            return <div key={`empty-${i}`} />;
          }

          const style = getCellStyle(cell);
          const paymentCount = cell.calendarDay?.payments.length ?? 0;
          const total = cell.calendarDay
            ? cell.calendarDay.payments.reduce((sum, p) => sum + p.amount, 0)
            : 0;

          return (
            <motion.div
              key={cell.dateStr}
              className="rounded-lg p-2 text-center transition-all"
              style={{
                border: `1px solid ${style.borderColor}`,
                background: style.bg,
                minHeight: 72,
                opacity: cell.isWeekend && paymentCount === 0 ? 0.6 : 1,
              }}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: cell.isWeekend && paymentCount === 0 ? 0.6 : 1, scale: 1 }}
              transition={{ duration: 0.1, delay: i * 0.008 }}
            >
              {/* Date number */}
              <div
                className={`text-sm font-medium mb-1 ${
                  cell.isToday
                    ? 'text-blue-400 font-semibold'
                    : 'text-[var(--fo-text)]'
                }`}
              >
                {cell.day}
              </div>

              {/* Payment summary */}
              {paymentCount > 0 && (
                <>
                  <AmountDisplay amount={total} size="sm" />
                  <div
                    className="mt-1 text-[10px] font-medium text-[var(--fo-muted)]"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {paymentCount} {paymentCount === 1 ? 'Zahlung' : 'Zahlungen'}
                  </div>
                </>
              )}
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}

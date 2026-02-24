import { useMemo, useState } from 'react';

import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Grid3x3,
  List,
} from 'lucide-react';
import { motion } from 'motion/react';

import { AmountDisplay } from '../finance/AmountDisplay';
import { CalendarGridView } from './CalendarGridView';
import { CalendarListView } from './CalendarListView';
import { useCalendarData } from './useCalendarData';

type ViewMode = 'list' | 'grid';

const MONTH_FORMATTER = new Intl.DateTimeFormat('de-DE', {
  month: 'long',
  year: 'numeric',
});

function addMonths(d: Date, n: number): Date {
  const result = new Date(d);
  result.setMonth(result.getMonth() + n);
  return result;
}

export function CalendarPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [baseDate, setBaseDate] = useState(() => new Date());

  // Compute range based on view mode
  const { rangeStart, rangeEnd, year, month } = useMemo(() => {
    if (viewMode === 'list') {
      // 30-day view from today (or navigated base)
      const start = new Date(
        baseDate.getFullYear(),
        baseDate.getMonth(),
        baseDate.getDate(),
      );
      const end = new Date(start);
      end.setDate(end.getDate() + 30);
      return {
        rangeStart: start,
        rangeEnd: end,
        year: start.getFullYear(),
        month: start.getMonth(),
      };
    }
    // Grid: full month
    const y = baseDate.getFullYear();
    const m = baseDate.getMonth();
    const start = new Date(y, m, 1);
    const end = new Date(y, m + 1, 0); // last day of month
    return { rangeStart: start, rangeEnd: end, year: y, month: m };
  }, [viewMode, baseDate]);

  const { days, totalBalance, loading } = useCalendarData(
    rangeStart,
    rangeEnd,
  );

  // Summary stats
  const summary = useMemo(() => {
    const totalPayments = days.reduce(
      (sum, d) => sum + d.payments.reduce((s, p) => s + p.amount, 0),
      0,
    );
    const paymentCount = days.reduce(
      (sum, d) => sum + d.payments.length,
      0,
    );
    return { totalPayments, paymentCount };
  }, [days]);

  function navigatePrev() {
    if (viewMode === 'list') {
      setBaseDate(prev => {
        const d = new Date(prev);
        d.setDate(d.getDate() - 30);
        return d;
      });
    } else {
      setBaseDate(prev => addMonths(prev, -1));
    }
  }

  function navigateNext() {
    if (viewMode === 'list') {
      setBaseDate(prev => {
        const d = new Date(prev);
        d.setDate(d.getDate() + 30);
        return d;
      });
    } else {
      setBaseDate(prev => addMonths(prev, 1));
    }
  }

  function navigateToday() {
    setBaseDate(new Date());
  }

  const periodLabel =
    viewMode === 'grid'
      ? MONTH_FORMATTER.format(new Date(year, month, 1))
      : `${rangeStart.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })} – ${rangeEnd.toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' })}`;

  // Loading skeleton
  if (loading) {
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
            <h2>Zahlungskalender</h2>
          </header>
          <div className="fo-stack">
            {Array.from({ length: 6 }, (_, i) => (
              <div
                key={i}
                className="h-14 rounded-md bg-[var(--fo-bg)] animate-pulse"
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
        <div className="fo-metric-card">
          <span
            className="text-lg font-semibold tabular-nums text-[var(--fo-text)]"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            <AmountDisplay amount={totalBalance} size="lg" />
          </span>
          <span className="text-xs text-[var(--fo-muted)]">Kontostand</span>
        </div>
        <div className="fo-metric-card">
          <AmountDisplay amount={summary.totalPayments} size="lg" />
          <span className="text-xs text-[var(--fo-muted)]">
            Summe Zahlungen
          </span>
        </div>
        <div className="fo-metric-card">
          <span
            className="text-lg font-semibold tabular-nums text-[var(--fo-text)]"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {summary.paymentCount}
          </span>
          <span className="text-xs text-[var(--fo-muted)]">
            Zahlungen
          </span>
        </div>
      </div>

      {/* Main panel */}
      <section className="fo-panel">
        <header className="fo-panel-header">
          <div className="fo-space-between">
            <div className="fo-row">
              <CalendarDays
                size={16}
                className="text-[var(--fo-muted)]"
              />
              <h2>Zahlungskalender</h2>
            </div>

            {/* View mode toggle + navigation */}
            <div className="fo-row">
              {/* Today button */}
              <button
                type="button"
                className="fo-btn-secondary text-xs"
                style={{ padding: '4px 10px', fontSize: 12 }}
                onClick={navigateToday}
              >
                Heute
              </button>

              {/* Navigation */}
              <button
                type="button"
                className="fo-btn-secondary"
                style={{ padding: '4px 6px' }}
                onClick={navigatePrev}
                aria-label="Zurueck"
              >
                <ChevronLeft size={16} />
              </button>
              <span
                className="text-sm font-medium text-[var(--fo-text)] min-w-[160px] text-center"
              >
                {periodLabel}
              </span>
              <button
                type="button"
                className="fo-btn-secondary"
                style={{ padding: '4px 6px' }}
                onClick={navigateNext}
                aria-label="Weiter"
              >
                <ChevronRight size={16} />
              </button>

              {/* Separator */}
              <div className="w-px h-5 bg-[var(--fo-border)]" />

              {/* View toggle */}
              <div className="fo-row" style={{ gap: 2 }}>
                <button
                  type="button"
                  className={`fo-chip ${viewMode === 'list' ? 'fo-chip-active' : ''}`}
                  style={{ fontSize: 11, padding: '4px 8px' }}
                  onClick={() => setViewMode('list')}
                >
                  <List size={12} className="inline mr-1" />
                  30 Tage
                </button>
                <button
                  type="button"
                  className={`fo-chip ${viewMode === 'grid' ? 'fo-chip-active' : ''}`}
                  style={{ fontSize: 11, padding: '4px 8px' }}
                  onClick={() => setViewMode('grid')}
                >
                  <Grid3x3 size={12} className="inline mr-1" />
                  Monat
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Calendar content */}
        {viewMode === 'list' ? (
          <CalendarListView days={days} totalBalance={totalBalance} />
        ) : (
          <CalendarGridView days={days} year={year} month={month} />
        )}
      </section>
    </motion.div>
  );
}

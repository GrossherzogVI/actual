import {
  CalendarCheck,
  FileText,
  Receipt,
  Timer,
} from 'lucide-react';
import { motion } from 'motion/react';

import { AmountDisplay } from '../finance/AmountDisplay';
import type { CalendarDay, Payment } from './useCalendarData';

type CalendarListViewProps = {
  days: CalendarDay[];
  totalBalance: number;
};

const SOURCE_CONFIG: Record<
  Payment['source'],
  { icon: typeof FileText; label: string; colorClass: string }
> = {
  contract: {
    icon: FileText,
    label: 'Vertrag',
    colorClass: 'text-amber-400',
  },
  schedule: {
    icon: Timer,
    label: 'Geplant',
    colorClass: 'text-blue-400',
  },
  transaction: {
    icon: Receipt,
    label: 'Transaktion',
    colorClass: 'text-emerald-400',
  },
};

const DAY_FORMATTER = new Intl.DateTimeFormat('de-DE', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

function formatDayHeader(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return DAY_FORMATTER.format(d);
}

function isToday(dateStr: string): boolean {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return dateStr === `${y}-${m}-${d}`;
}

function isPast(dateStr: string): boolean {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return dateStr < `${y}-${m}-${d}`;
}

export function CalendarListView({ days }: CalendarListViewProps) {
  if (days.length === 0) {
    return (
      <div className="fo-card text-center py-8">
        <CalendarCheck
          size={24}
          className="mx-auto mb-2 text-[var(--fo-muted)]"
        />
        <p className="text-sm text-[var(--fo-muted)]">
          Keine Zahlungen in diesem Zeitraum.
        </p>
      </div>
    );
  }

  return (
    <div className="fo-stack">
      {days.map((day, i) => {
        const today = isToday(day.date);
        const past = isPast(day.date);
        const dayTotal = day.payments.reduce((sum, p) => sum + p.amount, 0);

        return (
          <motion.div
            key={day.date}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15, delay: i * 0.02 }}
          >
            {/* Day header */}
            <div
              className={`flex items-center justify-between mb-2 ${
                today ? 'pb-2 border-b border-b-blue-500/40' : ''
              }`}
            >
              <div className="fo-row">
                {today && (
                  <span className="text-xs font-semibold text-blue-400 bg-blue-500/10 border border-blue-500/30 rounded px-1.5 py-0.5">
                    Heute
                  </span>
                )}
                <span
                  className={`text-sm font-medium ${
                    past && !today
                      ? 'text-[var(--fo-muted)]'
                      : 'text-[var(--fo-text)]'
                  }`}
                >
                  {formatDayHeader(day.date)}
                </span>
              </div>
              <div className="fo-row">
                <AmountDisplay amount={dayTotal} size="sm" />
                <span className="text-xs text-[var(--fo-muted)] tabular-nums ml-2">
                  Saldo:{' '}
                  <AmountDisplay amount={day.runningBalance} size="sm" />
                </span>
              </div>
            </div>

            {/* Payments list */}
            <div className="fo-stack">
              {day.payments.map(payment => {
                const cfg = SOURCE_CONFIG[payment.source];
                const Icon = cfg.icon;

                return (
                  <div
                    key={payment.id}
                    className={`fo-card ${past && !today ? 'opacity-60' : ''}`}
                  >
                    <div className="fo-space-between">
                      <div className="fo-row min-w-0">
                        <Icon
                          size={14}
                          className={`shrink-0 ${cfg.colorClass}`}
                        />
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">
                            {payment.name}
                          </div>
                          {payment.provider && (
                            <div className="text-xs text-[var(--fo-muted)] truncate">
                              {payment.provider}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="fo-row shrink-0">
                        <AmountDisplay amount={payment.amount} size="sm" />
                        <span
                          className={`text-[10px] font-medium px-1.5 py-0.5 rounded border border-[var(--fo-border)] ${cfg.colorClass}`}
                        >
                          {cfg.label}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

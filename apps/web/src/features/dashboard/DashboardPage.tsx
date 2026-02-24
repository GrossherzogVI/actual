import { useQuery } from '@tanstack/react-query';
import {
  type LucideIcon,
  CalendarDays,
  ClipboardCheck,
  FileText,
} from 'lucide-react';
import { motion } from 'motion/react';

import { getDashboardPulse } from '../../core/api/finance-api';
import { IntelligenceInsights } from '../intelligence';

import { AccountBalancesWidget } from './AccountBalancesWidget';
import { AvailableToSpendWidget } from './AvailableToSpendWidget';
import { BalanceProjectionWidget } from './BalanceProjectionWidget';
import { CashRunwayWidget } from './CashRunwayWidget';
import { DashboardGrid, DEFAULT_LAYOUT, layoutStyle } from './DashboardGrid';
import { HealthScoreWidget } from './HealthScoreWidget';
import { MoneyPulseWidget } from './MoneyPulseWidget';
import { ThisMonthWidget } from './ThisMonthWidget';
import { UpcomingPaymentsWidget } from './UpcomingPaymentsWidget';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return 'Gute Nacht';
  if (hour < 12) return 'Guten Morgen';
  if (hour < 18) return 'Guten Tag';
  return 'Guten Abend';
}

function formatDate(): string {
  return new Intl.DateTimeFormat('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());
}

export function DashboardPage() {
  const { data: pulse, isLoading: pulseLoading } = useQuery({
    queryKey: ['dashboard-pulse'],
    queryFn: getDashboardPulse,
  });

  return (
    <motion.div
      className="p-5 h-full overflow-auto"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      {/* Header */}
      <motion.header
        className="mb-6"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        <div className="fo-space-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight m-0">
              {getGreeting()}
            </h1>
            <p className="text-sm text-[var(--fo-muted)] m-0 mt-1">
              {formatDate()}
            </p>
          </div>
          <div className="fo-row">
            <PulseBadge
              icon={ClipboardCheck}
              value={pulseLoading ? null : (pulse?.pending_reviews ?? 0)}
              label="Reviews"
            />
            <PulseBadge
              icon={FileText}
              value={pulseLoading ? null : (pulse?.active_contracts ?? 0)}
              label="Vertraege"
            />
            <PulseBadge
              icon={CalendarDays}
              value={
                pulseLoading
                  ? null
                  : (pulse?.upcoming_payments?.length ?? 0)
              }
              label="Zahlungen"
            />
          </div>
        </div>
      </motion.header>

      {/* Widget Grid — 12 column layout */}
      <DashboardGrid>
        <div style={layoutStyle(DEFAULT_LAYOUT[0])}>
          <MoneyPulseWidget />
        </div>
        <div style={layoutStyle(DEFAULT_LAYOUT[1])}>
          <AccountBalancesWidget />
        </div>
        <div style={layoutStyle(DEFAULT_LAYOUT[2])}>
          <ThisMonthWidget />
        </div>
        <div style={layoutStyle(DEFAULT_LAYOUT[3])}>
          <CashRunwayWidget />
        </div>
        <div style={layoutStyle(DEFAULT_LAYOUT[4])}>
          <AvailableToSpendWidget />
        </div>
        <div style={layoutStyle(DEFAULT_LAYOUT[5])}>
          <BalanceProjectionWidget />
        </div>
        <div style={layoutStyle(DEFAULT_LAYOUT[6])}>
          <UpcomingPaymentsWidget />
        </div>
        <div style={layoutStyle(DEFAULT_LAYOUT[7])}>
          <HealthScoreWidget />
        </div>
        {/* Intelligence insights spans full width below */}
        <div style={{ gridColumn: '1 / -1' }}>
          <IntelligenceInsights />
        </div>
      </DashboardGrid>
    </motion.div>
  );
}

// -- Pulse Badge (header KPI chip) --

type PulseBadgeProps = {
  icon: LucideIcon;
  value: number | null;
  label: string;
};

function PulseBadge({ icon: Icon, value, label }: PulseBadgeProps) {
  return (
    <div className="fo-card flex items-center gap-2 px-3 py-2">
      <Icon size={14} className="text-[var(--fo-muted)]" />
      <div className="text-right">
        {value === null ? (
          <div className="w-6 h-4 rounded bg-[var(--fo-bg)] animate-pulse" />
        ) : (
          <strong
            className="text-sm tabular-nums"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {value}
          </strong>
        )}
        <div className="text-xs text-[var(--fo-muted)]">{label}</div>
      </div>
    </div>
  );
}

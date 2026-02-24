import { useQuery } from '@tanstack/react-query';
import { Activity } from 'lucide-react';
import { motion } from 'motion/react';

import { getDashboardPulse, getThisMonth } from '../../core/api/finance-api';

type ScoreTier = {
  label: string;
  colorClass: string;
  ringColor: string;
};

function getScoreTier(score: number): ScoreTier {
  if (score >= 80) {
    return {
      label: 'Gut',
      colorClass: 'text-emerald-400',
      ringColor: '#34d399',
    };
  }
  if (score >= 60) {
    return {
      label: 'Okay',
      colorClass: 'text-amber-400',
      ringColor: '#fbbf24',
    };
  }
  if (score >= 40) {
    return {
      label: 'Vorsicht',
      colorClass: 'text-orange-400',
      ringColor: '#fb923c',
    };
  }
  return {
    label: 'Kritisch',
    colorClass: 'text-red-400',
    ringColor: '#f87171',
  };
}

function computeScore(
  pulse: Awaited<ReturnType<typeof getDashboardPulse>> | undefined,
  thisMonth: Awaited<ReturnType<typeof getThisMonth>> | undefined,
): number {
  if (!pulse || !thisMonth) return 50;

  let score = 100;

  // --- Cash runway signal ---
  const dayOfMonth = new Date().getDate();
  const dailyBurn = dayOfMonth > 0 && thisMonth.expenses !== 0
    ? Math.abs(thisMonth.expenses) / dayOfMonth
    : 0;
  const runwayDays = dailyBurn > 0 ? pulse.total_balance / dailyBurn : 90;

  if (runwayDays < 0)  score -= 30;
  else if (runwayDays < 14) score -= 20;
  else if (runwayDays < 30) score -= 10;

  // --- Pending reviews ---
  if (pulse.pending_reviews > 10) score -= 15;
  else if (pulse.pending_reviews > 3) score -= 8;
  else if (pulse.pending_reviews > 0) score -= 3;

  // --- Expiring contracts ---
  const expiringCount = pulse.upcoming_payments?.length ?? 0;
  if (expiringCount > 5) score -= 10;
  else if (expiringCount > 2) score -= 5;

  // --- Monthly net signal ---
  if (thisMonth.net < 0) score -= 15;
  else if (thisMonth.net > 0) score += 5;

  return Math.max(0, Math.min(100, Math.round(score)));
}

const RADIUS = 42;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

type ScoreRingProps = {
  score: number;
  ringColor: string;
};

function ScoreRing({ score, ringColor }: ScoreRingProps) {
  const filled = (score / 100) * CIRCUMFERENCE;
  const gap = CIRCUMFERENCE - filled;

  return (
    <svg width="120" height="120" viewBox="0 0 100 100" role="img" aria-label={`Health Score ${score}`}>
      {/* Background track */}
      <circle
        cx="50"
        cy="50"
        r={RADIUS}
        fill="none"
        stroke="var(--fo-border)"
        strokeWidth="8"
      />
      {/* Score arc */}
      <circle
        cx="50"
        cy="50"
        r={RADIUS}
        fill="none"
        stroke={ringColor}
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={`${filled} ${gap}`}
        strokeDashoffset={CIRCUMFERENCE * 0.25} // start at top
        style={{ transition: 'stroke-dasharray 0.6s ease' }}
      />
    </svg>
  );
}

type ScoreFactorProps = {
  label: string;
  ok: boolean;
};

function ScoreFactor({ label, ok }: ScoreFactorProps) {
  return (
    <div className="fo-row">
      <span className={`text-xs ${ok ? 'text-emerald-400' : 'text-red-400'}`}>
        {ok ? '✓' : '✗'}
      </span>
      <small className="text-xs text-[var(--fo-muted)]">{label}</small>
    </div>
  );
}

export function HealthScoreWidget() {
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
        transition={{ duration: 0.25, delay: 0.22 }}
      >
        <header className="fo-panel-header">
          <h2>Finanzgesundheit</h2>
        </header>
        <div className="flex items-center justify-center h-32">
          <div className="w-28 h-28 rounded-full bg-[var(--fo-bg)] animate-pulse" />
        </div>
      </motion.section>
    );
  }

  const score = computeScore(pulse, thisMonth);
  const tier = getScoreTier(score);

  // Derive factor states for display
  const dayOfMonth = new Date().getDate();
  const dailyBurn = dayOfMonth > 0 && (thisMonth?.expenses ?? 0) !== 0
    ? Math.abs(thisMonth?.expenses ?? 0) / dayOfMonth
    : 0;
  const runwayDays = dailyBurn > 0 ? (pulse?.total_balance ?? 0) / dailyBurn : 90;

  return (
    <motion.section
      className="fo-panel"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: 0.22 }}
    >
      <header className="fo-panel-header">
        <div className="fo-row">
          <Activity size={14} className="text-[var(--fo-muted)]" />
          <h2>Finanzgesundheit</h2>
        </div>
      </header>

      <div className="flex items-center gap-5">
        {/* Ring + score number */}
        <div className="relative shrink-0">
          <ScoreRing score={score} ringColor={tier.ringColor} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span
              className={`text-3xl font-bold tabular-nums leading-none ${tier.colorClass}`}
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {score}
            </span>
            <span className={`text-xs font-semibold mt-1 ${tier.colorClass}`}>
              {tier.label}
            </span>
          </div>
        </div>

        {/* Factor breakdown */}
        <div className="fo-stack flex-1">
          <ScoreFactor label="Cash Runway" ok={runwayDays >= 30} />
          <ScoreFactor label="Monatsbilanz positiv" ok={(thisMonth?.net ?? 0) >= 0} />
          <ScoreFactor
            label="Keine offenen Prüfungen"
            ok={(pulse?.pending_reviews ?? 0) === 0}
          />
          <ScoreFactor
            label="Keine ablaufenden Verträge"
            ok={(pulse?.upcoming_payments?.length ?? 0) === 0}
          />
        </div>
      </div>
    </motion.section>
  );
}

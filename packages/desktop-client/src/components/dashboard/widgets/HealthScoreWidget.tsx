import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { WidgetCard } from './WidgetCard';

type HealthComponent = {
  name: string;
  score: number;
  maxScore: number;
  detail: string;
};

type HealthScore = {
  score: number;
  trend: 'up' | 'down' | 'stable';
  components: HealthComponent[];
  generatedAt: string;
};

type Props = {
  healthScore: HealthScore | null;
  loading: boolean;
};

/** SVG circular progress ring */
function ScoreRing({
  score,
  size = 88,
  strokeWidth = 6,
}: {
  score: number;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(100, score));
  const offset = circumference - (progress / 100) * circumference;

  const color =
    score >= 70
      ? theme.noticeTextDark ?? theme.pageTextPositive
      : score >= 40
        ? theme.warningText
        : theme.errorText;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ transform: 'rotate(-90deg)' }}
    >
      {/* Background ring */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={theme.tableRowBackgroundHover}
        strokeWidth={strokeWidth}
      />
      {/* Progress ring */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
    </svg>
  );
}

function TrendArrow({ trend }: { trend: 'up' | 'down' | 'stable' }) {
  if (trend === 'up') return <Text style={{ color: theme.noticeTextDark ?? theme.pageTextPositive }}>↑</Text>;
  if (trend === 'down') return <Text style={{ color: theme.errorText }}>↓</Text>;
  return <Text style={{ color: theme.pageTextSubdued }}>→</Text>;
}

export function HealthScoreWidget({ healthScore, loading }: Props) {
  const { t } = useTranslation();

  const scoreLabel = useMemo(() => {
    if (!healthScore) return null;
    const s = healthScore.score;
    if (s >= 80) return t('Excellent');
    if (s >= 60) return t('Good');
    if (s >= 40) return t('Fair');
    return t('Needs Attention');
  }, [healthScore, t]);

  return (
    <WidgetCard title={t('Financial Health')}>
      {loading ? (
        <Text style={{ color: theme.pageTextSubdued, fontSize: 13 }}>
          {t('Calculating...')}
        </Text>
      ) : healthScore ? (
        <View style={{ alignItems: 'center', gap: 4 }}>
          {/* Score ring with number overlay */}
          <View style={{ position: 'relative', width: 88, height: 88 }}>
            <ScoreRing score={healthScore.score} />
            <View
              style={{
                position: 'absolute',
                inset: 0,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text
                style={{
                  fontSize: 24,
                  fontWeight: 700,
                  color: theme.pageText,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {healthScore.score}
              </Text>
            </View>
          </View>

          {/* Label + trend */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: theme.pageText,
              }}
            >
              {scoreLabel}
            </Text>
            <TrendArrow trend={healthScore.trend} />
          </View>

          {/* Component breakdown */}
          <View style={{ width: '100%', marginTop: 4, gap: 2 }}>
            {healthScore.components.map(c => (
              <View
                key={c.name}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingLeft: 4,
                  paddingRight: 4,
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    color: theme.pageTextSubdued,
                  }}
                >
                  {c.name}
                </Text>
                <Text
                  style={{
                    fontSize: 11,
                    color: theme.pageText,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {c.score}/{c.maxScore}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : (
        <Text style={{ color: theme.pageTextSubdued, fontSize: 13 }}>
          {t('No health data available.')}
        </Text>
      )}
    </WidgetCard>
  );
}

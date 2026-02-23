import type { CSSProperties, ReactNode } from 'react';

import { commandCenterTokens } from '../tokens/command-center';
import { semanticTokens, type StatusTone } from '../tokens/semantic';
import { typographyTokens } from '../tokens/typography';

type Size = 'xs' | 'sm' | 'md' | 'lg';
type Density = 'compact' | 'comfortable';
type Trend = 'up' | 'down' | 'flat';

type MetricCardProps = {
  label: string;
  value: ReactNode;
  trend?: Trend;
  trendLabel?: string;
  tone?: StatusTone;
  size?: Size;
  density?: Density;
  className?: string;
  style?: CSSProperties;
};

const valueSizeBySize: Record<Size, number> = {
  xs: typographyTokens.size.lg,
  sm: typographyTokens.size.xl,
  md: typographyTokens.size['2xl'],
  lg: typographyTokens.size['2xl'] + 8, // one step above 2xl (32px)
};

const trendArrow: Record<Trend, string> = {
  up: '↑',
  down: '↓',
  flat: '→',
};

const trendTone: Record<Trend, StatusTone> = {
  up: 'success',
  down: 'danger',
  flat: 'neutral',
};

export function MetricCard({
  label,
  value,
  trend,
  trendLabel,
  tone = 'neutral',
  size = 'md',
  density = 'comfortable',
  className,
  style,
}: MetricCardProps) {
  const padding = density === 'compact' ? 10 : 14;
  const toneColors = semanticTokens.status[tone];
  const effectiveTrend = trend ?? 'flat';

  return (
    <div
      className={className}
      style={{
        background: commandCenterTokens.color.panel,
        border: `1px solid ${commandCenterTokens.color.border}`,
        borderRadius: commandCenterTokens.radius.md,
        padding,
        display: 'flex',
        flexDirection: 'column',
        gap: density === 'compact' ? 4 : 6,
        ...style,
      }}
    >
      <span
        style={{
          fontSize: typographyTokens.size.sm,
          fontFamily: typographyTokens.family.ui,
          color: commandCenterTokens.color.textMuted,
          fontWeight: typographyTokens.weight.medium,
          textTransform: 'uppercase',
          letterSpacing: typographyTokens.letterSpacing.wider,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: valueSizeBySize[size],
          fontFamily: typographyTokens.family.mono,
          color: tone !== 'neutral' ? toneColors.text : commandCenterTokens.color.text,
          fontWeight: typographyTokens.weight.bold,
          lineHeight: 1.2,
        }}
      >
        {value}
      </span>
      {trend && trendLabel ? (
        <span
          style={{
            fontSize: typographyTokens.size.sm,
            fontFamily: typographyTokens.family.ui,
            color: semanticTokens.status[trendTone[effectiveTrend]].text,
          }}
        >
          {trendArrow[effectiveTrend]} {trendLabel}
        </span>
      ) : null}
    </div>
  );
}

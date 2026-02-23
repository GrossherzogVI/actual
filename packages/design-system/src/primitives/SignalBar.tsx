import type { CSSProperties } from 'react';

import { semanticTokens, type StatusTone } from '../tokens/semantic';

type Size = 'xs' | 'sm' | 'md' | 'lg';
type Density = 'compact' | 'comfortable';

type SignalBarProps = {
  /** 0-1 signal strength */
  value: number;
  maxBars?: number;
  tone?: StatusTone;
  size?: Size;
  density?: Density;
  className?: string;
  style?: CSSProperties;
};

const barWidthBySize: Record<Size, number> = { xs: 3, sm: 4, md: 5, lg: 6 };
const barHeightBaseBySize: Record<Size, number> = { xs: 8, sm: 10, md: 12, lg: 16 };
const gapByDensity: Record<Density, number> = { compact: 2, comfortable: 3 };

export function SignalBar({
  value,
  maxBars = 5,
  tone = 'info',
  size = 'sm',
  density = 'comfortable',
  className,
  style,
}: SignalBarProps) {
  const clamped = Math.max(0, Math.min(1, value));
  const activeBars = Math.round(clamped * maxBars);
  const colors = semanticTokens.status[tone];
  const barW = barWidthBySize[size];
  const baseH = barHeightBaseBySize[size];
  const gap = gapByDensity[density];

  return (
    <span
      role="meter"
      aria-valuenow={Math.round(clamped * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'flex-end',
        gap,
        ...style,
      }}
    >
      {Array.from({ length: maxBars }, (_, i) => {
        const active = i < activeBars;
        const heightFraction = (i + 1) / maxBars;
        return (
          <span
            key={i}
            style={{
              width: barW,
              height: Math.round(baseH * heightFraction),
              borderRadius: 2,
              background: active ? colors.text : 'rgba(148, 163, 184, 0.2)',
              flexShrink: 0,
            }}
          />
        );
      })}
    </span>
  );
}

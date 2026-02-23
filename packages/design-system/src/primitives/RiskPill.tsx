import type { CSSProperties } from 'react';

import { semanticTokens } from '../tokens/semantic';
import { typographyTokens } from '../tokens/typography';

type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
type Size = 'xs' | 'sm' | 'md' | 'lg';
type Density = 'compact' | 'comfortable';

type RiskPillProps = {
  level: RiskLevel;
  size?: Size;
  density?: Density;
  showLabel?: boolean;
  className?: string;
  style?: CSSProperties;
};

// critical uses urgency token (brighter red) to visually distinguish from high
const toneByLevel = {
  low: semanticTokens.status.success,
  medium: semanticTokens.status.warn,
  high: semanticTokens.status.danger,
  critical: {
    bg: 'rgba(239, 68, 68, 0.25)',
    text: '#FCA5A5',
    border: 'rgba(239, 68, 68, 0.7)',
  },
} satisfies Record<RiskLevel, { bg: string; text: string; border: string }>;

const labelByLevel: Record<RiskLevel, string> = {
  low: 'Low',
  medium: 'Med',
  high: 'High',
  critical: 'Critical',
};

const fontSizeBySize: Record<Size, number> = {
  xs: 10,
  sm: 11,
  md: 12,
  lg: 13,
};

export function RiskPill({
  level,
  size = 'sm',
  density = 'comfortable',
  showLabel = true,
  className,
  style,
}: RiskPillProps) {
  const colors = toneByLevel[level];
  const isCompact = density === 'compact';

  return (
    <span
      aria-label={!showLabel ? `Risk: ${labelByLevel[level]}` : undefined}
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: isCompact ? '1px 5px' : '2px 7px',
        borderRadius: 999,
        fontSize: fontSizeBySize[size],
        fontFamily: typographyTokens.family.ui,
        fontWeight: typographyTokens.weight.semibold,
        background: colors.bg,
        color: colors.text,
        border: `1px solid ${colors.border}`,
        lineHeight: 1.4,
        textTransform: 'uppercase',
        letterSpacing: typographyTokens.letterSpacing.wider,
        ...style,
      }}
    >
      {showLabel ? labelByLevel[level] : null}
    </span>
  );
}

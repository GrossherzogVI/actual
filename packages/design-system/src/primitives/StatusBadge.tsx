import type { CSSProperties, ReactNode } from 'react';

import { semanticTokens, type StatusTone } from '../tokens/semantic';
import { typographyTokens } from '../tokens/typography';

type Size = 'xs' | 'sm' | 'md' | 'lg';
type Density = 'compact' | 'comfortable';

type StatusBadgeProps = {
  tone?: StatusTone;
  size?: Size;
  density?: Density;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

const fontSizeBySize: Record<Size, number> = {
  xs: typographyTokens.size.xs,
  sm: typographyTokens.size.sm,
  md: typographyTokens.size.base,
  lg: typographyTokens.size.lg,
};

const paddingByDensity: Record<Density, string> = {
  compact: '1px 6px',
  comfortable: '2px 8px',
};

export function StatusBadge({
  tone = 'neutral',
  size = 'sm',
  density = 'comfortable',
  children,
  className,
  style,
}: StatusBadgeProps) {
  const colors = semanticTokens.status[tone];

  return (
    <span
      role="status"
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: paddingByDensity[density],
        borderRadius: 4,
        fontSize: fontSizeBySize[size],
        fontFamily: typographyTokens.family.ui,
        fontWeight: typographyTokens.weight.medium,
        background: colors.bg,
        color: colors.text,
        border: `1px solid ${colors.border}`,
        lineHeight: 1.4,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

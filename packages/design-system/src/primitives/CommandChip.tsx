import type { CSSProperties, ReactNode } from 'react';

import { commandCenterTokens } from '../tokens/command-center';
import { semanticTokens, type StatusTone } from '../tokens/semantic';
import { typographyTokens } from '../tokens/typography';

type Size = 'xs' | 'sm' | 'md' | 'lg';
type Density = 'compact' | 'comfortable';

type CommandChipProps = {
  children: ReactNode;
  tone?: StatusTone;
  size?: Size;
  density?: Density;
  active?: boolean;
  onClick?: () => void;
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
  compact: '2px 6px',
  comfortable: '3px 10px',
};

export function CommandChip({
  children,
  tone = 'neutral',
  size = 'sm',
  density = 'comfortable',
  active = false,
  onClick,
  className,
  style,
}: CommandChipProps) {
  const toneColors = semanticTokens.status[tone];

  return (
    <span
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? e => {
              if (e.key === 'Enter' || e.key === ' ') onClick();
            }
          : undefined
      }
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: paddingByDensity[density],
        borderRadius: 4,
        fontSize: fontSizeBySize[size],
        fontFamily: typographyTokens.family.mono,
        fontWeight: typographyTokens.weight.medium,
        background: active ? toneColors.bg : commandCenterTokens.color.panel,
        color: active ? toneColors.text : commandCenterTokens.color.textMuted,
        border: `1px solid ${active ? toneColors.border : commandCenterTokens.color.border}`,
        cursor: onClick ? 'pointer' : 'default',
        userSelect: 'none',
        transition: 'background 120ms, color 120ms, border-color 120ms',
        outline: 'none',
        // Focus ring is applied via :focus-visible in the browser's UA sheet when role=button;
        // explicit outline reset prevents double-ring on click while preserving keyboard nav.
        ...style,
      }}
    >
      {children}
    </span>
  );
}

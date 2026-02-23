import type { CSSProperties, ReactNode } from 'react';

import { layoutTokens } from '../tokens/layout';

type Size = 'xs' | 'sm' | 'md' | 'lg';
type Density = 'compact' | 'comfortable';

type InlineProps = {
  children: ReactNode;
  size?: Size;
  density?: Density;
  align?: CSSProperties['alignItems'];
  justify?: CSSProperties['justifyContent'];
  wrap?: boolean;
  className?: string;
  style?: CSSProperties;
};

const gapBySize: Record<Size, Record<Density, number>> = {
  xs: { compact: layoutTokens.spacing[1], comfortable: layoutTokens.spacing[2] },
  sm: { compact: layoutTokens.spacing[2], comfortable: layoutTokens.spacing[3] },
  md: { compact: layoutTokens.spacing[3], comfortable: layoutTokens.spacing[4] },
  lg: { compact: layoutTokens.spacing[4], comfortable: layoutTokens.spacing[6] },
};

export function Inline({
  children,
  size = 'sm',
  density = 'comfortable',
  align = 'center',
  justify = 'flex-start',
  wrap = false,
  className,
  style,
}: InlineProps) {
  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'row',
        gap: gapBySize[size][density],
        alignItems: align,
        justifyContent: justify,
        flexWrap: wrap ? 'wrap' : 'nowrap',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

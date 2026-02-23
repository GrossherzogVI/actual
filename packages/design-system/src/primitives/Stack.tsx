import type { CSSProperties, ReactNode } from 'react';

import { layoutTokens } from '../tokens/layout';

type Size = 'xs' | 'sm' | 'md' | 'lg';
type Density = 'compact' | 'comfortable';

type StackProps = {
  children: ReactNode;
  size?: Size;
  density?: Density;
  align?: CSSProperties['alignItems'];
  justify?: CSSProperties['justifyContent'];
  className?: string;
  style?: CSSProperties;
};

const gapBySize: Record<Size, Record<Density, number>> = {
  xs: { compact: layoutTokens.spacing[1], comfortable: layoutTokens.spacing[2] },
  sm: { compact: layoutTokens.spacing[2], comfortable: layoutTokens.spacing[3] },
  md: { compact: layoutTokens.spacing[3], comfortable: layoutTokens.spacing[4] },
  lg: { compact: layoutTokens.spacing[4], comfortable: layoutTokens.spacing[6] },
};

export function Stack({
  children,
  size = 'md',
  density = 'comfortable',
  align = 'stretch',
  justify,
  className,
  style,
}: StackProps) {
  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: gapBySize[size][density],
        alignItems: align,
        justifyContent: justify,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

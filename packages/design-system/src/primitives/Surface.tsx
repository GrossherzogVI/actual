import type { CSSProperties, ReactNode } from 'react';

import { elevationTokens, type ElevationLevel } from '../tokens/elevation';
import { layoutTokens } from '../tokens/layout';

type Density = 'compact' | 'comfortable';
type Size = 'xs' | 'sm' | 'md' | 'lg';

// Maps z-index elevation level to the corresponding surface background
const surfaceByLevel: Record<ElevationLevel, string> = {
  base: elevationTokens.surface.base,
  panel: elevationTokens.surface.raised,
  overlay: elevationTokens.surface.floating,
  commandPalette: elevationTokens.surface.overlay,
  modal: elevationTokens.surface.overlay,
  toast: elevationTokens.surface.floating,
};

type SurfaceProps = {
  children: ReactNode;
  elevation?: ElevationLevel;
  size?: Size;
  density?: Density;
  className?: string;
  style?: CSSProperties;
};

const paddingBySize: Record<Size, Record<Density, number>> = {
  xs: { compact: layoutTokens.spacing[1], comfortable: layoutTokens.spacing[2] },
  sm: { compact: layoutTokens.spacing[2], comfortable: layoutTokens.spacing[3] },
  md: { compact: layoutTokens.spacing[3], comfortable: layoutTokens.spacing[4] },
  lg: { compact: layoutTokens.spacing[4], comfortable: layoutTokens.spacing[6] },
};

export function Surface({
  children,
  elevation = 'panel',
  size = 'md',
  density = 'comfortable',
  className,
  style,
}: SurfaceProps) {
  const padding = paddingBySize[size][density];

  return (
    <div
      className={className}
      style={{
        background: surfaceByLevel[elevation],
        boxShadow: elevationTokens.shadow[elevation],
        zIndex: elevationTokens.zIndex[elevation],
        padding,
        borderRadius: 8,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

import type { CSSProperties } from 'react';

import { commandCenterTokens } from '../tokens/command-center';

type Orientation = 'horizontal' | 'vertical';

type DividerProps = {
  orientation?: Orientation;
  className?: string;
  style?: CSSProperties;
};

export function Divider({
  orientation = 'horizontal',
  className,
  style,
}: DividerProps) {
  const isHorizontal = orientation === 'horizontal';

  return (
    <hr
      className={className}
      style={{
        border: 'none',
        borderTop: isHorizontal
          ? `1px solid ${commandCenterTokens.color.border}`
          : 'none',
        borderLeft: !isHorizontal
          ? `1px solid ${commandCenterTokens.color.border}`
          : 'none',
        margin: 0,
        flexShrink: 0,
        alignSelf: isHorizontal ? 'stretch' : undefined,
        height: isHorizontal ? undefined : 'auto',
        width: !isHorizontal ? undefined : '100%',
        ...style,
      }}
    />
  );
}

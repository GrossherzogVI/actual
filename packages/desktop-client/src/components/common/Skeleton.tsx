import React from 'react';

import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { css, keyframes } from '@emotion/css';

const pulse = keyframes`
  0%   { background-color: ${theme.skeletonBase}; }
  50%  { background-color: ${theme.skeletonHighlight}; }
  100% { background-color: ${theme.skeletonBase}; }
`;

const pulseClass = css({
  animation: `${pulse} 1.6s ease-in-out infinite`,
  borderRadius: 4,
});

type SkeletonLineProps = {
  width?: '100%' | '75%' | '50%' | string;
  height?: number;
};

export function SkeletonLine({ width = '100%', height = 16 }: SkeletonLineProps) {
  return (
    <View
      className={pulseClass}
      style={{
        width,
        height,
        borderRadius: 4,
      }}
    />
  );
}

type SkeletonCardProps = {
  height?: number;
};

export function SkeletonCard({ height = 120 }: SkeletonCardProps) {
  return (
    <View
      style={{
        background: theme.cardBackgroundElevated,
        borderRadius: 8,
        padding: 16,
        height,
        gap: 10,
        justifyContent: 'center',
      }}
    >
      <SkeletonLine width="75%" height={14} />
      <SkeletonLine width="100%" height={14} />
      <SkeletonLine width="50%" height={14} />
    </View>
  );
}

type SkeletonListProps = {
  count?: number;
};

const LINE_WIDTHS: Array<'100%' | '75%' | '50%'> = ['100%', '75%', '50%', '100%', '75%'];

export function SkeletonList({ count = 5 }: SkeletonListProps) {
  return (
    <View style={{ gap: 8 }}>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonLine
          key={i}
          width={LINE_WIDTHS[i % LINE_WIDTHS.length]}
          height={16}
        />
      ))}
    </View>
  );
}

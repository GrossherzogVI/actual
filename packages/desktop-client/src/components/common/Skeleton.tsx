import React from 'react';

import { View } from '@actual-app/components/view';

import { Skeleton } from '@/components/ui/skeleton';

type SkeletonLineProps = {
  width?: '100%' | '75%' | '50%' | string;
  height?: number;
};

export function SkeletonLine({
  width = '100%',
  height = 16,
}: SkeletonLineProps) {
  return <Skeleton style={{ width, height }} className="rounded" />;
}

type SkeletonCardProps = {
  height?: number;
};

export function SkeletonCard({ height = 120 }: SkeletonCardProps) {
  return (
    <div
      className="rounded-xl border border-border bg-card p-4"
      style={{ height }}
    >
      <div className="flex flex-col justify-center gap-2.5 h-full">
        <SkeletonLine width="75%" height={14} />
        <SkeletonLine width="100%" height={14} />
        <SkeletonLine width="50%" height={14} />
      </div>
    </div>
  );
}

type SkeletonListProps = {
  count?: number;
};

const LINE_WIDTHS: Array<'100%' | '75%' | '50%'> = [
  '100%',
  '75%',
  '50%',
  '100%',
  '75%',
];

export function SkeletonList({ count = 5 }: SkeletonListProps) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonLine
          key={i}
          width={LINE_WIDTHS[i % LINE_WIDTHS.length]}
          height={16}
        />
      ))}
    </div>
  );
}

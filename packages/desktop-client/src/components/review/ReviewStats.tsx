// @ts-strict-ignore
import React from 'react';
import { useTranslation } from 'react-i18next';

import { theme } from '@actual-app/components/theme';

import { Badge } from '@/components/ui/badge';

import type { ReviewCount } from './types';

type ReviewStatsProps = {
  counts: ReviewCount;
};

function StatChip({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <Badge
      variant="outline"
      className="gap-1.5 px-3 py-1 text-sm"
      style={{
        borderColor: `${color}40`,
        backgroundColor: `${color}15`,
      }}
    >
      <span className="text-lg font-bold leading-none" style={{ color }}>
        {count}
      </span>
      <span className="text-xs font-medium opacity-85" style={{ color }}>
        {label}
      </span>
    </Badge>
  );
}

export function ReviewStats({ counts }: ReviewStatsProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap gap-2.5 py-3">
      <StatChip
        label={t('Pending')}
        count={counts.pending}
        color={theme.pageTextLight ?? '#64748b'}
      />
      <StatChip label={t('Urgent')} count={counts.urgent} color="#ef4444" />
      <StatChip label={t('Review')} count={counts.review} color="#f59e0b" />
      <StatChip
        label={t('Suggestions')}
        count={counts.suggestion}
        color="#3b82f6"
      />
    </div>
  );
}

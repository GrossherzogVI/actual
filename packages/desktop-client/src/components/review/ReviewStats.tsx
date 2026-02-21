// @ts-strict-ignore
import React from 'react';
import { useTranslation } from 'react-i18next';

import { theme } from '@actual-app/components/theme';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';

import type { ReviewCount } from './types';

type ReviewStatsProps = {
  counts: ReviewCount;
};

type StatChipProps = {
  label: string;
  count: number;
  color: string;
};

function StatChip({ label, count, color }: StatChipProps) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: `${color}15`,
        border: `1px solid ${color}40`,
        borderRadius: 20,
        paddingTop: 5,
        paddingBottom: 5,
        paddingLeft: 12,
        paddingRight: 12,
      }}
    >
      <Text
        style={{
          fontSize: 18,
          fontWeight: 700,
          color,
          lineHeight: '1',
        }}
      >
        {count}
      </Text>
      <Text
        style={{
          fontSize: 12,
          fontWeight: 500,
          color,
          opacity: 0.85,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

export function ReviewStats({ counts }: ReviewStatsProps) {
  const { t } = useTranslation();

  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 10,
        padding: '12px 0',
        flexWrap: 'wrap',
      }}
    >
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
    </View>
  );
}

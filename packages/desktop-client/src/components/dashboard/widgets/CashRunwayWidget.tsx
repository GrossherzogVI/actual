// @ts-strict-ignore
import React from 'react';
import { useTranslation } from 'react-i18next';

import { theme } from '@actual-app/components/theme';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';

import type { ContractSummary } from '../types';
import { WidgetCard } from './WidgetCard';

type Props = {
  summary: ContractSummary | null;
  loading: boolean;
  /** Current account balance in cents (placeholder until account data wired) */
  currentBalanceCents?: number | null;
};

export function CashRunwayWidget({ summary, loading, currentBalanceCents = null }: Props) {
  const { t } = useTranslation();

  let days: number | null = null;
  let untilDate: Date | null = null;

  if (summary?.total_monthly && summary.total_monthly > 0 && currentBalanceCents != null) {
    const dailyCostCents = summary.total_monthly / 30;
    days = Math.floor(currentBalanceCents / dailyCostCents);
    if (days >= 0) {
      untilDate = new Date();
      untilDate.setDate(untilDate.getDate() + days);
    }
  }

  const dateLabel =
    untilDate != null
      ? untilDate.toLocaleDateString('de-DE', { month: 'short', day: 'numeric' })
      : null;

  return (
    <WidgetCard title={t('Cash Runway')}>
      {loading ? (
        <Text style={{ color: theme.pageTextSubdued, fontSize: 13 }}>{t('Loading…')}</Text>
      ) : dateLabel != null && days != null ? (
        <View style={{ alignItems: 'center', paddingTop: 8 }}>
          <Text style={{ fontSize: 28, fontWeight: 700, color: theme.pageText }}>
            {dateLabel}
          </Text>
          <Text style={{ color: theme.pageTextSubdued, fontSize: 13, marginTop: 4 }}>
            {t('{{count}} days remaining', { count: days })}
          </Text>
        </View>
      ) : (
        <Text style={{ color: theme.pageTextSubdued, fontSize: 13 }}>
          {t('Connect account balance to compute runway.')}
        </Text>
      )}
    </WidgetCard>
  );
}

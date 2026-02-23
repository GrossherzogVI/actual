// @ts-strict-ignore
import React from 'react';
import { useTranslation } from 'react-i18next';

import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { WidgetCard } from './WidgetCard';

import { useSheetValue } from '@desktop-client/hooks/useSheetValue';
import { allAccountBalance } from '@desktop-client/spreadsheet/bindings';

import type { ContractSummary } from '@/components/dashboard/types';
import { Badge } from '@/components/ui/badge';

type Props = {
  summary: ContractSummary | null;
  loading: boolean;
};

export function CashRunwayWidget({ summary, loading }: Props) {
  const { t } = useTranslation();

  const totalBalance = useSheetValue<'account', 'accounts-balance'>(
    allAccountBalance(),
  );

  let days: number | null = null;
  let untilDate: Date | null = null;

  if (
    summary?.total_monthly &&
    summary.total_monthly > 0 &&
    totalBalance != null
  ) {
    const dailyCostCents = summary.total_monthly / 30;
    days = Math.floor(totalBalance / dailyCostCents);
    if (days >= 0) {
      untilDate = new Date();
      untilDate.setDate(untilDate.getDate() + days);
    }
  }

  const dateLabel =
    untilDate != null
      ? untilDate.toLocaleDateString('de-DE', {
          month: 'short',
          day: 'numeric',
        })
      : null;

  // Runway health: >90 days = healthy, 30-90 = caution, <30 = critical
  const runwayBadge =
    days != null
      ? days > 90
        ? {
            label: t('Healthy'),
            className:
              'bg-emerald-50 text-emerald-700 border border-emerald-200',
          }
        : days > 30
          ? {
              label: t('Caution'),
              className: 'bg-amber-50 text-amber-700 border border-amber-200',
            }
          : {
              label: t('Critical'),
              className: 'bg-red-50 text-red-700 border border-red-200',
            }
      : null;

  return (
    <WidgetCard title={t('Cash Runway')}>
      {loading ? (
        <Text style={{ color: theme.pageTextSubdued, fontSize: 13 }}>
          {t('Loading...')}
        </Text>
      ) : dateLabel != null && days != null ? (
        <View style={{ alignItems: 'center', paddingTop: 8 }}>
          <Text
            style={{ fontSize: 28, fontWeight: 700, color: theme.pageText }}
          >
            {dateLabel}
          </Text>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              marginTop: 4,
            }}
          >
            <Text style={{ color: theme.pageTextSubdued, fontSize: 13 }}>
              {t('{{count}} days remaining', { count: days })}
            </Text>
            {runwayBadge && (
              <Badge className={runwayBadge.className}>
                {runwayBadge.label}
              </Badge>
            )}
          </View>
        </View>
      ) : (
        <Text style={{ color: theme.pageTextSubdued, fontSize: 13 }}>
          {totalBalance == null
            ? t('Loading balance...')
            : t('Add contracts with costs to compute runway.')}
        </Text>
      )}
    </WidgetCard>
  );
}

// @ts-strict-ignore
import React from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import type { UpcomingPayment } from '@/components/dashboard/types';
import { formatEur } from '@/components/dashboard/utils';

import { WidgetCard } from './WidgetCard';

import { useSheetValue } from '@desktop-client/hooks/useSheetValue';
import { allAccountBalance } from '@desktop-client/spreadsheet/bindings';

import { Badge } from '@/components/ui/badge';

type Props = {
  upcomingPayments: UpcomingPayment[];
  loading?: boolean;
};

export function AvailableToSpendWidget({ upcomingPayments, loading }: Props) {
  const { t } = useTranslation();

  const totalBalance = useSheetValue<'account', 'accounts-balance'>(
    allAccountBalance(),
  );

  const committedCents = upcomingPayments.reduce(
    (sum, p) => (p.amount != null ? sum + Math.abs(p.amount) : sum),
    0,
  );

  const availableCents =
    totalBalance !== null ? totalBalance - committedCents : null;

  const isPositive = availableCents !== null && availableCents >= 0;

  return (
    <WidgetCard title={t('Available to Spend')}>
      {loading ? (
        <Text style={{ color: theme.pageTextSubdued, fontSize: 13 }}>
          <Trans>Loading…</Trans>
        </Text>
      ) : (
        <>
          {/* Hero number with trend badge */}
          <View
            style={{
              marginBottom: 12,
              flexDirection: 'row',
              alignItems: 'baseline',
              gap: 8,
            }}
          >
            <Text
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: isPositive
                  ? theme.noticeText
                  : (theme.errorText ?? '#ef4444'),
                letterSpacing: '-0.5px',
              }}
            >
              {formatEur(availableCents)}
            </Text>
            {availableCents !== null && (
              <Badge
                className={
                  isPositive
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-red-50 text-red-700 border border-red-200'
                }
              >
                {isPositive ? t('Healthy') : t('Low')}
              </Badge>
            )}
          </View>

          {/* Breakdown */}
          <View
            style={{
              borderTop: `1px solid ${theme.tableBorder}`,
              paddingTop: 10,
              gap: 6,
            }}
          >
            <View
              style={{ flexDirection: 'row', justifyContent: 'space-between' }}
            >
              <Text style={{ fontSize: 12, color: theme.pageTextSubdued }}>
                {<Trans>Balance</Trans>}
              </Text>
              <Text style={{ fontSize: 12, fontWeight: 500 }}>
                {formatEur(totalBalance)}
              </Text>
            </View>
            <View
              style={{ flexDirection: 'row', justifyContent: 'space-between' }}
            >
              <Text style={{ fontSize: 12, color: theme.pageTextSubdued }}>
                {<Trans>Committed this month</Trans>}
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: theme.errorText ?? '#ef4444',
                }}
              >
                -{formatEur(committedCents)}
              </Text>
            </View>
          </View>
        </>
      )}
    </WidgetCard>
  );
}

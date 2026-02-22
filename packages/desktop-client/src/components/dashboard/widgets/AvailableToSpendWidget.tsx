// @ts-strict-ignore
import React from 'react';
import { useTranslation } from 'react-i18next';

import { theme } from '@actual-app/components/theme';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';

import { useSheetValue } from '@desktop-client/hooks/useSheetValue';
import { allAccountBalance } from '@desktop-client/spreadsheet/bindings';

import type { UpcomingPayment } from '../types';
import { formatEur } from '../utils';
import { WidgetCard } from './WidgetCard';

type Props = {
  upcomingPayments: UpcomingPayment[];
  loading?: boolean;
};

export function AvailableToSpendWidget({ upcomingPayments, loading }: Props) {
  const { t } = useTranslation();

  const totalBalance = useSheetValue<'account', 'accounts-balance'>(allAccountBalance());

  // Sum all upcoming committed payments (amounts are in cents, may be negative for outflows)
  const committedCents = upcomingPayments.reduce((sum, p) => sum + Math.abs(p.amount), 0);

  const availableCents =
    totalBalance !== null ? totalBalance - committedCents : null;

  const isPositive = availableCents !== null && availableCents >= 0;

  return (
    <WidgetCard title={t('Available to Spend')}>
      {loading ? (
        <Text style={{ color: theme.pageTextSubdued, fontSize: 13 }}>{t('Loading…')}</Text>
      ) : (
        <>
          {/* Hero number */}
          <View style={{ marginBottom: 12 }}>
            <Text
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: isPositive ? theme.noticeText : theme.errorText ?? '#ef4444',
                letterSpacing: '-0.5px',
              }}
            >
              {formatEur(availableCents)}
            </Text>
          </View>

          {/* Breakdown */}
          <View
            style={{
              borderTop: `1px solid ${theme.tableBorder}`,
              paddingTop: 10,
              gap: 6,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 12, color: theme.pageTextSubdued }}>
                {t('Balance')}
              </Text>
              <Text style={{ fontSize: 12, fontWeight: 500 }}>
                {formatEur(totalBalance)}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 12, color: theme.pageTextSubdued }}>
                {t('Committed this month')}
              </Text>
              <Text style={{ fontSize: 12, fontWeight: 500, color: theme.errorText ?? '#ef4444' }}>
                -{formatEur(committedCents)}
              </Text>
            </View>
          </View>
        </>
      )}
    </WidgetCard>
  );
}

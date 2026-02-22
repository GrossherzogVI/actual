// @ts-strict-ignore
import React from 'react';
import { useTranslation } from 'react-i18next';

import { theme } from '@actual-app/components/theme';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';

import { useSheetValue } from '@desktop-client/hooks/useSheetValue';
import { allAccountBalance } from '@desktop-client/spreadsheet/bindings';

import type { UpcomingPayment } from '../types';
import { WidgetCard } from './WidgetCard';

function formatEur(cents: number | null): string {
  if (cents == null) return '--';
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(
    cents / 100,
  );
}

type Props = {
  upcomingPayments?: UpcomingPayment[];
};

/**
 * Compute projected balance at +N days by subtracting upcoming payments
 * that fall within that window.
 */
function projectBalance(
  currentBalance: number,
  payments: UpcomingPayment[],
  daysAhead: number,
): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() + daysAhead);

  let totalOutflow = 0;
  for (const p of payments) {
    const pDate = new Date(p.date + 'T00:00:00');
    if (pDate >= today && pDate <= cutoff && p.amount != null) {
      // Contract amounts are stored as positive costs; subtract them
      totalOutflow += Math.abs(p.amount);
    }
  }

  return currentBalance - totalOutflow;
}

function ProjectionRow({
  label,
  value,
  isNegative,
}: {
  label: string;
  value: string;
  isNegative: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingBottom: 6,
      }}
    >
      <Text style={{ color: theme.pageTextSubdued, fontSize: 13 }}>{label}</Text>
      <Text
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: isNegative ? (theme.errorText ?? '#ef4444') : theme.pageText,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

export function BalanceProjectionWidget({ upcomingPayments = [] }: Props) {
  const { t } = useTranslation();

  // Query-based binding — no SheetNameProvider needed
  const currentBalance = useSheetValue<'account', 'accounts-balance'>(allAccountBalance());

  const hasData = currentBalance != null;

  const projections = hasData
    ? [
        { label: t('Today'), days: 0 },
        { label: t('+7 days'), days: 7 },
        { label: t('+14 days'), days: 14 },
        { label: t('+30 days'), days: 30 },
      ].map(({ label, days }) => {
        const projected =
          days === 0
            ? currentBalance
            : projectBalance(currentBalance, upcomingPayments, days);
        return { label, value: formatEur(projected), isNegative: projected < 0 };
      })
    : [];

  return (
    <WidgetCard title={t('Balance Projection')} style={{ gridColumn: '1 / -1' }}>
      {!hasData ? (
        <Text style={{ color: theme.pageTextSubdued, fontSize: 13 }}>
          {t('Loading balance data...')}
        </Text>
      ) : upcomingPayments.length === 0 ? (
        <View>
          <ProjectionRow
            label={t('Current balance')}
            value={formatEur(currentBalance)}
            isNegative={currentBalance < 0}
          />
          <Text
            style={{
              color: theme.pageTextSubdued,
              fontSize: 12,
              fontStyle: 'italic',
              marginTop: 4,
            }}
          >
            {t('Add contracts to see projected outflows.')}
          </Text>
        </View>
      ) : (
        <View>
          {projections.map(p => (
            <ProjectionRow
              key={p.label}
              label={p.label}
              value={p.value}
              isNegative={p.isNegative}
            />
          ))}
          <Text
            style={{
              color: theme.pageTextSubdued,
              fontSize: 11,
              fontStyle: 'italic',
              marginTop: 4,
            }}
          >
            {t('Based on {{count}} upcoming payments', {
              count: upcomingPayments.length,
            })}
          </Text>
        </View>
      )}
    </WidgetCard>
  );
}

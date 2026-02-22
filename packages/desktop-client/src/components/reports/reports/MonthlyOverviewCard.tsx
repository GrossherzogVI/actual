// @ts-strict-ignore
import React from 'react';
import { useTranslation } from 'react-i18next';

import { theme } from '@actual-app/components/theme';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';

import { useAnalyticsData } from '@desktop-client/components/analytics/hooks/useAnalyticsData';

const EUR = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
});

function formatCents(cents: number): string {
  return EUR.format(cents / 100);
}

export function MonthlyOverviewCard() {
  const { t } = useTranslation();
  const { loading, monthlyTotals } = useAnalyticsData();

  if (loading) {
    return (
      <CardShell title={t('This Month')}>
        <Text style={{ color: theme.pageTextSubdued, fontSize: 12 }}>
          {t('Loading...')}
        </Text>
      </CardShell>
    );
  }

  // Current month is the last entry
  const current = monthlyTotals[monthlyTotals.length - 1];
  if (!current) {
    return (
      <CardShell title={t('This Month')}>
        <Text style={{ color: theme.pageTextSubdued, fontSize: 12 }}>
          {t('No data yet')}
        </Text>
      </CardShell>
    );
  }

  return (
    <CardShell title={t('This Month')}>
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 12, color: theme.pageTextSubdued }}>
            {t('Income')}
          </Text>
          <Text
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: theme.reportsNumberPositive,
            }}
          >
            {formatCents(current.income)}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 12, color: theme.pageTextSubdued }}>
            {t('Expenses')}
          </Text>
          <Text
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: theme.reportsNumberNegative,
            }}
          >
            {formatCents(current.expenses)}
          </Text>
        </View>

        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            paddingTop: 8,
            borderTop: `1px solid ${theme.tableBorder}`,
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: 600, color: theme.pageText }}>
            {t('Net')}
          </Text>
          <Text
            style={{
              fontSize: 14,
              fontWeight: 700,
              color:
                current.net >= 0
                  ? theme.reportsNumberPositive
                  : theme.reportsNumberNegative,
            }}
          >
            {current.net >= 0 ? '+' : ''}
            {formatCents(current.net)}
          </Text>
        </View>
      </View>
    </CardShell>
  );
}

function CardShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View
      style={{
        padding: 12,
        borderRadius: 8,
        border: `1px solid ${theme.tableBorder}`,
        backgroundColor: theme.tableBackground,
        minHeight: 100,
      }}
    >
      <Text
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: theme.pageText,
          marginBottom: 10,
        }}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

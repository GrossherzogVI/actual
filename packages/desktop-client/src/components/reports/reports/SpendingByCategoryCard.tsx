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

export function SpendingByCategoryCard() {
  const { t } = useTranslation();
  const { loading, spendingByCategory, totalSpentThisMonth } =
    useAnalyticsData();

  if (loading) {
    return (
      <CardShell title={t('Top Spending')}>
        <Text style={{ color: theme.pageTextSubdued, fontSize: 12 }}>
          {t('Loading...')}
        </Text>
      </CardShell>
    );
  }

  const top3 = spendingByCategory.slice(0, 3);

  if (top3.length === 0) {
    return (
      <CardShell title={t('Top Spending')}>
        <Text style={{ color: theme.pageTextSubdued, fontSize: 12 }}>
          {t('No data yet')}
        </Text>
      </CardShell>
    );
  }

  const maxAmount = top3[0]?.amount || 1;

  return (
    <CardShell title={t('Top Spending')}>
      <View style={{ gap: 8, flex: 1 }}>
        {top3.map(cat => (
          <View key={cat.id}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                marginBottom: 2,
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  color: theme.pageText,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: 120,
                }}
              >
                {cat.name}
              </Text>
              <Text style={{ fontSize: 11, fontWeight: 600, color: theme.pageText }}>
                {formatCents(cat.amount)}
              </Text>
            </View>
            <View
              style={{
                height: 6,
                borderRadius: 3,
                backgroundColor: theme.tableBorder,
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  width: `${(cat.amount / maxAmount) * 100}%`,
                  height: '100%',
                  borderRadius: 3,
                  backgroundColor: cat.color,
                }}
              />
            </View>
          </View>
        ))}
      </View>

      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          marginTop: 8,
          paddingTop: 8,
          borderTop: `1px solid ${theme.tableBorder}`,
        }}
      >
        <Text style={{ fontSize: 11, color: theme.pageTextSubdued }}>
          {t('Total')}
        </Text>
        <Text
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: theme.errorText,
          }}
        >
          {formatCents(totalSpentThisMonth)}
        </Text>
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
        minHeight: 120,
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

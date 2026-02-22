// @ts-strict-ignore
import React from 'react';
import { useTranslation } from 'react-i18next';

import { theme } from '@actual-app/components/theme';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

import type { AnalyticsData } from './hooks/useAnalyticsData';

const EUR = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
});

function formatCents(cents: number): string {
  return EUR.format(cents / 100);
}

type Props = {
  data: AnalyticsData['spendingByCategory'];
  totalSpent: number;
};

export function SpendingByCategory({ data, totalSpent }: Props) {
  const { t } = useTranslation();

  if (data.length === 0) {
    return (
      <View style={{ padding: 20, alignItems: 'center' }}>
        <Text style={{ color: theme.pageTextSubdued }}>
          {t('No spending data for this month yet.')}
        </Text>
      </View>
    );
  }

  // Show top 12 categories, group rest as "Other"
  const maxBars = 12;
  let chartData = data;
  if (data.length > maxBars) {
    const top = data.slice(0, maxBars - 1);
    const rest = data.slice(maxBars - 1);
    const otherAmount = rest.reduce((s, c) => s + c.amount, 0);
    chartData = [
      ...top,
      {
        id: '__other',
        name: t('Other'),
        groupName: '',
        amount: otherAmount,
        color: '#9ca3af',
      },
    ];
  }

  // Recharts data with display values in EUR (for axis)
  const barData = chartData.map(c => ({
    name: c.name,
    amount: c.amount / 100,
    color: c.color,
    rawAmount: c.amount,
  }));

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1, minHeight: Math.max(300, barData.length * 36) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={barData}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis
              type="number"
              tick={{ fill: theme.pageText, fontSize: 11 }}
              tickFormatter={v => `${v.toLocaleString('de-DE')} €`}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={120}
              tick={{ fill: theme.pageText, fontSize: 11 }}
            />
            <Tooltip
              formatter={(value: number) => [formatCents(value * 100), t('Spent')]}
              contentStyle={{
                backgroundColor: theme.menuBackground,
                border: `1px solid ${theme.tableBorder}`,
                borderRadius: 4,
                color: theme.menuItemText,
              }}
            />
            <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
              {barData.map(entry => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </View>

      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderTop: `1px solid ${theme.tableBorder}`,
        }}
      >
        <Text style={{ fontWeight: 600, color: theme.pageText }}>
          {t('Total Spending')}
        </Text>
        <Text style={{ fontWeight: 600, color: theme.errorText }}>
          {formatCents(totalSpent)}
        </Text>
      </View>
    </View>
  );
}

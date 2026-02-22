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
  ReferenceLine,
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
  data: AnalyticsData['monthlyTotals'];
};

export function MonthlyOverview({ data }: Props) {
  const { t } = useTranslation();

  if (data.length === 0) {
    return (
      <View style={{ padding: 20, alignItems: 'center' }}>
        <Text style={{ color: theme.pageTextSubdued }}>
          {t('No data available.')}
        </Text>
      </View>
    );
  }

  const chartData = data.map(m => ({
    label: m.label,
    income: m.income / 100,
    expenses: m.expenses / 100,
    net: m.net / 100,
    rawNet: m.net,
  }));

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1, minHeight: 350 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 20, right: 30, left: 10, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              tick={{ fill: theme.pageText, fontSize: 11 }}
            />
            <YAxis
              tick={{ fill: theme.pageText, fontSize: 11 }}
              tickFormatter={v => `${v.toLocaleString('de-DE')} €`}
            />
            <Tooltip
              formatter={(value: number, name: string) => [
                `${value.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €`,
                name === 'income' ? t('Income') : t('Expenses'),
              ]}
              contentStyle={{
                backgroundColor: theme.menuBackground,
                border: `1px solid ${theme.tableBorder}`,
                borderRadius: 4,
                color: theme.menuItemText,
              }}
            />
            <ReferenceLine y={0} stroke={theme.pageTextLight} />
            <Bar
              dataKey="income"
              name={t('Income')}
              fill={theme.reportsNumberPositive}
              radius={[4, 4, 0, 0]}
            />
            <Bar
              dataKey="expenses"
              name={t('Expenses')}
              fill={theme.reportsNumberNegative}
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </View>

      {/* Net summary row */}
      <View
        style={{
          flexDirection: 'row',
          gap: 16,
          padding: '12px 16px',
          borderTop: `1px solid ${theme.tableBorder}`,
          flexWrap: 'wrap',
        }}
      >
        {data.map(m => (
          <View key={m.month} style={{ alignItems: 'center', minWidth: 80 }}>
            <Text style={{ fontSize: 11, color: theme.pageTextSubdued }}>
              {m.label}
            </Text>
            <Text
              style={{
                fontWeight: 600,
                fontSize: 12,
                color: m.net >= 0 ? theme.reportsNumberPositive : theme.reportsNumberNegative,
              }}
            >
              {m.net >= 0 ? '+' : ''}
              {formatCents(m.net)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

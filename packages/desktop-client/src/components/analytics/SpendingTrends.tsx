// @ts-strict-ignore
import React from 'react';
import { useTranslation } from 'react-i18next';

import { theme } from '@actual-app/components/theme';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

import type { AnalyticsData } from './hooks/useAnalyticsData';

type Props = {
  data: AnalyticsData['spendingTrends'];
};

export function SpendingTrends({ data }: Props) {
  const { t } = useTranslation();

  if (data.length === 0) {
    return (
      <View style={{ padding: 20, alignItems: 'center' }}>
        <Text style={{ color: theme.pageTextSubdued }}>
          {t('Not enough data to show trends.')}
        </Text>
      </View>
    );
  }

  // Build a merged dataset: each month has a value per category
  const months = data[0]?.data.map(d => d.label) || [];
  const chartData = months.map((label, i) => {
    const point: Record<string, string | number> = { label };
    for (const line of data) {
      point[line.name] = line.data[i]?.amount / 100 || 0;
    }
    return point;
  });

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1, minHeight: 350 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
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
                name,
              ]}
              contentStyle={{
                backgroundColor: theme.menuBackground,
                border: `1px solid ${theme.tableBorder}`,
                borderRadius: 4,
                color: theme.menuItemText,
              }}
            />
            <Legend />
            {data.map(line => (
              <Line
                key={line.id}
                type="monotone"
                dataKey={line.name}
                stroke={line.color}
                strokeWidth={2}
                dot={{ r: 4, fill: line.color }}
                activeDot={{ r: 6 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </View>
    </View>
  );
}

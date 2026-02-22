// @ts-strict-ignore
import React from 'react';
import { useTranslation } from 'react-i18next';

import { theme } from '@actual-app/components/theme';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

import type { AnalyticsData } from './hooks/useAnalyticsData';

const EUR = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
});

function formatCents(cents: number): string {
  return EUR.format(cents / 100);
}

const FIXED_COLOR = '#6366f1'; // indigo
const VARIABLE_COLOR = '#f59e0b'; // amber

type Props = {
  data: AnalyticsData['fixedVsVariable'];
};

export function FixedVsVariable({ data }: Props) {
  const { t } = useTranslation();

  if (data.total === 0) {
    return (
      <View style={{ padding: 20, alignItems: 'center' }}>
        <Text style={{ color: theme.pageTextSubdued }}>
          {t('No spending data available.')}
        </Text>
      </View>
    );
  }

  const chartData = [
    { name: t('Fixed (Contracts)'), value: data.fixed / 100, color: FIXED_COLOR },
    { name: t('Variable'), value: data.variable / 100, color: VARIABLE_COLOR },
  ];

  const fixedPercent = data.total > 0 ? Math.round((data.fixed / data.total) * 100) : 0;
  const variablePercent = 100 - fixedPercent;

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1, minHeight: 300, alignItems: 'center' }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius="55%"
              outerRadius="80%"
              paddingAngle={3}
              dataKey="value"
              startAngle={90}
              endAngle={-270}
            >
              {chartData.map(entry => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number) => [
                `${value.toLocaleString('de-DE', { minimumFractionDigits: 2 })} €`,
              ]}
              contentStyle={{
                backgroundColor: theme.menuBackground,
                border: `1px solid ${theme.tableBorder}`,
                borderRadius: 4,
                color: theme.menuItemText,
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </View>

      {/* Legend */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'center',
          gap: 24,
          padding: '12px 16px',
          borderTop: `1px solid ${theme.tableBorder}`,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View
            style={{
              width: 12,
              height: 12,
              borderRadius: 2,
              backgroundColor: FIXED_COLOR,
            }}
          />
          <View>
            <Text style={{ fontSize: 12, color: theme.pageText, fontWeight: 600 }}>
              {t('Fixed')} ({fixedPercent}%)
            </Text>
            <Text style={{ fontSize: 11, color: theme.pageTextSubdued }}>
              {formatCents(data.fixed)}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View
            style={{
              width: 12,
              height: 12,
              borderRadius: 2,
              backgroundColor: VARIABLE_COLOR,
            }}
          />
          <View>
            <Text style={{ fontSize: 12, color: theme.pageText, fontWeight: 600 }}>
              {t('Variable')} ({variablePercent}%)
            </Text>
            <Text style={{ fontSize: 11, color: theme.pageTextSubdued }}>
              {formatCents(data.variable)}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

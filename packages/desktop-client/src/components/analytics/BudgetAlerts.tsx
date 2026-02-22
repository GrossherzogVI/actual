// @ts-strict-ignore
import React from 'react';
import { useTranslation } from 'react-i18next';

import { theme } from '@actual-app/components/theme';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';

import type { AnalyticsData } from './hooks/useAnalyticsData';

const EUR = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
});

function formatCents(cents: number): string {
  return EUR.format(cents / 100);
}

function alertColor(overagePercent: number): string {
  if (overagePercent >= 50) return '#ef4444'; // red
  if (overagePercent >= 20) return '#f59e0b'; // yellow/amber
  return '#f97316'; // orange
}

function barColor(overagePercent: number): string {
  if (overagePercent >= 50) return '#fecaca'; // red-200
  if (overagePercent >= 20) return '#fde68a'; // amber-200
  return '#fed7aa'; // orange-200
}

type Props = {
  alerts: AnalyticsData['budgetAlerts'];
  totalBudgeted: number;
  totalSpent: number;
  leftToSpend: number;
};

export function BudgetAlerts({
  alerts,
  totalBudgeted,
  totalSpent,
  leftToSpend,
}: Props) {
  const { t } = useTranslation();

  // Left-to-spend summary
  const hasAnyBudget = totalBudgeted > 0;

  return (
    <View style={{ flex: 1 }}>
      {/* Left to spend summary */}
      {hasAnyBudget && (
        <View
          style={{
            padding: 16,
            borderBottom: `1px solid ${theme.tableBorder}`,
            flexDirection: 'row',
            gap: 24,
            flexWrap: 'wrap',
          }}
        >
          <View style={{ alignItems: 'center', minWidth: 100 }}>
            <Text style={{ fontSize: 11, color: theme.pageTextSubdued }}>
              {t('Budgeted')}
            </Text>
            <Text style={{ fontSize: 18, fontWeight: 700, color: theme.pageText }}>
              {formatCents(totalBudgeted)}
            </Text>
          </View>
          <View style={{ alignItems: 'center', minWidth: 100 }}>
            <Text style={{ fontSize: 11, color: theme.pageTextSubdued }}>
              {t('Spent')}
            </Text>
            <Text style={{ fontSize: 18, fontWeight: 700, color: theme.errorText }}>
              {formatCents(totalSpent)}
            </Text>
          </View>
          <View style={{ alignItems: 'center', minWidth: 100 }}>
            <Text style={{ fontSize: 11, color: theme.pageTextSubdued }}>
              {t('Left to Spend')}
            </Text>
            <Text
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: leftToSpend >= 0 ? theme.reportsNumberPositive : theme.reportsNumberNegative,
              }}
            >
              {formatCents(leftToSpend)}
            </Text>
          </View>
        </View>
      )}

      {!hasAnyBudget && (
        <View style={{ padding: 20, alignItems: 'center' }}>
          <Text style={{ color: theme.pageTextSubdued, textAlign: 'center' }}>
            {t('Set up budgets in the Budget page to see alerts and left-to-spend tracking.')}
          </Text>
        </View>
      )}

      {hasAnyBudget && alerts.length === 0 && (
        <View style={{ padding: 20, alignItems: 'center' }}>
          <Text style={{ color: theme.reportsNumberPositive, fontWeight: 600 }}>
            {t('All categories are within budget. Nice!')}
          </Text>
        </View>
      )}

      {alerts.length > 0 && (
        <View style={{ padding: 16, gap: 8 }}>
          <Text
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: theme.pageText,
              marginBottom: 4,
            }}
          >
            {t('Over Budget')}
          </Text>
          {alerts.map(alert => {
            const progress = Math.min(
              (alert.spent / alert.budgeted) * 100,
              100,
            );
            return (
              <View
                key={alert.categoryId}
                style={{
                  padding: '10px 12px',
                  borderRadius: 6,
                  border: `1px solid ${theme.tableBorder}`,
                  backgroundColor: theme.tableBackground,
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 6,
                  }}
                >
                  <Text style={{ fontWeight: 600, fontSize: 13, color: theme.pageText }}>
                    {alert.categoryName}
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: alertColor(alert.overagePercent),
                    }}
                  >
                    +{alert.overagePercent}%
                  </Text>
                </View>

                {/* Progress bar */}
                <View
                  style={{
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: theme.tableBorder,
                    overflow: 'hidden',
                    marginBottom: 6,
                  }}
                >
                  <View
                    style={{
                      width: `${progress}%`,
                      height: '100%',
                      borderRadius: 3,
                      backgroundColor: alertColor(alert.overagePercent),
                    }}
                  />
                </View>

                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                  }}
                >
                  <Text style={{ fontSize: 11, color: theme.pageTextSubdued }}>
                    {t('Budget')}: {formatCents(alert.budgeted)}
                  </Text>
                  <Text style={{ fontSize: 11, color: theme.pageTextSubdued }}>
                    {t('Spent')}: {formatCents(alert.spent)}
                  </Text>
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: alertColor(alert.overagePercent),
                    }}
                  >
                    {t('Over')}: {formatCents(alert.overage)}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

// @ts-strict-ignore
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { theme } from '@actual-app/components/theme';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';

import { Page } from '@desktop-client/components/Page';
import { useFeatureFlag } from '@desktop-client/hooks/useFeatureFlag';

import { BudgetAlerts } from './BudgetAlerts';
import { FixedVsVariable } from './FixedVsVariable';
import { MonthlyOverview } from './MonthlyOverview';
import { SpendingByCategory } from './SpendingByCategory';
import { SpendingTrends } from './SpendingTrends';
import { useAnalyticsData } from './hooks/useAnalyticsData';

type Tab = 'spending' | 'budget' | 'trends';

function TabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Button
      variant={active ? 'primary' : 'bare'}
      onPress={onPress}
      style={{
        fontSize: 13,
        fontWeight: active ? 600 : 400,
        padding: '6px 16px',
        borderRadius: 6,
        ...(active && {
          backgroundColor: theme.buttonPrimaryBackground,
          color: theme.buttonPrimaryText,
        }),
      }}
    >
      {label}
    </Button>
  );
}

export function AnalyticsPage() {
  const { t } = useTranslation();
  const enabled = useFeatureFlag('financeOS');
  const [activeTab, setActiveTab] = useState<Tab>('spending');
  const data = useAnalyticsData();

  if (!enabled) return null;

  return (
    <Page header={t('Analytics')}>
      {/* Tab bar */}
      <View
        style={{
          flexDirection: 'row',
          gap: 4,
          padding: '8px 16px',
          borderBottom: `1px solid ${theme.tableBorder}`,
          backgroundColor: theme.tableBackground,
          flexShrink: 0,
        }}
      >
        <TabButton
          label={t('Spending')}
          active={activeTab === 'spending'}
          onPress={() => setActiveTab('spending')}
        />
        <TabButton
          label={t('Budget')}
          active={activeTab === 'budget'}
          onPress={() => setActiveTab('budget')}
        />
        <TabButton
          label={t('Trends')}
          active={activeTab === 'trends'}
          onPress={() => setActiveTab('trends')}
        />
      </View>

      {data.loading ? (
        <View style={{ padding: 40, alignItems: 'center' }}>
          <Text style={{ color: theme.pageTextSubdued }}>
            {t('Loading analytics...')}
          </Text>
        </View>
      ) : (
        <View style={{ flex: 1, overflow: 'auto' }}>
          {activeTab === 'spending' && (
            <View style={{ gap: 0 }}>
              {/* Category breakdown */}
              <SectionHeader title={t('Spending by Category')} />
              <SpendingByCategory
                data={data.spendingByCategory}
                totalSpent={data.totalSpentThisMonth}
              />

              {/* Fixed vs Variable */}
              <SectionHeader title={t('Fixed vs Variable')} />
              <FixedVsVariable data={data.fixedVsVariable} />
            </View>
          )}

          {activeTab === 'budget' && (
            <View>
              <SectionHeader title={t('Budget Status')} />
              <BudgetAlerts
                alerts={data.budgetAlerts}
                totalBudgeted={data.totalBudgetedThisMonth}
                totalSpent={data.totalSpentThisMonth}
                leftToSpend={data.leftToSpend}
              />
            </View>
          )}

          {activeTab === 'trends' && (
            <View style={{ gap: 0 }}>
              {/* Monthly Overview */}
              <SectionHeader title={t('Income vs Expenses (6 Months)')} />
              <MonthlyOverview data={data.monthlyTotals} />

              {/* Category Trends */}
              <SectionHeader title={t('Top Category Trends (6 Months)')} />
              <SpendingTrends data={data.spendingTrends} />
            </View>
          )}
        </View>
      )}
    </Page>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <View
      style={{
        padding: '14px 16px 8px',
        borderBottom: `1px solid ${theme.tableBorder}`,
      }}
    >
      <Text
        style={{
          fontSize: 15,
          fontWeight: 700,
          color: theme.pageText,
        }}
      >
        {title}
      </Text>
    </View>
  );
}

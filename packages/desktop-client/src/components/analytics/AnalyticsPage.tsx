// @ts-strict-ignore
import React from 'react';
import { useTranslation } from 'react-i18next';

import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { BudgetAlerts } from './BudgetAlerts';
import { FixedVsVariable } from './FixedVsVariable';
import { useAnalyticsData } from './hooks/useAnalyticsData';
import { MonthlyOverview } from './MonthlyOverview';
import { SpendingByCategory } from './SpendingByCategory';
import { SpendingTrends } from './SpendingTrends';

import { Page } from '@desktop-client/components/Page';
import { useFeatureFlag } from '@desktop-client/hooks/useFeatureFlag';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export function AnalyticsPage() {
  const { t } = useTranslation();
  const enabled = useFeatureFlag('financeOS');
  const data = useAnalyticsData();

  if (!enabled) return null;

  return (
    <Page header={t('Analytics')}>
      {data.loading ? (
        <View style={{ padding: 40, alignItems: 'center' }}>
          <Text style={{ color: theme.pageTextSubdued }}>
            {t('Loading analytics...')}
          </Text>
        </View>
      ) : (
        <Tabs defaultValue="spending">
          <TabsList>
            <TabsTrigger value="spending">{t('Spending')}</TabsTrigger>
            <TabsTrigger value="budget">{t('Budget')}</TabsTrigger>
            <TabsTrigger value="trends">{t('Trends')}</TabsTrigger>
          </TabsList>

          <TabsContent value="spending" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{t('Spending by Category')}</CardTitle>
              </CardHeader>
              <CardContent>
                <SpendingByCategory
                  data={data.spendingByCategory}
                  totalSpent={data.totalSpentThisMonth}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('Fixed vs Variable')}</CardTitle>
              </CardHeader>
              <CardContent>
                <FixedVsVariable data={data.fixedVsVariable} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="budget">
            <Card>
              <CardHeader>
                <CardTitle>{t('Budget Status')}</CardTitle>
              </CardHeader>
              <CardContent>
                <BudgetAlerts
                  alerts={data.budgetAlerts}
                  totalBudgeted={data.totalBudgetedThisMonth}
                  totalSpent={data.totalSpentThisMonth}
                  leftToSpend={data.leftToSpend}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="trends" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{t('Income vs Expenses (6 Months)')}</CardTitle>
              </CardHeader>
              <CardContent>
                <MonthlyOverview data={data.monthlyTotals} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('Top Category Trends (6 Months)')}</CardTitle>
              </CardHeader>
              <CardContent>
                <SpendingTrends data={data.spendingTrends} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </Page>
  );
}

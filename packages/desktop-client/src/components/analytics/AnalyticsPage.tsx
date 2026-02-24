// @ts-strict-ignore
import React from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { BudgetAlerts } from './BudgetAlerts';
import { FixedVsVariable } from './FixedVsVariable';
import { useAnalyticsData } from './hooks/useAnalyticsData';
import { MonthlyOverview } from './MonthlyOverview';
import { SpendingByCategory } from './SpendingByCategory';
import { SpendingTrends } from './SpendingTrends';

import { SkeletonCard } from '@desktop-client/components/common/Skeleton';
import { Page } from '@desktop-client/components/Page';
import { useFeatureFlag } from '@desktop-client/hooks/useFeatureFlag';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export function AnalyticsPage() {
  const { t } = useTranslation();
  const enabled = useFeatureFlag('financeOS');
  const data = useAnalyticsData();

  if (!enabled) {
    return (
      <Page header={t('Analytics')}>
        <View style={{ padding: 20 }}>
          <Text style={{ color: theme.pageTextSubdued }}>
            {t(
              'Analytics is not enabled. Enable it in Settings > Feature Flags.',
            )}
          </Text>
        </View>
      </Page>
    );
  }

  if (data.error) {
    return (
      <Page header={t('Analytics')}>
        <View style={{ padding: 40, alignItems: 'center', gap: 12 }}>
          <Text style={{ fontSize: 13, color: theme.errorText }}>
            {data.error}
          </Text>
          <Button onPress={data.reload}>
            <Trans>Erneut versuchen</Trans>
          </Button>
        </View>
      </Page>
    );
  }

  return (
    <Page header={t('Analytics')}>
      {data.loading ? (
        <View
          style={{
            padding: 16,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 16,
          }}
        >
          <SkeletonCard height={200} />
          <SkeletonCard height={200} />
          <SkeletonCard height={200} />
          <SkeletonCard height={200} />
        </View>
      ) : (
        <Tabs defaultValue="spending">
          <TabsList>
            <TabsTrigger value="spending">{<Trans>Spending</Trans>}</TabsTrigger>
            <TabsTrigger value="budget">{<Trans>Budget</Trans>}</TabsTrigger>
            <TabsTrigger value="trends">{<Trans>Trends</Trans>}</TabsTrigger>
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

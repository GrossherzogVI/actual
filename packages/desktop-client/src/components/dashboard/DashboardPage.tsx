// @ts-strict-ignore
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { theme } from '@actual-app/components/theme';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';

import { Page } from '@desktop-client/components/Page';
import { EmptyState } from '@desktop-client/components/common/EmptyState';
import { SkeletonCard } from '@desktop-client/components/common/Skeleton';
import { useAccounts } from '@desktop-client/hooks/useAccounts';
import { useFeatureFlag } from '@desktop-client/hooks/useFeatureFlag';
import { useNavigate } from '@desktop-client/hooks/useNavigate';
import { SheetNameProvider } from '@desktop-client/hooks/useSheetName';

import * as monthUtils from 'loot-core/shared/months';
import { send } from 'loot-core/platform/client/connection';

import { MoneyPulse } from './MoneyPulse';
import { useDashboardData } from './hooks/useDashboardData';
import { useUpcomingPayments } from './hooks/useUpcomingPayments';
import { AccountBalancesWidget } from './widgets/AccountBalancesWidget';
import { AttentionQueueWidget } from './widgets/AttentionQueueWidget';
import { BalanceProjectionWidget } from './widgets/BalanceProjectionWidget';
import { CashRunwayWidget } from './widgets/CashRunwayWidget';
import { QuickAddWidget } from './widgets/QuickAddWidget';
import { QuickAddOverlay } from '../quick-add/QuickAddOverlay';
import { ThisMonthWidget } from './widgets/ThisMonthWidget';
import { AvailableToSpendWidget } from './widgets/AvailableToSpendWidget';
import { UpcomingPaymentsWidget } from './widgets/UpcomingPaymentsWidget';

export function DashboardPage() {
  const { t } = useTranslation();
  const enabled = useFeatureFlag('financeOS');
  const navigate = useNavigate();

  const { contractSummary, reviewCounts, loading, error } = useDashboardData();

  // Days remaining in the current month (inclusive of today)
  const daysLeftInMonth = (() => {
    const now = new Date();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return lastDay.getDate() - now.getDate() + 1;
  })();

  const { grouped, loading: paymentsLoading, error: paymentsError } = useUpcomingPayments(daysLeftInMonth);
  const upcomingFlat = Array.from(grouped.values()).flat();

  // Account data for empty-state detection
  const accountsQuery = useAccounts();
  const accounts = accountsQuery.data ?? [];

  // Quick Add overlay state
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const handleOpenQuickAdd = useCallback(() => setQuickAddOpen(true), []);
  const handleCloseQuickAdd = useCallback(() => setQuickAddOpen(false), []);

  if (!enabled) {
    return (
      <Page header={t('Dashboard')}>
        <View style={{ padding: 20 }}>
          <Text style={{ color: theme.pageTextSubdued }}>
            {t('Dashboard is not enabled. Enable it in Settings > Feature Flags.')}
          </Text>
        </View>
      </Page>
    );
  }

  if (error) {
    return (
      <Page header={t('Dashboard')}>
        <View style={{ padding: 20 }}>
          <Text style={{ color: theme.errorText ?? '#ef4444' }}>{error}</Text>
        </View>
      </Page>
    );
  }

  const isInitialLoading = loading && paymentsLoading;

  // Empty state: loading finished, no accounts AND no contracts
  const totalContracts = contractSummary
    ? Object.values(contractSummary.by_status).reduce((s, v) => s + v, 0)
    : null;
  const hasNoData =
    !isInitialLoading &&
    !error &&
    accounts.length === 0 &&
    contractSummary !== null &&
    totalContracts === 0 &&
    upcomingFlat.length === 0;

  const currentSheetName = monthUtils.sheetForMonth(monthUtils.currentMonth());

  return (
    <Page header={t('Dashboard')}>
      <View
        style={{
          padding: 16,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 16,
          alignItems: 'start',
        }}
      >
        {isInitialLoading ? (
          <>
            {/* Skeleton placeholders matching the 3-column dashboard layout */}
            <View style={{ gridColumn: '1 / -1' }}>
              <SkeletonCard height={72} />
            </View>
            <SkeletonCard height={140} />
            <SkeletonCard height={140} />
            <SkeletonCard height={140} />
            <View style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <SkeletonCard height={160} />
              <SkeletonCard height={160} />
            </View>
          </>
        ) : hasNoData ? (
          <View style={{ gridColumn: '1 / -1' }}>
            <EmptyState
              title={t('Welcome to your Finance Dashboard')}
              description={t('Start by importing your bank data to see everything here.')}
              actions={[
                {
                  label: t('Add Account'),
                  onPress: () => navigate('/accounts'),
                  primary: true,
                },
                {
                  label: t('Import Data'),
                  onPress: () => navigate('/import'),
                },
                {
                  label: t('Set Up Categories'),
                  onPress: () => (send as Function)('categories-setup-german-tree'),
                },
              ]}
            />
          </View>
        ) : (
          <>
            {/* Top bar: MoneyPulse (full width) */}
            <MoneyPulse upcomingPayments={upcomingFlat} />

            {/* Column 1: AccountBalances + ThisMonth */}
            <View style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <AccountBalancesWidget />
              <SheetNameProvider name={currentSheetName}>
                <ThisMonthWidget summary={contractSummary} loading={loading} />
              </SheetNameProvider>
            </View>

            {/* Column 2: UpcomingPayments + AvailableToSpend */}
            <View style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <UpcomingPaymentsWidget
                grouped={grouped}
                loading={paymentsLoading}
                error={paymentsError}
              />
              <AvailableToSpendWidget
                upcomingPayments={upcomingFlat}
                loading={paymentsLoading}
              />
            </View>

            {/* Column 3: QuickAdd + AttentionQueue */}
            <View style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <QuickAddWidget onOpenQuickAdd={handleOpenQuickAdd} />
              <AttentionQueueWidget counts={reviewCounts} loading={loading} />
            </View>

            {/* Bottom row: BalanceProjection + CashRunway side by side, spanning full width */}
            <View
              style={{
                gridColumn: '1 / -1',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 16,
              }}
            >
              <BalanceProjectionWidget upcomingPayments={upcomingFlat} />
              <CashRunwayWidget summary={contractSummary} loading={loading} />
            </View>
          </>
        )}
      </View>

      {/* Quick Add overlay */}
      <QuickAddOverlay isOpen={quickAddOpen} onClose={handleCloseQuickAdd} />
    </Page>
  );
}

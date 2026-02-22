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
import { UpcomingPaymentsWidget } from './widgets/UpcomingPaymentsWidget';

export function DashboardPage() {
  const { t } = useTranslation();
  const enabled = useFeatureFlag('financeOS');
  const navigate = useNavigate();

  const { contractSummary, reviewCounts, loading, error } = useDashboardData();
  const { grouped, loading: paymentsLoading, error: paymentsError } = useUpcomingPayments(30);
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
          gridTemplateColumns: '1fr 1fr',
          gap: 16,
          alignItems: 'start',
        }}
      >
        {isInitialLoading ? (
          <>
            {/* Skeleton placeholders matching the dashboard layout */}
            <View style={{ gridColumn: '1 / -1' }}>
              <SkeletonCard height={72} />
            </View>
            <SkeletonCard height={140} />
            <SkeletonCard height={140} />
            <View style={{ gridColumn: '1 / -1' }}>
              <SkeletonCard height={160} />
            </View>
            <SkeletonCard height={120} />
            <SkeletonCard height={120} />
            <View style={{ gridColumn: '1 / -1' }}>
              <SkeletonCard height={200} />
            </View>
            <View style={{ gridColumn: '1 / -1' }}>
              <SkeletonCard height={120} />
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
            {/* Full-width dismissible brief */}
            <MoneyPulse upcomingPayments={upcomingFlat} />

            {/* Row 1: This Month (needs SheetNameProvider for budget bindings) + Cash Runway */}
            <SheetNameProvider name={currentSheetName}>
              <ThisMonthWidget summary={contractSummary} loading={loading} />
            </SheetNameProvider>
            <CashRunwayWidget summary={contractSummary} loading={loading} />

            {/* Row 2: Upcoming payments (full width) */}
            <UpcomingPaymentsWidget
              grouped={grouped}
              loading={paymentsLoading}
              error={paymentsError}
            />

            {/* Row 3: Attention Queue + Quick Add */}
            <AttentionQueueWidget counts={reviewCounts} loading={loading} />
            <QuickAddWidget onOpenQuickAdd={handleOpenQuickAdd} />

            {/* Row 4: Balance Projection (full width) */}
            <BalanceProjectionWidget upcomingPayments={upcomingFlat} />

            {/* Row 5: Account Balances */}
            <AccountBalancesWidget />
          </>
        )}
      </View>

      {/* Quick Add overlay */}
      <QuickAddOverlay isOpen={quickAddOpen} onClose={handleCloseQuickAdd} />
    </Page>
  );
}

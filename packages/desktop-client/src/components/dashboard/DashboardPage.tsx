// @ts-strict-ignore
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ReactGridLayout from 'react-grid-layout';
import type { Layout, LayoutItem } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';

import { Button } from '@actual-app/components/button';
import { theme } from '@actual-app/components/theme';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';

import { Page } from '@desktop-client/components/Page';
import { EmptyState } from '@desktop-client/components/common/EmptyState';
import { SkeletonCard } from '@desktop-client/components/common/Skeleton';
import { useAccounts } from '@desktop-client/hooks/useAccounts';
import { useFeatureFlag } from '@desktop-client/hooks/useFeatureFlag';
import { useNavigate } from '@desktop-client/hooks/useNavigate';
import { useResizeObserver } from '@desktop-client/hooks/useResizeObserver';
import { useSyncedPref } from '@desktop-client/hooks/useSyncedPref';
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

// ---------------------------------------------------------------------------
// Widget registry
// ---------------------------------------------------------------------------

const ALL_WIDGET_IDS = [
  'money-pulse',
  'account-balances',
  'this-month',
  'upcoming-payments',
  'available-to-spend',
  'quick-add',
  'attention-queue',
  'balance-projection',
  'cash-runway',
] as const;

type WidgetId = (typeof ALL_WIDGET_IDS)[number];

// Labels are built inside the component via useMemo to support i18n t()

// Default layout: 3-column grid (12 cols, rowHeight=80)
// Row 0: money-pulse full width (h=2)
// Row 2: account-balances (col 0-3, h=3), upcoming-payments (col 4-7, h=3), quick-add (col 8-11, h=3)
// Row 5: this-month (col 0-3, h=3), available-to-spend (col 4-7, h=3), attention-queue (col 8-11, h=3)
// Row 8: balance-projection (col 0-5, h=4), cash-runway (col 6-11, h=4)
const DEFAULT_LAYOUT: LayoutItem[] = [
  { i: 'money-pulse',         x: 0, y: 0, w: 12, h: 2, minW: 6, minH: 1 },
  { i: 'account-balances',    x: 0, y: 2, w: 4,  h: 3, minW: 3, minH: 2 },
  { i: 'upcoming-payments',   x: 4, y: 2, w: 4,  h: 3, minW: 3, minH: 2 },
  { i: 'quick-add',           x: 8, y: 2, w: 4,  h: 3, minW: 3, minH: 2 },
  { i: 'this-month',          x: 0, y: 5, w: 4,  h: 3, minW: 3, minH: 2 },
  { i: 'available-to-spend',  x: 4, y: 5, w: 4,  h: 3, minW: 3, minH: 2 },
  { i: 'attention-queue',     x: 8, y: 5, w: 4,  h: 3, minW: 3, minH: 2 },
  { i: 'balance-projection',  x: 0, y: 8, w: 6,  h: 4, minW: 4, minH: 3 },
  { i: 'cash-runway',         x: 6, y: 8, w: 6,  h: 4, minW: 4, minH: 3 },
];

function parseLayout(raw: string | undefined): LayoutItem[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {
    // ignore
  }
  return null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DashboardPage() {
  const { t } = useTranslation();
  const widgetLabels = useMemo<Record<WidgetId, string>>(() => ({
    'money-pulse': t('Money Pulse'),
    'account-balances': t('Account Balances'),
    'this-month': t('This Month'),
    'upcoming-payments': t('Upcoming Payments'),
    'available-to-spend': t('Available to Spend'),
    'quick-add': t('Quick Add'),
    'attention-queue': t('Attention Queue'),
    'balance-projection': t('Balance Projection'),
    'cash-runway': t('Cash Runway'),
  }), [t]);
  const enabled = useFeatureFlag('financeOS');
  const navigate = useNavigate();

  const { contractSummary, reviewCounts, loading, error } = useDashboardData();

  const daysLeftInMonth = (() => {
    const now = new Date();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return lastDay.getDate() - now.getDate() + 1;
  })();

  const { grouped, loading: paymentsLoading, error: paymentsError } = useUpcomingPayments(daysLeftInMonth);
  const upcomingFlat = Array.from(grouped.values()).flat();

  const accountsQuery = useAccounts();
  const accounts = accountsQuery.data ?? [];

  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const handleOpenQuickAdd = useCallback(() => setQuickAddOpen(true), []);
  const handleCloseQuickAdd = useCallback(() => setQuickAddOpen(false), []);

  // Edit mode
  const [isEditing, setIsEditing] = useState(false);

  // Layout persistence via synced prefs
  const [savedLayoutRaw, setSavedLayoutRaw] = useSyncedPref('dashboardLayout');
  const savedLayout = useMemo(() => parseLayout(savedLayoutRaw), [savedLayoutRaw]);

  // Visible widgets (derived from layout items)
  const initialVisibleIds = useMemo<Set<WidgetId>>(() => {
    if (savedLayout) {
      return new Set(savedLayout.map(l => l.i as WidgetId).filter(id => ALL_WIDGET_IDS.includes(id)));
    }
    return new Set(ALL_WIDGET_IDS);
  }, []);

  const [visibleWidgets, setVisibleWidgets] = useState<Set<WidgetId>>(initialVisibleIds);

  // Active layout (merge saved with defaults for any new widgets)
  const [layout, setLayout] = useState<LayoutItem[]>(() => {
    const base = savedLayout ?? DEFAULT_LAYOUT;
    // Ensure all visible widgets have a layout entry
    const existing = new Set(base.map(l => l.i));
    const extras = DEFAULT_LAYOUT.filter(d => !existing.has(d.i));
    return [...base, ...extras];
  });

  // Container width measurement for ReactGridLayout
  const [containerWidth, setContainerWidth] = useState(0);
  const handleResize = useCallback((rect: DOMRectReadOnly) => {
    setContainerWidth(Math.floor(rect.width));
  }, []);
  const containerRef = useResizeObserver<HTMLDivElement>(handleResize);

  const currentSheetName = monthUtils.sheetForMonth(monthUtils.currentMonth());

  const handleLayoutChange = useCallback(
    (newLayout: Layout) => {
      setLayout([...newLayout]);
      setSavedLayoutRaw(JSON.stringify(newLayout));
    },
    [setSavedLayoutRaw],
  );

  const handleRemoveWidget = useCallback(
    (id: WidgetId) => {
      setVisibleWidgets(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setLayout(prev => {
        const next = prev.filter(l => l.i !== id);
        setSavedLayoutRaw(JSON.stringify(next));
        return next;
      });
    },
    [setSavedLayoutRaw],
  );

  const handleAddWidget = useCallback(
    (id: WidgetId) => {
      setVisibleWidgets(prev => new Set([...prev, id]));
      setLayout(prev => {
        if (prev.find(l => l.i === id)) return prev;
        const defaultItem = DEFAULT_LAYOUT.find(d => d.i === id);
        const maxY = prev.reduce((m, l) => Math.max(m, l.y + l.h), 0);
        const item: LayoutItem = defaultItem
          ? { ...defaultItem, y: maxY }
          : { i: id, x: 0, y: maxY, w: 4, h: 3, minW: 3, minH: 2 };
        const next = [...prev, item];
        setSavedLayoutRaw(JSON.stringify(next));
        return next;
      });
    },
    [setSavedLayoutRaw],
  );

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

  // Widgets not currently visible (available to add in edit mode)
  const hiddenWidgets = ALL_WIDGET_IDS.filter(id => !visibleWidgets.has(id));

  // Only include layout items for visible widgets
  const activeLayout = layout.filter(l => visibleWidgets.has(l.i as WidgetId));

  return (
    <Page header={t('Dashboard')}>
      {/* Toolbar: edit mode toggle */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'flex-end',
          padding: '0 16px 12px',
          gap: 8,
        }}
      >
        {isEditing && hiddenWidgets.length > 0 && (
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', flex: 1 }}>
            {hiddenWidgets.map(id => (
              <Button
                key={id}
                variant="bare"
                onPress={() => handleAddWidget(id)}
                style={{
                  fontSize: 11,
                  padding: '3px 10px',
                  border: `1px dashed ${theme.tableBorder}`,
                  borderRadius: 4,
                  color: theme.pageTextSubdued,
                }}
              >
                + {widgetLabels[id]}
              </Button>
            ))}
          </View>
        )}
        {isEditing ? (
          <Button onPress={() => setIsEditing(false)}>
            {t('Done')}
          </Button>
        ) : (
          <Button variant="bare" onPress={() => setIsEditing(true)}>
            {t('Edit Dashboard')}
          </Button>
        )}
      </View>

      {/* Main content */}
      {isInitialLoading ? (
        <View
          style={{
            padding: 16,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 16,
            alignItems: 'start',
          }}
        >
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
        </View>
      ) : hasNoData ? (
        <View style={{ padding: 16 }}>
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
        <View
          innerRef={containerRef}
          style={{ padding: '0 16px 16px', userSelect: isEditing ? 'none' : undefined }}
        >
          {containerWidth > 0 && (
            <ReactGridLayout
              width={containerWidth}
              layout={activeLayout}
              gridConfig={{
                cols: 12,
                rowHeight: 80,
              }}
              dragConfig={{
                enabled: isEditing,
              }}
              resizeConfig={{
                enabled: isEditing,
              }}
              onLayoutChange={handleLayoutChange}
            >
              {activeLayout.map(item => (
                <div
                  key={item.i}
                  style={{
                    position: 'relative',
                    ...(isEditing
                      ? {
                          outline: `2px dashed ${theme.tableBorder}`,
                          outlineOffset: -2,
                          borderRadius: 10,
                          cursor: 'grab',
                        }
                      : {}),
                  }}
                >
                  {isEditing && (
                    <Button
                      variant="bare"
                      onPress={() => handleRemoveWidget(item.i as WidgetId)}
                      aria-label={t('Remove widget')}
                      style={{
                        position: 'absolute',
                        top: 4,
                        right: 4,
                        zIndex: 10,
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        backgroundColor: theme.errorText ?? '#ef4444',
                        color: '#fff',
                        fontSize: 12,
                        lineHeight: '20px',
                        textAlign: 'center',
                        padding: 0,
                      }}
                    >
                      ×
                    </Button>
                  )}
                  <WidgetRenderer
                    id={item.i as WidgetId}
                    contractSummary={contractSummary}
                    loading={loading}
                    paymentsLoading={paymentsLoading}
                    paymentsError={paymentsError}
                    grouped={grouped}
                    upcomingFlat={upcomingFlat}
                    reviewCounts={reviewCounts}
                    currentSheetName={currentSheetName}
                    onOpenQuickAdd={handleOpenQuickAdd}
                  />
                </div>
              ))}
            </ReactGridLayout>
          )}
        </View>
      )}

      <QuickAddOverlay isOpen={quickAddOpen} onClose={handleCloseQuickAdd} />
    </Page>
  );
}

// ---------------------------------------------------------------------------
// Widget renderer (keeps the layout JSX clean)
// ---------------------------------------------------------------------------

type WidgetRendererProps = {
  id: WidgetId;
  contractSummary: any;
  loading: boolean;
  paymentsLoading: boolean;
  paymentsError: string | null;
  grouped: Map<string, any[]>;
  upcomingFlat: any[];
  reviewCounts: any;
  currentSheetName: string;
  onOpenQuickAdd: () => void;
};

function WidgetRenderer({
  id,
  contractSummary,
  loading,
  paymentsLoading,
  paymentsError,
  grouped,
  upcomingFlat,
  reviewCounts,
  currentSheetName,
  onOpenQuickAdd,
}: WidgetRendererProps) {
  switch (id) {
    case 'money-pulse':
      return <MoneyPulse upcomingPayments={upcomingFlat} />;
    case 'account-balances':
      return <AccountBalancesWidget />;
    case 'this-month':
      return (
        <SheetNameProvider name={currentSheetName}>
          <ThisMonthWidget summary={contractSummary} loading={loading} />
        </SheetNameProvider>
      );
    case 'upcoming-payments':
      return (
        <UpcomingPaymentsWidget
          grouped={grouped}
          loading={paymentsLoading}
          error={paymentsError}
        />
      );
    case 'available-to-spend':
      return (
        <AvailableToSpendWidget
          upcomingPayments={upcomingFlat}
          loading={paymentsLoading}
        />
      );
    case 'quick-add':
      return <QuickAddWidget onOpenQuickAdd={onOpenQuickAdd} />;
    case 'attention-queue':
      return <AttentionQueueWidget counts={reviewCounts} loading={loading} />;
    case 'balance-projection':
      return <BalanceProjectionWidget upcomingPayments={upcomingFlat} />;
    case 'cash-runway':
      return <CashRunwayWidget summary={contractSummary} loading={loading} />;
    default:
      return null;
  }
}

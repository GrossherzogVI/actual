// @ts-strict-ignore
import React, { useCallback, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { theme } from '@actual-app/components/theme';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';
import { SvgCalendar } from '@actual-app/components/icons/v2';

import { Page } from '@desktop-client/components/Page';
import { EmptyState } from '@desktop-client/components/common/EmptyState';
import { useFeatureFlag } from '@desktop-client/hooks/useFeatureFlag';
import { useNavigate } from '@desktop-client/hooks/useNavigate';

import { useCalendarData } from './hooks/useCalendarData';
import type { CalendarView } from './types';
import { ListView } from './views/ListView';

export function CalendarPage() {
  const { t } = useTranslation();
  const enabled = useFeatureFlag('paymentCalendar');
  const navigate = useNavigate();
  const [view, setView] = useState<CalendarView>('list');

  const { weeks, allEntries, loading, error, reload } = useCalendarData();

  const handleToggleView = useCallback((v: CalendarView) => {
    setView(v);
  }, []);

  if (!enabled) {
    return (
      <Page header={t('Payment Calendar')}>
        <View style={{ padding: 20 }}>
          <Text style={{ color: theme.pageTextSubdued }}>
            {t('Payment Calendar is not enabled. Enable it in Settings > Feature Flags.')}
          </Text>
        </View>
      </Page>
    );
  }

  return (
    <Page header={t('Payment Calendar')}>
      {/* Toolbar */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 0 14px',
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        {/* View toggle */}
        <View
          style={{
            flexDirection: 'row',
            gap: 0,
            border: `1px solid ${theme.tableBorder}`,
            borderRadius: 5,
            overflow: 'hidden',
          }}
        >
          <ViewToggleButton
            label={t('List')}
            active={view === 'list'}
            onPress={() => handleToggleView('list')}
          />
          <ViewToggleButton
            label={t('Month')}
            active={view === 'month'}
            onPress={() => handleToggleView('month')}
          />
        </View>

        {/* Reload button */}
        <Button variant="bare" onPress={reload}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <SvgCalendar style={{ width: 13, height: 13, color: theme.pageTextSubdued }} />
            <Text style={{ fontSize: 12, color: theme.pageTextSubdued }}>
              <Trans>Refresh</Trans>
            </Text>
          </View>
        </Button>
      </View>

      {/* Content */}
      {!loading && !error && allEntries.length === 0 ? (
        <EmptyState
          title={t('No upcoming payments')}
          description={t(
            'Set up schedules or import contracts to see your payment calendar.',
          )}
          actions={[
            {
              label: t('Go to Contracts'),
              onPress: () => navigate('/contracts'),
              primary: true,
            },
            {
              label: t('Go to Schedules'),
              onPress: () => navigate('/schedules'),
            },
          ]}
        />
      ) : view === 'list' ? (
        <ListView
          weeks={weeks}
          allEntries={allEntries}
          loading={loading}
          error={error}
        />
      ) : (
        <MonthGridPlaceholder />
      )}
    </Page>
  );
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function ViewToggleButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <button
      onClick={onPress}
      style={{
        padding: '5px 14px',
        fontSize: 12,
        fontWeight: active ? 600 : 400,
        border: 'none',
        borderRight: `1px solid ${theme.tableBorder}`,
        backgroundColor: active ? theme.buttonPrimaryBackground : theme.tableBackground,
        color: active ? theme.buttonPrimaryText : theme.pageText,
        cursor: 'pointer',
        outline: 'none',
      }}
    >
      {label}
    </button>
  );
}

function MonthGridPlaceholder() {
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
        backgroundColor: theme.tableBackground,
        borderRadius: 6,
        border: `1px solid ${theme.tableBorder}`,
      }}
    >
      <SvgCalendar
        style={{ width: 40, height: 40, color: theme.pageTextSubdued, marginBottom: 14 }}
      />
      <Text style={{ fontSize: 16, fontWeight: 600, color: theme.pageText, marginBottom: 6 }}>
        <Trans>Month Grid</Trans>
      </Text>
      <Text style={{ fontSize: 13, color: theme.pageTextSubdued, textAlign: 'center' }}>
        <Trans>Coming soon. Use List view for now.</Trans>
      </Text>
    </View>
  );
}

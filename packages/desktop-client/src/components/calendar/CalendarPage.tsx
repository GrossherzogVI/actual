// @ts-strict-ignore
import React, { useCallback, useMemo, useState } from 'react';
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

import { groupByWeek, useCalendarData } from './hooks/useCalendarData';
import type { CalendarEntry, CalendarView } from './types';
import { ListView } from './views/ListView';
import { MonthGridView } from './MonthGridView';

export function CalendarPage() {
  const { t } = useTranslation();
  const enabled = useFeatureFlag('paymentCalendar');
  const navigate = useNavigate();
  const [view, setView] = useState<CalendarView>('list');
  const [showIncome, setShowIncome] = useState(true);

  const { weeks: rawWeeks, allEntries: rawAllEntries, loading, error, reload, startingBalance } = useCalendarData();

  const handleToggleView = useCallback((v: CalendarView) => {
    setView(v);
  }, []);

  // Apply income filter
  const allEntries = useMemo(
    () => showIncome ? rawAllEntries : rawAllEntries.filter(e => e.amount <= 0),
    [rawAllEntries, showIncome],
  );

  const weeks = useMemo(
    () => showIncome ? rawWeeks : groupByWeek(allEntries, startingBalance),
    [showIncome, rawWeeks, allEntries, startingBalance],
  );

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

        {/* Income toggle + Source badges + Reload */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {/* Income toggle */}
          <Button
            variant="bare"
            onPress={() => setShowIncome(prev => !prev)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '4px 10px',
              fontSize: 12,
              fontWeight: showIncome ? 600 : 400,
              border: `1px solid ${showIncome ? '#10b981' : theme.tableBorder}`,
              borderRadius: 12,
              backgroundColor: showIncome ? '#10b98118' : 'transparent',
              color: showIncome ? '#10b981' : theme.pageTextSubdued,
            }}
          >
            <View
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                backgroundColor: showIncome ? '#10b981' : theme.pageTextSubdued,
                flexShrink: 0,
              }}
            />
            {t('Income')}
          </Button>

          <SourceBadges entries={rawAllEntries} />
          <Button variant="bare" onPress={reload}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <SvgCalendar style={{ width: 13, height: 13, color: theme.pageTextSubdued }} />
              <Text style={{ fontSize: 12, color: theme.pageTextSubdued }}>
                <Trans>Refresh</Trans>
              </Text>
            </View>
          </Button>
        </View>
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
        <MonthGridView allEntries={allEntries} loading={loading} />
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
    <Button
      variant="bare"
      onPress={onPress}
      style={{
        padding: '5px 14px',
        fontSize: 12,
        fontWeight: active ? 600 : 400,
        borderRight: `1px solid ${theme.tableBorder}`,
        backgroundColor: active ? theme.buttonPrimaryBackground : theme.tableBackground,
        color: active ? theme.buttonPrimaryText : theme.pageText,
        borderRadius: 0,
      }}
    >
      {label}
    </Button>
  );
}

function SourceBadges({ entries }: { entries: CalendarEntry[] }) {
  const { t } = useTranslation();
  const counts = useMemo(() => {
    let schedules = 0;
    let contracts = 0;
    for (const e of entries) {
      if (e.type === 'schedule') schedules++;
      else if (e.type === 'contract') contracts++;
    }
    return { schedules, contracts };
  }, [entries]);

  if (counts.schedules === 0 && counts.contracts === 0) return null;

  return (
    <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
      {counts.schedules > 0 && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            padding: '2px 8px',
            borderRadius: 10,
            backgroundColor: `${theme.pageTextSubdued}15`,
          }}
        >
          <SvgCalendar style={{ width: 10, height: 10, color: theme.pageTextSubdued }} />
          <Text style={{ fontSize: 10, color: theme.pageTextSubdued }}>
            {t('{{count}} Schedule(s)', { count: counts.schedules })}
          </Text>
        </View>
      )}
      {counts.contracts > 0 && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            padding: '2px 8px',
            borderRadius: 10,
            backgroundColor: `${theme.pageTextSubdued}15`,
          }}
        >
          <View
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: theme.pageTextSubdued,
            }}
          />
          <Text style={{ fontSize: 10, color: theme.pageTextSubdued }}>
            {t('{{count}} Contract(s)', { count: counts.contracts })}
          </Text>
        </View>
      )}
    </View>
  );
}


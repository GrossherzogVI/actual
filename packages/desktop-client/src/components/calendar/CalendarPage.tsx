// @ts-strict-ignore
import React, { useCallback, useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import {
  SvgCalendar,
  SvgDownloadThickBottom,
} from '@actual-app/components/icons/v2';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { groupByWeek, useCalendarData } from './hooks/useCalendarData';
import { MonthGridView } from './MonthGridView';
import type { CalendarEntry, CalendarView } from './types';
import { ListView } from './views/ListView';

import { EmptyState } from '@desktop-client/components/common/EmptyState';
import { Page } from '@desktop-client/components/Page';
import { useFeatureFlag } from '@desktop-client/hooks/useFeatureFlag';
import { useNavigate } from '@desktop-client/hooks/useNavigate';
import { useSyncedPref } from '@desktop-client/hooks/useSyncedPref';
import { downloadICS } from '@desktop-client/utils/ics-export';

import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

export function CalendarPage() {
  const { t } = useTranslation();
  const enabled = useFeatureFlag('paymentCalendar');
  const navigate = useNavigate();
  const [view, setView] = useState<CalendarView>('list');
  const [showIncome, setShowIncome] = useState(true);

  // Payday cycle preference: stored as string (the day number 1-28) or '' (disabled)
  const [paydayDateRaw, setPaydayDateRaw] = useSyncedPref('paydayDate');
  const paydayDate = paydayDateRaw ? parseInt(paydayDateRaw, 10) : null;
  const paydayEnabled = paydayDate !== null && !Number.isNaN(paydayDate);

  // Balance threshold preference: stored as string of cents (e.g. "50000" = €500) or '' (disabled)
  const [balanceThresholdRaw, setBalanceThresholdRaw] =
    useSyncedPref('balanceThreshold');
  const balanceThreshold = balanceThresholdRaw
    ? parseInt(balanceThresholdRaw, 10)
    : null;
  const thresholdEnabled =
    balanceThreshold !== null && !Number.isNaN(balanceThreshold);

  // Local state for threshold input editing
  const [thresholdInput, setThresholdInput] = useState<string>(
    balanceThreshold ? String(balanceThreshold / 100) : '',
  );

  const handleThresholdToggle = useCallback(() => {
    if (thresholdEnabled) {
      setBalanceThresholdRaw('');
      setThresholdInput('');
    } else {
      // Default €500
      setBalanceThresholdRaw('50000');
      setThresholdInput('500');
    }
  }, [thresholdEnabled, setBalanceThresholdRaw]);

  const handleThresholdBlur = useCallback(() => {
    const euros = parseFloat(thresholdInput);
    if (!Number.isNaN(euros) && euros >= 0) {
      setBalanceThresholdRaw(String(Math.round(euros * 100)));
    }
  }, [thresholdInput, setBalanceThresholdRaw]);

  const handleTogglePayday = useCallback(() => {
    if (paydayEnabled) {
      // Disable payday mode
      setPaydayDateRaw('');
    } else {
      // Enable with default payday of 1st
      setPaydayDateRaw('1');
    }
  }, [paydayEnabled, setPaydayDateRaw]);

  const {
    weeks: rawWeeks,
    allEntries: rawAllEntries,
    loading,
    error,
    reload,
    startingBalance,
    windowStart,
    windowEnd,
  } = useCalendarData({ paydayDate: paydayEnabled ? paydayDate : null });

  const handleToggleView = useCallback((v: CalendarView) => {
    setView(v);
  }, []);

  // Apply income filter
  const allEntries = useMemo(
    () =>
      showIncome ? rawAllEntries : rawAllEntries.filter(e => e.amount <= 0),
    [rawAllEntries, showIncome],
  );

  const weeks = useMemo(
    () => (showIncome ? rawWeeks : groupByWeek(allEntries, startingBalance)),
    [showIncome, rawWeeks, allEntries, startingBalance],
  );

  if (!enabled) {
    return (
      <Page header={t('Payment Calendar')}>
        <View style={{ padding: 20 }}>
          <Text style={{ color: theme.pageTextSubdued }}>
            {t(
              'Payment Calendar is not enabled. Enable it in Settings > Feature Flags.',
            )}
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
        <Tabs value={view} onValueChange={v => handleToggleView(v as CalendarView)}>
          <TabsList>
            <TabsTrigger value="list">{t('List')}</TabsTrigger>
            <TabsTrigger value="month">{t('Month')}</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Right-side controls */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          {/* Payday cycle toggle */}
          <Button
            variant="bare"
            onPress={handleTogglePayday}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '4px 10px',
              fontSize: 12,
              fontWeight: paydayEnabled ? 600 : 400,
              border: `1px solid ${paydayEnabled ? '#6366f1' : theme.tableBorder}`,
              borderRadius: 12,
              backgroundColor: paydayEnabled ? '#6366f118' : 'transparent',
              color: paydayEnabled ? '#6366f1' : theme.pageTextSubdued,
            }}
          >
            <View
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                backgroundColor: paydayEnabled
                  ? '#6366f1'
                  : theme.pageTextSubdued,
                flexShrink: 0,
              }}
            />
            {paydayEnabled
              ? t('Payday cycle ({{day}}.)', { day: paydayDate })
              : t('Payday cycle')}
          </Button>

          {/* Payday day selector — shown only when payday mode is active */}
          {paydayEnabled && (
            <PaydayDayPicker
              currentDay={paydayDate!}
              onChange={d => setPaydayDateRaw(String(d))}
            />
          )}

          {/* Window label */}
          {paydayEnabled && (
            <Text style={{ fontSize: 11, color: theme.pageTextSubdued }}>
              {formatWindowLabel(windowStart, windowEnd)}
            </Text>
          )}

          {/* Balance threshold toggle */}
          <Button
            variant="bare"
            onPress={handleThresholdToggle}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '4px 10px',
              fontSize: 12,
              fontWeight: thresholdEnabled ? 600 : 400,
              border: `1px solid ${thresholdEnabled ? (theme.errorText ?? '#ef4444') : theme.tableBorder}`,
              borderRadius: 12,
              backgroundColor: thresholdEnabled
                ? `${theme.errorText ?? '#ef4444'}18`
                : 'transparent',
              color: thresholdEnabled
                ? (theme.errorText ?? '#ef4444')
                : theme.pageTextSubdued,
            }}
          >
            <View
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                backgroundColor: thresholdEnabled
                  ? (theme.errorText ?? '#ef4444')
                  : theme.pageTextSubdued,
                flexShrink: 0,
              }}
            />
            {t('Min. balance')}
          </Button>

          {/* Threshold amount input — shown only when threshold is enabled */}
          {thresholdEnabled && (
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
            >
              <Text style={{ fontSize: 11, color: theme.pageTextSubdued }}>
                €
              </Text>
              <input
                type="number"
                min={0}
                step={100}
                value={thresholdInput}
                onChange={e => setThresholdInput(e.target.value)}
                onBlur={handleThresholdBlur}
                style={{
                  width: 70,
                  fontSize: 11,
                  padding: '2px 4px',
                  border: `1px solid ${theme.tableBorder}`,
                  borderRadius: 4,
                  backgroundColor: theme.tableBackground,
                  color: theme.pageText,
                }}
              />
            </View>
          )}

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
            <Trans>Income</Trans>
          </Button>

          <SourceBadges entries={rawAllEntries} />

          {/* Export .ics */}
          <Button
            variant="bare"
            isDisabled={allEntries.length === 0}
            onPress={() => {
              const now = new Date();
              const yyyy = now.getFullYear();
              const mm = String(now.getMonth() + 1).padStart(2, '0');
              downloadICS(allEntries, `actual-calendar-${yyyy}-${mm}.ics`);
            }}
          >
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
            >
              <SvgDownloadThickBottom
                style={{ width: 13, height: 13, color: theme.pageTextSubdued }}
              />
              <Text style={{ fontSize: 12, color: theme.pageTextSubdued }}>
                {t('Export .ics')}
              </Text>
            </View>
          </Button>

          <Button variant="bare" onPress={reload}>
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
            >
              <SvgCalendar
                style={{ width: 13, height: 13, color: theme.pageTextSubdued }}
              />
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
          balanceThreshold={thresholdEnabled ? balanceThreshold : null}
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

function formatWindowLabel(start: string, end: string): string {
  const fmt = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString('de-DE', {
      day: 'numeric',
      month: 'short',
    });
  return `${fmt(start)} – ${fmt(end)}`;
}

function PaydayDayPicker({
  currentDay,
  onChange,
}: {
  currentDay: number;
  onChange: (day: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Text style={{ fontSize: 11, color: theme.pageTextSubdued }}>
        <Trans>Payday:</Trans>
      </Text>
      <select
        value={currentDay}
        onChange={e => onChange(parseInt(e.target.value, 10))}
        style={{
          fontSize: 11,
          padding: '2px 4px',
          border: `1px solid ${theme.tableBorder}`,
          borderRadius: 4,
          backgroundColor: theme.tableBackground,
          color: theme.pageText,
          cursor: 'pointer',
        }}
      >
        {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
          <option key={d} value={d}>
            {d}.
          </option>
        ))}
      </select>
    </View>
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
    <div className="flex items-center gap-1.5">
      {counts.schedules > 0 && (
        <Badge variant="outline" className="gap-1 text-[10px] px-2 py-0">
          <SvgCalendar
            style={{ width: 10, height: 10, color: theme.pageTextSubdued }}
          />
          {t('{{count}} Schedule(s)', { count: counts.schedules })}
        </Badge>
      )}
      {counts.contracts > 0 && (
        <Badge variant="outline" className="gap-1 text-[10px] px-2 py-0">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: theme.pageTextSubdued }}
          />
          {t('{{count}} Contract(s)', { count: counts.contracts })}
        </Badge>
      )}
    </div>
  );
}

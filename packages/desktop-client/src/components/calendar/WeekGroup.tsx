// @ts-strict-ignore
import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { theme } from '@actual-app/components/theme';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';
import { SvgCheveronDown, SvgCheveronRight } from '@actual-app/components/icons/v1';

import { BalanceProjectionLine } from './BalanceProjectionLine';
import { CrunchDayIndicator, isCrunchDay } from './CrunchDayIndicator';
import { PaymentItem } from './PaymentItem';
import type { WeekData } from './types';

interface Props {
  week: WeekData;
}

function formatWeekHeader(weekStart: string): string {
  const d = new Date(weekStart + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatCurrency(cents: number): string {
  const abs = Math.abs(cents);
  const formatted = (abs / 100).toFixed(2);
  return cents < 0 ? `-€${formatted}` : `€${formatted}`;
}

/** Group entries by their date string for crunch-day detection. */
function getByDay(week: WeekData): Map<string, { count: number; total: number }> {
  const map = new Map<string, { count: number; total: number }>();
  for (const entry of week.entries) {
    const prev = map.get(entry.date) ?? { count: 0, total: 0 };
    map.set(entry.date, {
      count: prev.count + 1,
      total: prev.total + entry.amount,
    });
  }
  return map;
}

export function WeekGroup({ week }: Props) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(true);

  const toggle = useCallback(() => setExpanded(prev => !prev), []);

  const byDay = useMemo(() => getByDay(week), [week]);

  const hasCrunchDay = useMemo(() => {
    for (const [, day] of byDay) {
      if (isCrunchDay(day.count, day.total)) return true;
    }
    return false;
  }, [byDay]);

  const weekTotalColor = week.totalAmount < 0 ? theme.errorText : '#10b981';

  return (
    <View
      style={{
        marginBottom: 12,
        borderRadius: 6,
        border: `1px solid ${theme.tableBorder}`,
        overflow: 'hidden',
        backgroundColor: theme.tableBackground,
      }}
    >
      {/* Week header row */}
      <View
        onClick={toggle}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          padding: '8px 12px',
          backgroundColor: theme.tableHeaderBackground,
          cursor: 'pointer',
          gap: 8,
          ':hover': {
            backgroundColor: theme.tableRowBackgroundHover,
          },
        }}
      >
        {/* Chevron */}
        <View style={{ flexShrink: 0, width: 14, alignItems: 'center' }}>
          {expanded ? (
            <SvgCheveronDown style={{ width: 12, height: 12, color: theme.pageTextSubdued }} />
          ) : (
            <SvgCheveronRight style={{ width: 12, height: 12, color: theme.pageTextSubdued }} />
          )}
        </View>

        {/* "Week of ..." label */}
        <Text style={{ flex: 1, fontSize: 13, fontWeight: 600, color: theme.pageText }}>
          {t('Week of {{date}}', { date: formatWeekHeader(week.weekStart) })}
        </Text>

        {/* Crunch day indicator */}
        {hasCrunchDay && (() => {
          // Find the worst day for the indicator
          let maxCount = 0;
          let maxTotal = 0;
          for (const [, day] of byDay) {
            if (isCrunchDay(day.count, day.total)) {
              if (day.count > maxCount || Math.abs(day.total) > Math.abs(maxTotal)) {
                maxCount = day.count;
                maxTotal = day.total;
              }
            }
          }
          return <CrunchDayIndicator paymentCount={maxCount} totalCents={maxTotal} />;
        })()}

        {/* Entry count */}
        <Text style={{ fontSize: 11, color: theme.pageTextSubdued, flexShrink: 0 }}>
          {t('{{count}} payment', { count: week.entries.length })}
          {week.entries.length !== 1 ? 's' : ''}
        </Text>

        {/* Week total */}
        <Text
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: weekTotalColor,
            flexShrink: 0,
            minWidth: 70,
            textAlign: 'right',
          }}
        >
          {formatCurrency(week.totalAmount)}
        </Text>
      </View>

      {/* Entries */}
      {expanded && (
        <>
          {week.entries.length === 0 ? (
            <View style={{ padding: '10px 12px' }}>
              <Text style={{ fontSize: 12, color: theme.pageTextSubdued }}>
                {t('No payments this week')}
              </Text>
            </View>
          ) : (
            week.entries.map((entry, idx) => (
              <PaymentItem
                key={entry.id}
                entry={entry}
                isLast={idx === week.entries.length - 1}
              />
            ))
          )}

          {/* Balance projection */}
          <View
            style={{
              padding: '6px 12px',
              borderTop: `1px solid ${theme.tableBorder}`,
              backgroundColor: `${theme.tableHeaderBackground}80`,
            }}
          >
            <BalanceProjectionLine balance={week.runningBalance} />
          </View>
        </>
      )}
    </View>
  );
}

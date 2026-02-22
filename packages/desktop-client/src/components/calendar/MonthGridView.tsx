// @ts-strict-ignore
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { theme } from '@actual-app/components/theme';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';

import type { CalendarEntry } from './types';

// ─── Date helpers ─────────────────────────────────────────────────────────────

const EUR_FORMATTER = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

function formatEurCents(cents: number): string {
  return EUR_FORMATTER.format(Math.abs(cents) / 100);
}

const DE_DATE_FORMATTER = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/** Format an ISO date string (YYYY-MM-DD) as de-DE locale date (DD.MM.YYYY). */
function formatDateDE(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return DE_DATE_FORMATTER.format(new Date(year, month - 1, day));
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** First day (Monday) of the first week shown for a given month. */
function getGridStart(year: number, month: number): Date {
  const first = new Date(year, month, 1);
  const dow = first.getDay(); // 0=Sun
  const diff = dow === 0 ? -6 : 1 - dow;
  const d = new Date(first);
  d.setDate(d.getDate() + diff);
  return d;
}

// ─── Day cell ─────────────────────────────────────────────────────────────────

type DayCellProps = {
  date: string; // YYYY-MM-DD
  isCurrentMonth: boolean;
  isToday: boolean;
  entries: CalendarEntry[];
  isExpanded: boolean;
  onToggle: () => void;
};

function DayCell({ date, isCurrentMonth, isToday, entries, isExpanded, onToggle }: DayCellProps) {
  const { t } = useTranslation();
  const day = parseInt(date.slice(8), 10);

  const expenseTotal = useMemo(
    () => entries.filter(e => e.amount < 0).reduce((s, e) => s + e.amount, 0),
    [entries],
  );

  const incomeTotal = useMemo(
    () => entries.filter(e => e.amount > 0).reduce((s, e) => s + e.amount, 0),
    [entries],
  );

  const hasEntries = entries.length > 0;

  return (
    <View
      style={{
        borderRight: `1px solid ${theme.tableBorder}`,
        borderBottom: `1px solid ${theme.tableBorder}`,
        minHeight: 80,
        padding: '4px 6px',
        backgroundColor: isToday
          ? `${theme.buttonPrimaryBackground}10`
          : isCurrentMonth
            ? theme.tableBackground
            : `${theme.tableHeaderBackground}80`,
        cursor: hasEntries ? 'pointer' : 'default',
        position: 'relative',
      }}
      onClick={hasEntries ? onToggle : undefined}
    >
      {/* Day number */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
        <Text
          style={{
            fontSize: 12,
            fontWeight: isToday ? 700 : 400,
            color: isToday
              ? theme.buttonPrimaryBackground
              : isCurrentMonth
                ? theme.pageText
                : theme.pageTextSubdued,
            width: 22,
            height: 22,
            lineHeight: '22px',
            textAlign: 'center',
            borderRadius: '50%',
            backgroundColor: isToday ? `${theme.buttonPrimaryBackground}20` : undefined,
          }}
        >
          {day}
        </Text>
      </View>

      {/* Payment dots / summary */}
      {hasEntries && !isExpanded && (
        <View style={{ gap: 2 }}>
          {/* Up to 2 items shown as dots with name */}
          {entries.slice(0, 2).map(entry => (
            <View
              key={entry.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  backgroundColor: entry.type === 'contract' ? '#3b82f6' : '#f59e0b',
                  flexShrink: 0,
                }}
              />
              <Text
                style={{
                  fontSize: 10,
                  color: theme.pageText,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                  maxWidth: 80,
                }}
              >
                {entry.name}
              </Text>
            </View>
          ))}
          {entries.length > 2 && (
            <Text style={{ fontSize: 10, color: theme.pageTextSubdued }}>
              {t('+{{n}} more', { n: entries.length - 2 })}
            </Text>
          )}
          {expenseTotal !== 0 && (
            <Text style={{ fontSize: 10, color: '#ef4444', fontWeight: 600, marginTop: 2 }}>
              {`-${formatEurCents(expenseTotal)}`}
            </Text>
          )}
        </View>
      )}

      {/* Expanded detail panel */}
      {isExpanded && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 10,
            backgroundColor: theme.modalBackground ?? theme.tableBackground,
            border: `1px solid ${theme.tableBorder}`,
            borderRadius: 6,
            padding: 10,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            minWidth: 180,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>
              {formatDateDE(date)}
            </Text>
            <Button
              variant="bare"
              onPress={onToggle}
              style={{
                color: theme.pageTextSubdued,
                fontSize: 16,
                padding: '0 4px',
              }}
            >
              ×
            </Button>
          </View>
          {entries.map(entry => (
            <View
              key={entry.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '4px 0',
                borderBottom: `1px solid ${theme.tableBorder}`,
                gap: 8,
              }}
            >
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: entry.type === 'contract' ? '#3b82f6' : '#f59e0b',
                  flexShrink: 0,
                }}
              />
              <Text style={{ fontSize: 12, flex: 1, color: theme.pageText }}>
                {entry.name}
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: entry.amount < 0 ? '#ef4444' : '#10b981',
                  whiteSpace: 'nowrap',
                }}
              >
                {entry.amount < 0 ? '-' : '+'}{formatEurCents(entry.amount)}
              </Text>
            </View>
          ))}
          {expenseTotal !== 0 && (
            <Text style={{ fontSize: 11, color: '#ef4444', marginTop: 6, textAlign: 'right' }}>
              {t('Total expenses')}: -{formatEurCents(expenseTotal)}
            </Text>
          )}
          {incomeTotal > 0 && (
            <Text style={{ fontSize: 11, color: '#10b981', textAlign: 'right' }}>
              {t('Total income')}: +{formatEurCents(incomeTotal)}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type MonthGridViewProps = {
  allEntries: CalendarEntry[];
  loading?: boolean;
};

const DAY_HEADERS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

export function MonthGridView({ allEntries, loading = false }: MonthGridViewProps) {
  const { t } = useTranslation();
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth()); // 0-indexed
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

  const todayStr = toISODate(today);

  // Build 6×7 grid of date strings
  const grid: string[][] = useMemo(() => {
    const gridStart = getGridStart(viewYear, viewMonth);
    const rows: string[][] = [];
    const cursor = new Date(gridStart);
    for (let row = 0; row < 6; row++) {
      const week: string[] = [];
      for (let col = 0; col < 7; col++) {
        week.push(toISODate(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }
      rows.push(week);
      // Stop early if we're into the next month past the last row with current-month days
      if (row >= 4 && !week.some(d => parseInt(d.slice(5, 7), 10) - 1 === viewMonth)) break;
    }
    return rows;
  }, [viewYear, viewMonth]);

  // Group entries by date
  const entriesByDate = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>();
    for (const entry of allEntries) {
      const bucket = map.get(entry.date) ?? [];
      bucket.push(entry);
      map.set(entry.date, bucket);
    }
    return map;
  }, [allEntries]);

  const monthName = new Date(viewYear, viewMonth, 1).toLocaleString('de-DE', {
    month: 'long',
    year: 'numeric',
  });

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const toggleExpand = (date: string) => {
    setExpandedDate(prev => prev === date ? null : date);
  };

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.tableBackground,
        borderRadius: 6,
        border: `1px solid ${theme.tableBorder}`,
        overflow: 'hidden',
      }}
    >
      {/* Month navigation header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          padding: '10px 16px',
          borderBottom: `1px solid ${theme.tableBorder}`,
          backgroundColor: theme.tableHeaderBackground,
        }}
      >
        <Button
          variant="bare"
          onPress={prevMonth}
          style={{ color: theme.pageText, fontSize: 18, padding: '0 8px' }}
        >
          ‹
        </Button>
        <Text style={{ flex: 1, textAlign: 'center', fontWeight: 600, fontSize: 14 }}>
          {monthName}
        </Text>
        <Button
          variant="bare"
          onPress={nextMonth}
          style={{ color: theme.pageText, fontSize: 18, padding: '0 8px' }}
        >
          ›
        </Button>
        <Button
          variant="bare"
          onPress={() => { setViewYear(today.getFullYear()); setViewMonth(today.getMonth()); }}
          style={{ fontSize: 11, marginLeft: 8 }}
        >
          {t('Today')}
        </Button>
      </View>

      {/* Day-of-week header row */}
      <View
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          borderBottom: `1px solid ${theme.tableBorder}`,
        } as React.CSSProperties}
      >
        {DAY_HEADERS.map(d => (
          <View
            key={d}
            style={{
              padding: '6px 0',
              alignItems: 'center',
              borderRight: `1px solid ${theme.tableBorder}`,
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: theme.tableHeaderText,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              {d}
            </Text>
          </View>
        ))}
      </View>

      {/* Grid rows */}
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}>
          <Text style={{ color: theme.pageTextSubdued }}>{t('Loading…')}</Text>
        </View>
      ) : (
        grid.map((week, rowIdx) => (
          <View
            key={rowIdx}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(7, 1fr)',
              flex: 1,
            } as React.CSSProperties}
          >
            {week.map(dateStr => {
              const cellMonth = parseInt(dateStr.slice(5, 7), 10) - 1;
              return (
                <DayCell
                  key={dateStr}
                  date={dateStr}
                  isCurrentMonth={cellMonth === viewMonth}
                  isToday={dateStr === todayStr}
                  entries={entriesByDate.get(dateStr) ?? []}
                  isExpanded={expandedDate === dateStr}
                  onToggle={() => toggleExpand(dateStr)}
                />
              );
            })}
          </View>
        ))
      )}
    </View>
  );
}

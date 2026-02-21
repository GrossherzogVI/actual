// @ts-strict-ignore
import { useCallback, useEffect, useMemo, useState } from 'react';

import { send } from 'loot-core/platform/client/connection';

import { useMetadataPref } from '@desktop-client/hooks/useMetadataPref';

import type { CalendarEntry, WeekData } from '../types';

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Return the Monday of the week containing `date`. */
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const dow = d.getDay(); // 0=Sun
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Advance a YYYY-MM-DD string by `n` days. */
function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

// ---------------------------------------------------------------------------
// Next-date generation for contracts
// ---------------------------------------------------------------------------

type ContractInterval = 'weekly' | 'monthly' | 'quarterly' | 'yearly' | string;

/** Compute all payment dates for a contract within [from, to]. */
function getContractDates(
  startDate: string,
  interval: ContractInterval,
  fromDate: string,
  toDate: string,
): string[] {
  const results: string[] = [];
  const from = new Date(fromDate + 'T00:00:00');
  const to = new Date(toDate + 'T00:00:00');

  let cursor = new Date(startDate + 'T00:00:00');

  // Advance cursor to be on or after `from`
  let iterations = 0;
  while (cursor < from && iterations < 1000) {
    cursor = advanceByInterval(cursor, interval);
    iterations++;
  }

  while (cursor <= to && results.length < 90) {
    results.push(toISODate(cursor));
    cursor = advanceByInterval(cursor, interval);
  }

  return results;
}

function advanceByInterval(d: Date, interval: ContractInterval): Date {
  const next = new Date(d);
  switch (interval) {
    case 'weekly':
      next.setDate(next.getDate() + 7);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      break;
    case 'quarterly':
      next.setMonth(next.getMonth() + 3);
      break;
    case 'yearly':
      next.setFullYear(next.getFullYear() + 1);
      break;
    default:
      // Treat unknown intervals as monthly
      next.setMonth(next.getMonth() + 1);
  }
  return next;
}

// ---------------------------------------------------------------------------
// Group entries by week
// ---------------------------------------------------------------------------

export function groupByWeek(entries: CalendarEntry[], startingBalance: number): WeekData[] {
  if (entries.length === 0) return [];

  const map = new Map<string, CalendarEntry[]>();

  for (const entry of entries) {
    const d = new Date(entry.date + 'T00:00:00');
    const weekStart = toISODate(getWeekStart(d));
    const bucket = map.get(weekStart) ?? [];
    bucket.push(entry);
    map.set(weekStart, bucket);
  }

  const sortedKeys = Array.from(map.keys()).sort();

  let runningBalance = startingBalance;
  return sortedKeys.map(weekStart => {
    const weekEntries = map.get(weekStart)!.sort((a, b) => a.date.localeCompare(b.date));
    const totalAmount = weekEntries.reduce((sum, e) => sum + e.amount, 0);
    runningBalance += totalAmount;

    // Sunday of this week = weekStart + 6 days
    const weekEnd = addDays(weekStart, 6);

    return {
      weekStart,
      weekEnd,
      entries: weekEntries,
      totalAmount,
      runningBalance,
    };
  });
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

interface ContractRaw {
  id: string;
  name: string;
  amount: number | null;
  interval: string | null;
  start_date: string | null;
  status: string;
  type: string | null;
}

interface UseCalendarDataResult {
  weeks: WeekData[];
  allEntries: CalendarEntry[];
  loading: boolean;
  error: string | null;
  reload: () => void;
  startingBalance: number;
}

export function useCalendarData(): UseCalendarDataResult {
  const [budgetId] = useMetadataPref('id');
  const [contracts, setContracts] = useState<ContractRaw[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // We use 0 as a placeholder — real balance would come from account data.
  // For the MVP we show relative projections from 0 so the shape is visible.
  const startingBalance = 0;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await (send as Function)('contract-list', {
        fileId: budgetId,
        status: 'active',
      });
      if (result && !('error' in result)) {
        setContracts(result as ContractRaw[]);
      } else if (result && 'error' in result) {
        setError(result.error);
      }
    } catch (e) {
      setError('Failed to load calendar data');
    } finally {
      setLoading(false);
    }
  }, [budgetId]);

  useEffect(() => {
    void load();
  }, [load]);

  const allEntries = useMemo<CalendarEntry[]>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const fromDate = toISODate(today);
    const toDate30 = new Date(today);
    toDate30.setDate(today.getDate() + 30);
    const toDate = toISODate(toDate30);

    const entries: CalendarEntry[] = [];

    for (const contract of contracts) {
      if (!contract.amount || !contract.interval) continue;

      const startDate = contract.start_date ?? fromDate;
      const dates = getContractDates(startDate, contract.interval, fromDate, toDate);

      for (const date of dates) {
        entries.push({
          id: `${contract.id}-${date}`,
          date,
          name: contract.name,
          // Contracts are expenses (negative)
          amount: -(Math.abs(contract.amount)),
          type: 'contract',
          sourceId: contract.id,
          contractType: contract.type ?? undefined,
          interval: contract.interval ?? undefined,
        });
      }
    }

    // Sort chronologically
    entries.sort((a, b) => a.date.localeCompare(b.date));
    return entries;
  }, [contracts]);

  const weeks = useMemo(
    () => groupByWeek(allEntries, startingBalance),
    [allEntries, startingBalance],
  );

  return { weeks, allEntries, loading, error, reload: load, startingBalance };
}

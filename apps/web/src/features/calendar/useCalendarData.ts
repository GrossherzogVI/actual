import { useMemo } from 'react';

import { useQuery } from '@tanstack/react-query';

import {
  getDashboardPulse,
  listContracts,
  listSchedules,
  listTransactions,
} from '../../core/api/finance-api';
import type { Contract, Schedule } from '../../core/types/finance';

export type Payment = {
  id: string;
  name: string;
  amount: number;
  source: 'contract' | 'schedule' | 'transaction';
  provider?: string;
};

export type CalendarDay = {
  date: string; // YYYY-MM-DD
  payments: Payment[];
  runningBalance: number;
};

export type CalendarData = {
  days: CalendarDay[];
  totalBalance: number;
  loading: boolean;
};

// -- Interval helpers --

const INTERVAL_DAYS: Record<Contract['interval'], number> = {
  weekly: 7,
  monthly: 30,
  quarterly: 91,
  'semi-annual': 182,
  annual: 365,
  custom: 30,
};

const FREQUENCY_DAYS: Record<Schedule['frequency'], number> = {
  weekly: 7,
  monthly: 30,
  yearly: 365,
  custom: 30,
};

function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + n);
  return result;
}

function advanceByInterval(
  base: Date,
  interval: Contract['interval'] | Schedule['frequency'],
): Date {
  const result = new Date(base);
  switch (interval) {
    case 'weekly':
      result.setDate(result.getDate() + 7);
      break;
    case 'monthly':
      result.setMonth(result.getMonth() + 1);
      break;
    case 'quarterly':
      result.setMonth(result.getMonth() + 3);
      break;
    case 'semi-annual':
      result.setMonth(result.getMonth() + 6);
      break;
    case 'annual':
    case 'yearly':
      result.setFullYear(result.getFullYear() + 1);
      break;
    case 'custom':
      result.setMonth(result.getMonth() + 1);
      break;
  }
  return result;
}

/**
 * Project payment dates for a contract within a date range.
 * Uses start_date if available, otherwise estimates from today.
 */
function projectContractDates(
  contract: Contract,
  rangeStart: Date,
  rangeEnd: Date,
): Date[] {
  const dates: Date[] = [];
  let cursor: Date;

  if (contract.start_date) {
    cursor = new Date(contract.start_date);
  } else {
    // No start date: assume first payment is rangeStart, on the 1st
    cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
  }

  // Walk backward if cursor is after range to find an anchor
  const intervalDays = INTERVAL_DAYS[contract.interval] ?? 30;
  while (cursor > rangeEnd) {
    cursor = addDays(cursor, -intervalDays);
  }

  // Walk forward to get into range
  while (cursor < rangeStart) {
    cursor = advanceByInterval(cursor, contract.interval);
  }

  // Collect dates within range (max 20 to prevent infinite loops)
  let safety = 0;
  while (cursor <= rangeEnd && safety < 20) {
    dates.push(new Date(cursor));
    cursor = advanceByInterval(cursor, contract.interval);
    safety++;
  }

  return dates;
}

/**
 * Project payment dates for a schedule within a date range.
 */
function projectScheduleDates(
  schedule: Schedule,
  rangeStart: Date,
  rangeEnd: Date,
): Date[] {
  const dates: Date[] = [];
  let cursor = new Date(schedule.next_date);

  // Walk backward if needed
  const freqDays = FREQUENCY_DAYS[schedule.frequency] ?? 30;
  while (cursor > rangeEnd) {
    cursor = addDays(cursor, -freqDays);
  }

  while (cursor < rangeStart) {
    cursor = advanceByInterval(cursor, schedule.frequency);
  }

  let safety = 0;
  while (cursor <= rangeEnd && safety < 20) {
    dates.push(new Date(cursor));
    cursor = advanceByInterval(cursor, schedule.frequency);
    safety++;
  }

  return dates;
}

export function useCalendarData(
  rangeStart: Date,
  rangeEnd: Date,
): CalendarData {
  const startStr = toDateString(rangeStart);
  const endStr = toDateString(rangeEnd);

  const { data: contracts, isLoading: contractsLoading } = useQuery({
    queryKey: ['contracts'],
    queryFn: listContracts,
  });

  const { data: schedules, isLoading: schedulesLoading } = useQuery({
    queryKey: ['schedules', 'active'],
    queryFn: () => listSchedules({ activeOnly: true }),
  });

  const { data: transactions, isLoading: txLoading } = useQuery({
    queryKey: ['transactions', startStr, endStr],
    queryFn: () =>
      listTransactions({ startDate: startStr, endDate: endStr, limit: 500 }),
  });

  const { data: pulse, isLoading: pulseLoading } = useQuery({
    queryKey: ['dashboard-pulse'],
    queryFn: getDashboardPulse,
  });

  const loading =
    contractsLoading || schedulesLoading || txLoading || pulseLoading;
  const totalBalance = pulse?.total_balance ?? 0;

  const days = useMemo(() => {
    if (loading) return [];

    // Build a map: dateStr -> Payment[]
    const dayMap = new Map<string, Payment[]>();

    function ensureDay(dateStr: string): Payment[] {
      let arr = dayMap.get(dateStr);
      if (!arr) {
        arr = [];
        dayMap.set(dateStr, arr);
      }
      return arr;
    }

    // 1. Project contract payments
    for (const contract of contracts ?? []) {
      if (contract.status !== 'active') continue;
      const dates = projectContractDates(contract, rangeStart, rangeEnd);
      for (const d of dates) {
        const ds = toDateString(d);
        ensureDay(ds).push({
          id: `contract-${contract.id}-${ds}`,
          name: contract.name,
          amount: -Math.abs(contract.amount),
          source: 'contract',
          provider: contract.provider,
        });
      }
    }

    // 2. Project schedule payments
    for (const schedule of schedules ?? []) {
      const dates = projectScheduleDates(schedule, rangeStart, rangeEnd);
      for (const d of dates) {
        const ds = toDateString(d);
        ensureDay(ds).push({
          id: `schedule-${schedule.id}-${ds}`,
          name: schedule.name,
          amount: schedule.amount,
          source: 'schedule',
        });
      }
    }

    // 3. Add actual transactions
    for (const tx of transactions ?? []) {
      const ds = tx.date.slice(0, 10); // YYYY-MM-DD from ISO
      ensureDay(ds).push({
        id: `tx-${tx.id}`,
        name: tx.payee_name ?? tx.notes ?? 'Transaktion',
        amount: tx.amount,
        source: 'transaction',
      });
    }

    // Sort dates and compute running balance
    const sortedDates = [...dayMap.keys()].sort();
    let balance = totalBalance;
    const result: CalendarDay[] = [];

    // For future dates, subtract payments to project balance.
    // For past dates, balance is already reflected in totalBalance.
    const todayStr = toDateString(new Date());

    for (const dateStr of sortedDates) {
      const payments = dayMap.get(dateStr)!;
      const isFuture = dateStr > todayStr;

      if (isFuture) {
        const dayTotal = payments.reduce((sum, p) => sum + p.amount, 0);
        balance += dayTotal;
      }

      result.push({
        date: dateStr,
        payments,
        runningBalance: balance,
      });
    }

    return result;
  }, [
    loading,
    contracts,
    schedules,
    transactions,
    totalBalance,
    rangeStart,
    rangeEnd,
  ]);

  return { days, totalBalance, loading };
}

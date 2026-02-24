// @ts-strict-ignore
import { useCallback, useEffect, useMemo, useState } from 'react';

import { send } from 'loot-core/platform/client/connection';
import { q } from 'loot-core/shared/query';
import { getScheduledAmount } from 'loot-core/shared/schedules';
import type { ScheduleEntity } from 'loot-core/types/models';

import { usePayees } from '@desktop-client/hooks/usePayees';
import { useSchedules } from '@desktop-client/hooks/useSchedules';

import type {
  ContractEntity,
  UpcomingPayment,
} from '@/components/dashboard/types';

/** Clamp day to the last valid day of the given month. */
function clampDay(year: number, month: number, day: number): number {
  const lastDay = new Date(year, month + 1, 0).getDate();
  return Math.min(day, lastDay);
}

function getNextPaymentDate(contract: ContractEntity, from: Date): Date | null {
  if (!contract.start_date) return null;
  const start = new Date(contract.start_date);
  if (isNaN(start.getTime())) return null;

  // For monthly contracts, find the next occurrence on or after `from`
  const dayOfMonth = start.getDate();
  const clampedDay = clampDay(from.getFullYear(), from.getMonth(), dayOfMonth);
  const candidate = new Date(from.getFullYear(), from.getMonth(), clampedDay);
  if (candidate < from) {
    const nextMonth = from.getMonth() + 1;
    const nextYear = from.getFullYear();
    const nextClampedDay = clampDay(nextYear, nextMonth, dayOfMonth);
    return new Date(nextYear, nextMonth, nextClampedDay);
  }
  return candidate;
}

function getPaymentDatesWithinDays(
  contract: ContractEntity,
  days: number,
): Date[] {
  if (
    !contract.amount ||
    contract.status === 'cancelled' ||
    contract.status === 'paused'
  ) {
    return [];
  }

  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const until = new Date(from);
  until.setDate(until.getDate() + days);

  const dates: Date[] = [];

  if (contract.interval === 'monthly') {
    const next = getNextPaymentDate(contract, from);
    if (next && next <= until) {
      dates.push(next);
    }
  } else if (contract.interval === 'weekly') {
    if (!contract.start_date) return [];
    const start = new Date(contract.start_date);
    const current = new Date(start);
    while (current < from) {
      current.setDate(current.getDate() + 7);
    }
    while (current <= until) {
      dates.push(new Date(current));
      current.setDate(current.getDate() + 7);
    }
  } else if (contract.interval === 'annual' || contract.interval === 'yearly') {
    if (!contract.start_date) return [];
    const start = new Date(contract.start_date);
    const day = clampDay(from.getFullYear(), start.getMonth(), start.getDate());
    const candidate = new Date(from.getFullYear(), start.getMonth(), day);
    if (candidate < from) {
      const nextDay = clampDay(
        from.getFullYear() + 1,
        start.getMonth(),
        start.getDate(),
      );
      const nextCandidate = new Date(
        from.getFullYear() + 1,
        start.getMonth(),
        nextDay,
      );
      if (nextCandidate <= until) {
        dates.push(nextCandidate);
      }
    } else if (candidate <= until) {
      dates.push(candidate);
    }
  } else if (contract.interval === 'quarterly') {
    if (!contract.start_date) return [];
    const start = new Date(contract.start_date);
    const current = new Date(start);
    while (current < from) {
      const nextMonth = current.getMonth() + 3;
      const day = clampDay(current.getFullYear(), nextMonth, start.getDate());
      current.setFullYear(current.getFullYear(), nextMonth, day);
    }
    while (current <= until) {
      dates.push(new Date(current));
      const nextMonth = current.getMonth() + 3;
      const day = clampDay(current.getFullYear(), nextMonth, start.getDate());
      current.setFullYear(current.getFullYear(), nextMonth, day);
    }
  } else if (contract.interval === 'semi-annual') {
    if (!contract.start_date) return [];
    const start = new Date(contract.start_date);
    const current = new Date(start);
    while (current < from) {
      const nextMonth = current.getMonth() + 6;
      const day = clampDay(current.getFullYear(), nextMonth, start.getDate());
      current.setFullYear(current.getFullYear(), nextMonth, day);
    }
    while (current <= until) {
      dates.push(new Date(current));
      const nextMonth = current.getMonth() + 6;
      const day = clampDay(current.getFullYear(), nextMonth, start.getDate());
      current.setFullYear(current.getFullYear(), nextMonth, day);
    }
  }

  return dates;
}

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

import {
  getScheduleInterval,
  getScheduleName,
} from '@desktop-client/utils/schedule-helpers';

export function useUpcomingPayments(withinDays = 14): {
  payments: UpcomingPayment[];
  grouped: Map<string, UpcomingPayment[]>;
  loading: boolean;
  error: string | null;
} {
  const [contractPayments, setContractPayments] = useState<UpcomingPayment[]>(
    [],
  );
  const [contractsLoading, setContractsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch schedules from Actual's schedule engine
  const schedulesQuery = useMemo(
    () => q('schedules').select('*').filter({ '_account.closed': false }),
    [],
  );
  const { schedules, isLoading: schedulesLoading } = useSchedules({
    query: schedulesQuery,
  });

  // Fetch payees for schedule name resolution
  const { data: payees } = usePayees();
  const payeesById = useMemo(() => {
    const map = new Map<string, { name: string }>();
    for (const p of payees ?? []) {
      map.set(p.id, { name: p.name });
    }
    return map;
  }, [payees]);

  const loading = contractsLoading || schedulesLoading;

  const load = useCallback(async () => {
    setContractsLoading(true);
    setError(null);

    let result: unknown;
    try {
      result = await (send as Function)('contract-list', { status: 'active' });
    } catch (err) {
      setError(String(err));
      setContractPayments([]);
      setContractsLoading(false);
      return;
    }
    if (result && typeof result === 'object' && 'error' in result) {
      setError((result as { error: string }).error);
      setContractPayments([]);
      setContractsLoading(false);
      return;
    }

    const contracts = (result as ContractEntity[]) ?? [];
    const upcoming: UpcomingPayment[] = [];

    for (const contract of contracts) {
      const dates = getPaymentDatesWithinDays(contract, withinDays);
      for (const date of dates) {
        upcoming.push({
          date: toDateString(date),
          contractId: contract.id,
          name: contract.name,
          amount: contract.amount,
          interval: contract.interval,
        });
      }
    }

    upcoming.sort((a, b) => a.date.localeCompare(b.date));
    setContractPayments(upcoming);
    setContractsLoading(false);
  }, [withinDays]);

  useEffect(() => {
    void load();
  }, [load]);

  // Map schedules to UpcomingPayment format and merge with contract payments
  const payments = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const fromDate = toDateString(today);
    const until = new Date(today);
    until.setDate(until.getDate() + withinDays);
    const toDate = toDateString(until);

    const schedulePayments: UpcomingPayment[] = [];

    for (const schedule of schedules) {
      if (schedule.completed || !schedule.next_date) continue;

      const nextDate = schedule.next_date;
      if (nextDate >= fromDate && nextDate <= toDate) {
        const amount = getScheduledAmount(schedule._amount);
        schedulePayments.push({
          date: nextDate,
          contractId: schedule.id, // reuse field for source ID
          name: getScheduleName(schedule, payeesById),
          amount,
          interval: getScheduleInterval(schedule),
        });
      }
    }

    // Merge and sort by date
    return [...contractPayments, ...schedulePayments].sort((a, b) =>
      a.date.localeCompare(b.date),
    );
  }, [contractPayments, schedules, payeesById, withinDays]);

  const grouped = useMemo(() => {
    const map = new Map<string, UpcomingPayment[]>();
    for (const p of payments) {
      const existing = map.get(p.date) ?? [];
      existing.push(p);
      map.set(p.date, existing);
    }
    return map;
  }, [payments]);

  return { payments, grouped, loading, error };
}

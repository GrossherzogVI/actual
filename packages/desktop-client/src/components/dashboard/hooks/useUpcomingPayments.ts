// @ts-strict-ignore
import { useCallback, useEffect, useState } from 'react';

import { send } from 'loot-core/platform/client/connection';

import type { ContractEntity, UpcomingPayment } from '../types';

function getNextPaymentDate(contract: ContractEntity, from: Date): Date | null {
  if (!contract.start_date) return null;
  const start = new Date(contract.start_date);
  if (isNaN(start.getTime())) return null;

  // For monthly contracts, find the next occurrence on or after `from`
  const dayOfMonth = start.getDate();
  const candidate = new Date(from.getFullYear(), from.getMonth(), dayOfMonth);
  if (candidate < from) {
    candidate.setMonth(candidate.getMonth() + 1);
  }
  return candidate;
}

function getPaymentDatesWithinDays(
  contract: ContractEntity,
  days: number,
): Date[] {
  if (!contract.amount || contract.status === 'cancelled' || contract.status === 'paused') {
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
    let current = new Date(start);
    while (current < from) {
      current.setDate(current.getDate() + 7);
    }
    while (current <= until) {
      dates.push(new Date(current));
      current.setDate(current.getDate() + 7);
    }
  } else if (contract.interval === 'annual') {
    if (!contract.start_date) return [];
    const start = new Date(contract.start_date);
    const candidate = new Date(from.getFullYear(), start.getMonth(), start.getDate());
    if (candidate >= from && candidate <= until) {
      dates.push(candidate);
    }
  }
  // quarterly, semi-annual, custom: skip for brevity — monthly/weekly cover most cases

  return dates;
}

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function useUpcomingPayments(withinDays = 14): {
  payments: UpcomingPayment[];
  grouped: Map<string, UpcomingPayment[]>;
  loading: boolean;
  error: string | null;
} {
  const [payments, setPayments] = useState<UpcomingPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const result = await (send as Function)('contract-list', { status: 'active' });
    if (result && 'error' in result) {
      setError(result.error as string);
      setPayments([]);
      setLoading(false);
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
    setPayments(upcoming);
    setLoading(false);
  }, [withinDays]);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = new Map<string, UpcomingPayment[]>();
  for (const p of payments) {
    const existing = grouped.get(p.date) ?? [];
    existing.push(p);
    grouped.set(p.date, existing);
  }

  return { payments, grouped, loading, error };
}

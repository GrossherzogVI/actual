import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock account-db before importing engine
vi.mock('../account-db.js', () => {
  const tables: Record<string, unknown[]> = {
    contracts: [],
    invoices: [],
    expected_events: [],
  };

  return {
    getAccountDb: () => ({
      all: (sql: string, _params?: unknown[]) => {
        if (sql.includes('expected_events')) return tables['expected_events'];
        if (sql.includes('FROM invoices')) return tables['invoices'];
        if (sql.includes('FROM contracts')) return tables['contracts'];
        return [];
      },
      _setTable: (table: string, rows: unknown[]) => {
        tables[table] = rows;
      },
      _reset: () => {
        tables['contracts'] = [];
        tables['invoices'] = [];
        tables['expected_events'] = [];
      },
    }),
  };
});

import { getAccountDb } from '../account-db.js';
import { expandEvents, simulateForecast } from './engine.js';
import type { ForecastEvent } from './engine.js';

const mockDb = getAccountDb() as unknown as {
  _setTable: (table: string, rows: unknown[]) => void;
  _reset: () => void;
};

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

describe('expandEvents', () => {
  beforeEach(() => {
    mockDb._reset();
  });

  it('returns empty array when no data exists', () => {
    const events = expandEvents('test-file', 30);
    expect(events).toEqual([]);
  });

  it('expands monthly contracts into recurring events', () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = formatDate(today);

    mockDb._setTable('contracts', [
      {
        id: 'c1',
        name: 'Netflix',
        amount: -1599,
        next_payment_date: todayStr,
        frequency: 'monthly',
      },
    ]);

    const events = expandEvents('test-file', 90);

    // Should have at least 3 occurrences in 90 days (today + ~2 more months)
    expect(events.length).toBeGreaterThanOrEqual(3);
    expect(events[0].sourceType).toBe('contract');
    expect(events[0].sourceId).toBe('c1');
    expect(events[0].amount).toBe(-1599);
    expect(events[0].description).toBe('Netflix');
  });

  it('expands weekly contracts', () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = formatDate(today);

    mockDb._setTable('contracts', [
      {
        id: 'c2',
        name: 'Weekly cleaning',
        amount: -5000,
        next_payment_date: todayStr,
        frequency: 'weekly',
      },
    ]);

    const events = expandEvents('test-file', 28);

    // 28 days = 4 weekly occurrences + today = 5
    expect(events.length).toBe(5);
  });

  it('includes pending invoices within horizon', () => {
    const future = new Date();
    future.setDate(future.getDate() + 15);
    const futureStr = formatDate(future);

    mockDb._setTable('invoices', [
      {
        id: 'inv1',
        contract_name: 'Client payment',
        amount: 500000,
        due_date: futureStr,
      },
    ]);

    const events = expandEvents('test-file', 30);
    expect(events).toHaveLength(1);
    expect(events[0].sourceType).toBe('invoice');
    expect(events[0].amount).toBe(500000);
  });

  it('excludes invoices outside horizon', () => {
    const farFuture = new Date();
    farFuture.setDate(farFuture.getDate() + 200);
    const farFutureStr = formatDate(farFuture);

    mockDb._setTable('invoices', [
      {
        id: 'inv2',
        description: 'Far future invoice',
        amount: 100000,
        due_date: farFutureStr,
      },
    ]);

    const events = expandEvents('test-file', 30);
    expect(events).toHaveLength(0);
  });

  it('includes expected events', () => {
    const future = new Date();
    future.setDate(future.getDate() + 10);
    const futureStr = formatDate(future);

    mockDb._setTable('expected_events', [
      {
        id: 'ee1',
        expected_amount: 250000,
        expected_date: futureStr,
        source_type: 'schedule',
        source_id: 'src1',
      },
    ]);

    const events = expandEvents('test-file', 30);
    expect(events).toHaveLength(1);
    expect(events[0].description).toBe('Expected: schedule');
    expect(events[0].sourceType).toBe('schedule');
  });

  it('sorts all events by date', () => {
    const d1 = new Date();
    d1.setDate(d1.getDate() + 5);
    const d2 = new Date();
    d2.setDate(d2.getDate() + 2);
    const d3 = new Date();
    d3.setDate(d3.getDate() + 10);

    mockDb._setTable('invoices', [
      { id: 'inv-a', description: 'A', amount: 100, due_date: formatDate(d1) },
      { id: 'inv-b', description: 'B', amount: 200, due_date: formatDate(d2) },
      { id: 'inv-c', description: 'C', amount: 300, due_date: formatDate(d3) },
    ]);

    const events = expandEvents('test-file', 30);
    for (let i = 1; i < events.length; i++) {
      expect(events[i].date >= events[i - 1].date).toBe(true);
    }
  });
});

describe('simulateForecast', () => {
  it('returns correct result with no events', () => {
    const result = simulateForecast(100000, [], 30);

    expect(result.dailyCurve).toHaveLength(31); // day 0 through day 30
    expect(result.dailyCurve[0].balance).toBe(100000);
    expect(result.dailyCurve[30].balance).toBe(100000);
    expect(result.worstPoint.balance).toBe(100000);
    expect(result.safeToSpend).toBe(100000);
  });

  it('tracks balance through events correctly', () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const day5 = new Date(today);
    day5.setDate(day5.getDate() + 5);
    const day10 = new Date(today);
    day10.setDate(day10.getDate() + 10);

    const events: ForecastEvent[] = [
      {
        date: formatDate(day5),
        amount: -50000,
        description: 'Expense',
        sourceType: 'contract',
        sourceId: 'c1',
      },
      {
        date: formatDate(day10),
        amount: 200000,
        description: 'Income',
        sourceType: 'invoice',
        sourceId: 'inv1',
      },
    ];

    const result = simulateForecast(100000, events, 30);

    // Day 0-4: balance = 100000
    expect(result.dailyCurve[0].balance).toBe(100000);
    // Day 5: balance = 100000 - 50000 = 50000
    expect(result.dailyCurve[5].balance).toBe(50000);
    // Day 10: balance = 50000 + 200000 = 250000
    expect(result.dailyCurve[10].balance).toBe(250000);
    // Final balance stays at 250000
    expect(result.dailyCurve[30].balance).toBe(250000);
  });

  it('detects worst point (negative balance)', () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const day3 = new Date(today);
    day3.setDate(day3.getDate() + 3);
    const day20 = new Date(today);
    day20.setDate(day20.getDate() + 20);

    const events: ForecastEvent[] = [
      {
        date: formatDate(day3),
        amount: -150000,
        description: 'Big expense',
        sourceType: 'contract',
        sourceId: 'c1',
      },
      {
        date: formatDate(day20),
        amount: 500000,
        description: 'Big income',
        sourceType: 'invoice',
        sourceId: 'inv1',
      },
    ];

    const result = simulateForecast(100000, events, 30);

    expect(result.worstPoint.balance).toBe(-50000);
    expect(result.worstPoint.date).toBe(formatDate(day3));
  });

  it('computes safeToSpend as zero when balance goes negative', () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const day1 = new Date(today);
    day1.setDate(day1.getDate() + 1);

    const events: ForecastEvent[] = [
      {
        date: formatDate(day1),
        amount: -200000,
        description: 'Overdraft',
        sourceType: 'contract',
        sourceId: 'c1',
      },
    ];

    const result = simulateForecast(100000, events, 30);
    expect(result.safeToSpend).toBe(0);
  });

  it('computes monthly net cashflow aggregates', () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const day5 = new Date(today);
    day5.setDate(day5.getDate() + 5);

    const events: ForecastEvent[] = [
      {
        date: formatDate(day5),
        amount: -30000,
        description: 'Expense',
        sourceType: 'contract',
        sourceId: 'c1',
      },
    ];

    const result = simulateForecast(100000, events, 60);
    expect(result.monthlyNetCashflow.length).toBeGreaterThanOrEqual(1);

    // Total of all monthly nets should equal total of all event amounts
    const totalNet = result.monthlyNetCashflow.reduce(
      (sum, m) => sum + m.net,
      0,
    );
    expect(totalNet).toBe(-30000);
  });
});

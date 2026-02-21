import { describe, expect, it } from 'vitest';

import type { ForecastEvent, ForecastResult } from './engine.js';
import { applyMutations, compareScenarios } from './scenarios.js';

function makeEvents(): ForecastEvent[] {
  return [
    {
      date: '2026-03-01',
      amount: -5000,
      description: 'Netflix',
      sourceType: 'contract',
      sourceId: 'c1',
    },
    {
      date: '2026-03-15',
      amount: -5000,
      description: 'Netflix',
      sourceType: 'contract',
      sourceId: 'c1',
    },
    {
      date: '2026-03-10',
      amount: -100000,
      description: 'Rent',
      sourceType: 'contract',
      sourceId: 'c2',
    },
    {
      date: '2026-03-20',
      amount: 500000,
      description: 'Client invoice',
      sourceType: 'invoice',
      sourceId: 'inv1',
    },
    {
      date: '2026-04-01',
      amount: -5000,
      description: 'Netflix',
      sourceType: 'contract',
      sourceId: 'c1',
    },
  ];
}

describe('applyMutations', () => {
  it('cancel_contract removes all events for that contract', () => {
    const events = makeEvents();
    const result = applyMutations(events, [
      { type: 'cancel_contract', contractId: 'c1' },
    ]);

    expect(result.filter(e => e.sourceId === 'c1')).toHaveLength(0);
    // Should keep rent and invoice
    expect(result).toHaveLength(2);
  });

  it('modify_amount changes amount for matching contract events', () => {
    const events = makeEvents();
    const result = applyMutations(events, [
      { type: 'modify_amount', contractId: 'c2', newAmount: -120000 },
    ]);

    const rentEvents = result.filter(e => e.sourceId === 'c2');
    expect(rentEvents).toHaveLength(1);
    expect(rentEvents[0].amount).toBe(-120000);
  });

  it('add_event inserts a new event', () => {
    const events = makeEvents();
    const result = applyMutations(events, [
      {
        type: 'add_event',
        date: '2026-03-05',
        amount: -25000,
        description: 'New subscription',
      },
    ]);

    expect(result).toHaveLength(events.length + 1);
    const added = result.find(e => e.description === 'New subscription');
    expect(added).toBeDefined();
    expect(added!.amount).toBe(-25000);
    expect(added!.date).toBe('2026-03-05');
  });

  it('delay_invoice changes date for matching invoice', () => {
    const events = makeEvents();
    const result = applyMutations(events, [
      { type: 'delay_invoice', invoiceId: 'inv1', newDate: '2026-04-15' },
    ]);

    const invoice = result.find(e => e.sourceId === 'inv1');
    expect(invoice).toBeDefined();
    expect(invoice!.date).toBe('2026-04-15');
  });

  it('applies multiple mutations', () => {
    const events = makeEvents();
    const result = applyMutations(events, [
      { type: 'cancel_contract', contractId: 'c1' },
      { type: 'modify_amount', contractId: 'c2', newAmount: -80000 },
      {
        type: 'add_event',
        date: '2026-03-25',
        amount: 100000,
        description: 'Bonus',
      },
    ]);

    expect(result.filter(e => e.sourceId === 'c1')).toHaveLength(0);
    expect(result.find(e => e.sourceId === 'c2')!.amount).toBe(-80000);
    expect(result.find(e => e.description === 'Bonus')).toBeDefined();
  });

  it('does not mutate original events array', () => {
    const events = makeEvents();
    const originalLength = events.length;
    const originalAmounts = events.map(e => e.amount);

    applyMutations(events, [
      { type: 'cancel_contract', contractId: 'c1' },
      { type: 'modify_amount', contractId: 'c2', newAmount: -1 },
    ]);

    expect(events).toHaveLength(originalLength);
    expect(events.map(e => e.amount)).toEqual(originalAmounts);
  });

  it('returns events sorted by date', () => {
    const events = makeEvents();
    const result = applyMutations(events, [
      {
        type: 'add_event',
        date: '2026-02-28',
        amount: -1000,
        description: 'Early event',
      },
    ]);

    for (let i = 1; i < result.length; i++) {
      expect(result[i].date >= result[i - 1].date).toBe(true);
    }
  });
});

describe('compareScenarios', () => {
  function makeResult(
    worstBalance: number,
    monthly: { month: string; net: number }[],
  ): ForecastResult {
    return {
      dailyCurve: [],
      worstPoint: { date: '2026-03-15', balance: worstBalance },
      safeToSpend: Math.max(0, worstBalance),
      monthlyNetCashflow: monthly,
    };
  }

  it('computes delta between baseline and scenario', () => {
    const baseline = makeResult(-50000, [
      { month: '2026-03', net: -110000 },
      { month: '2026-04', net: 500000 },
    ]);

    const scenario = makeResult(50000, [
      { month: '2026-03', net: -10000 },
      { month: '2026-04', net: 500000 },
    ]);

    const delta = compareScenarios(baseline, scenario);

    expect(delta.baselineWorstPoint).toBe(-50000);
    expect(delta.scenarioWorstPoint).toBe(50000);
    expect(delta.monthlyDelta).toHaveLength(2);
    expect(delta.monthlyDelta[0].delta).toBe(100000); // -10000 - (-110000)
    expect(delta.monthlyDelta[1].delta).toBe(0);
    expect(delta.totalDelta).toBe(100000);
  });

  it('handles months present in only one scenario', () => {
    const baseline = makeResult(0, [{ month: '2026-03', net: -50000 }]);

    const scenario = makeResult(0, [
      { month: '2026-03', net: -50000 },
      { month: '2026-04', net: 100000 },
    ]);

    const delta = compareScenarios(baseline, scenario);

    expect(delta.monthlyDelta).toHaveLength(2);
    const apr = delta.monthlyDelta.find(m => m.month === '2026-04');
    expect(apr!.delta).toBe(100000);
  });
});

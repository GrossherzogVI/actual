import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock data stores
let contractsData: Record<string, unknown>[] = [];
let transactionsData: Record<string, unknown>[] = [];
let schedulesData: Record<string, unknown>[] = [];
let forecastData: Record<string, unknown>[] = [];

vi.mock('../account-db.js', () => {
  return {
    getAccountDb: () => ({
      all: (sql: string, params?: unknown[]) => {
        const fileId = params?.[0] as string;

        if (sql.includes('FROM schedules')) {
          return schedulesData.filter((s) => s.file_id === fileId);
        }

        if (sql.includes('FROM contracts')) {
          return contractsData.filter((c) => c.file_id === fileId);
        }

        if (sql.includes('FROM transactions') && sql.includes('GROUP BY')) {
          // budget-overspend query
          return transactionsData.filter((t) => t.file_id === fileId);
        }

        return [];
      },
      first: (sql: string, params?: unknown[]) => {
        const fileId = params?.[0] as string;

        if (sql.includes('FROM forecast_snapshots')) {
          const matching = forecastData.filter(
            (f) => f.file_id === fileId && (f.balance as number) < 0,
          );
          if (matching.length === 0) return null;
          return {
            danger_date: matching[0].date,
            min_balance: Math.min(...matching.map((f) => f.balance as number)),
          };
        }

        return null;
      },
    }),
  };
});

import { generateInsights } from './intelligence-engine.js';

describe('generateInsights', () => {
  afterEach(() => {
    contractsData = [];
    transactionsData = [];
    schedulesData = [];
    forecastData = [];
    vi.restoreAllMocks();
  });

  it('returns empty array when no data exists', async () => {
    const insights = await generateInsights('file-1');
    expect(insights).toEqual([]);
  });

  it('generates expiring-contracts insights', async () => {
    // Contract with cancellation deadline within 30 days
    const today = new Date();
    const deadline = new Date(today);
    deadline.setDate(deadline.getDate() + 15);
    const deadlineStr = deadline.toISOString().split('T')[0];

    contractsData = [
      {
        id: 'c1',
        file_id: 'file-1',
        name: 'Insurance Plan',
        cancellation_deadline: deadlineStr,
        status: 'active',
      },
    ];

    const insights = await generateInsights('file-1');

    const expiring = insights.filter((i) => i.type === 'expiring-contracts');
    expect(expiring).toHaveLength(1);
    expect(expiring[0].severity).toBe('warning');
    expect(expiring[0].title).toContain('Insurance Plan');
    expect(expiring[0].relatedEntityType).toBe('contract');
    expect(expiring[0].relatedEntityId).toBe('c1');
  });

  it('generates forecast-danger insights', async () => {
    forecastData = [
      { file_id: 'file-1', date: '2026-03-15', balance: -500 },
      { file_id: 'file-1', date: '2026-04-01', balance: -1200 },
    ];

    const insights = await generateInsights('file-1');

    const danger = insights.filter((i) => i.type === 'forecast-danger');
    expect(danger).toHaveLength(1);
    expect(danger[0].severity).toBe('critical');
    expect(danger[0].message).toContain('-1200');
  });

  it('generates recurring-untracked insights', async () => {
    schedulesData = [
      { id: 's1', file_id: 'file-1', name: 'Netflix' },
      { id: 's2', file_id: 'file-1', name: 'Gym' },
    ];

    const insights = await generateInsights('file-1');

    const untracked = insights.filter((i) => i.type === 'recurring-untracked');
    expect(untracked).toHaveLength(2);
    expect(untracked[0].relatedEntityType).toBe('schedule');
  });

  it('each insight has a unique id and createdAt', async () => {
    schedulesData = [
      { id: 's1', file_id: 'file-1', name: 'Sub A' },
      { id: 's2', file_id: 'file-1', name: 'Sub B' },
    ];

    const insights = await generateInsights('file-1');

    const ids = insights.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const insight of insights) {
      expect(insight.createdAt).toBeDefined();
      expect(new Date(insight.createdAt).getTime()).not.toBeNaN();
    }
  });
});

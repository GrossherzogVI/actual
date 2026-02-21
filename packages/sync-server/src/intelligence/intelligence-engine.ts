import { v4 as uuidv4 } from 'uuid';

import { getAccountDb } from '../account-db.js';

export type InsightSeverity = 'info' | 'warning' | 'critical';

export type Insight = {
  id: string;
  type: string;
  severity: InsightSeverity;
  title: string;
  message: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  createdAt: string;
};

/**
 * Generate insights for a budget file by analysing contracts, forecast data,
 * and recent transaction patterns.
 */
export async function generateInsights(fileId: string): Promise<Insight[]> {
  const insights: Insight[] = [];

  insights.push(...getExpiringContractInsights(fileId));
  insights.push(...getBudgetOverspendInsights(fileId));
  insights.push(...getRecurringUntrackedInsights(fileId));
  insights.push(...getForecastDangerInsights(fileId));

  return insights;
}

/**
 * Contracts with cancellation deadline within 30 days.
 */
function getExpiringContractInsights(fileId: string): Insight[] {
  const db = getAccountDb();
  const rows = db.all(
    `SELECT id, name, cancellation_deadline
     FROM contracts
     WHERE file_id = ?
       AND status = 'active'
       AND cancellation_deadline IS NOT NULL
       AND cancellation_deadline <= date('now', '+30 days')
       AND cancellation_deadline >= date('now')
     ORDER BY cancellation_deadline ASC`,
    [fileId],
  ) as Array<{
    id: string;
    name: string;
    cancellation_deadline: string;
  }>;

  return rows.map((row) => ({
    id: uuidv4(),
    type: 'expiring-contracts',
    severity: 'warning' as InsightSeverity,
    title: `Contract "${row.name}" cancellation deadline approaching`,
    message: `The cancellation deadline for "${row.name}" is ${row.cancellation_deadline}. Act before then if you wish to cancel.`,
    relatedEntityType: 'contract',
    relatedEntityId: row.id,
    createdAt: new Date().toISOString(),
  }));
}

/**
 * Categories where recent monthly spending exceeds the 6-month average by 20%+.
 */
function getBudgetOverspendInsights(fileId: string): Insight[] {
  const db = getAccountDb();

  // Check if the transactions table has the columns we need.
  // This query compares last-month spending per category vs the 6-month average.
  try {
    const rows = db.all(
      `SELECT
         t.category AS category_id,
         SUM(CASE WHEN t.date >= date('now', '-1 month') THEN ABS(t.amount) ELSE 0 END) AS last_month,
         SUM(ABS(t.amount)) / 6.0 AS avg_monthly
       FROM transactions t
       WHERE t.file_id = ?
         AND t.date >= date('now', '-6 months')
         AND t.amount < 0
         AND t.category IS NOT NULL
       GROUP BY t.category
       HAVING last_month > avg_monthly * 1.2 AND avg_monthly > 0`,
      [fileId],
    ) as Array<{
      category_id: string;
      last_month: number;
      avg_monthly: number;
    }>;

    return rows.map((row) => {
      const pct = Math.round(
        ((row.last_month - row.avg_monthly) / row.avg_monthly) * 100,
      );
      return {
        id: uuidv4(),
        type: 'budget-overspend',
        severity: (pct >= 50 ? 'critical' : 'warning') as InsightSeverity,
        title: `Category overspend detected (+${pct}%)`,
        message: `Spending in category ${row.category_id} last month was ${pct}% above the 6-month average.`,
        relatedEntityType: 'category',
        relatedEntityId: row.category_id,
        createdAt: new Date().toISOString(),
      };
    });
  } catch {
    // transactions table may not exist in account-db for all setups
    return [];
  }
}

/**
 * Recurring transaction patterns (schedules) that are not linked to any contract.
 */
function getRecurringUntrackedInsights(fileId: string): Insight[] {
  const db = getAccountDb();

  try {
    const rows = db.all(
      `SELECT s.id, s.name
       FROM schedules s
       WHERE s.file_id = ?
         AND s.id NOT IN (SELECT schedule_id FROM contracts WHERE schedule_id IS NOT NULL AND file_id = ?)`,
      [fileId, fileId],
    ) as Array<{ id: string; name: string }>;

    return rows.map((row) => ({
      id: uuidv4(),
      type: 'recurring-untracked',
      severity: 'info' as InsightSeverity,
      title: `Recurring payment "${row.name}" has no linked contract`,
      message: `Schedule "${row.name}" is not associated with any contract. Consider creating one for better tracking.`,
      relatedEntityType: 'schedule',
      relatedEntityId: row.id,
      createdAt: new Date().toISOString(),
    }));
  } catch {
    return [];
  }
}

/**
 * Forecast shows balance going negative within 90 days.
 */
function getForecastDangerInsights(fileId: string): Insight[] {
  const db = getAccountDb();

  try {
    const row = db.first(
      `SELECT MIN(date) AS danger_date, MIN(balance) AS min_balance
       FROM forecast_snapshots
       WHERE file_id = ?
         AND date <= date('now', '+90 days')
         AND balance < 0`,
      [fileId],
    ) as { danger_date: string | null; min_balance: number | null } | null;

    if (row?.danger_date) {
      return [
        {
          id: uuidv4(),
          type: 'forecast-danger',
          severity: 'critical',
          title: 'Forecast shows negative balance ahead',
          message: `Based on current projections, your balance may drop to ${row.min_balance} by ${row.danger_date}.`,
          createdAt: new Date().toISOString(),
        },
      ];
    }
  } catch {
    // forecast_snapshots may not exist yet
  }

  return [];
}

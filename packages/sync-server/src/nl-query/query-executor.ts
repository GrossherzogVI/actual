import { getAccountDb } from '../account-db.js';

import type { StructuredQuery } from './nl-query.js';

export type QueryResult = {
  answer: string;
  data?: unknown[];
  chartData?: unknown;
};

/**
 * Execute a structured query against the database and return formatted results.
 */
export async function executeQuery(
  query: StructuredQuery,
  fileId: string,
): Promise<QueryResult> {
  switch (query.type) {
    case 'spending':
      return executeSpendingQuery(fileId, query.params);
    case 'balance':
      return executeBalanceQuery(fileId, query.params);
    case 'forecast':
      return executeForecastQuery(fileId, query.params);
    case 'contracts':
      return executeContractsQuery(fileId, query.params);
    case 'comparison':
      return executeComparisonQuery(fileId, query.params);
    default:
      return { answer: 'I could not understand that query type.' };
  }
}

function executeSpendingQuery(
  fileId: string,
  params: Record<string, unknown>,
): QueryResult {
  const db = getAccountDb();

  const conditions = ['t.file_id = ?', 't.amount < 0'];
  const sqlParams: unknown[] = [fileId];

  if (params.category) {
    conditions.push('t.category = ?');
    sqlParams.push(params.category);
  }
  if (params.payee) {
    conditions.push('t.payee LIKE ?');
    sqlParams.push(`%${params.payee}%`);
  }
  if (params.startDate) {
    conditions.push('t.date >= ?');
    sqlParams.push(params.startDate);
  }
  if (params.endDate) {
    conditions.push('t.date <= ?');
    sqlParams.push(params.endDate);
  }

  try {
    const rows = db.all(
      `SELECT t.category, SUM(ABS(t.amount)) AS total, COUNT(*) AS tx_count
       FROM transactions t
       WHERE ${conditions.join(' AND ')}
       GROUP BY t.category
       ORDER BY total DESC
       LIMIT 20`,
      sqlParams,
    ) as Array<{ category: string; total: number; tx_count: number }>;

    if (rows.length === 0) {
      return { answer: 'No spending data found for the given criteria.' };
    }

    const grandTotal = rows.reduce((sum, r) => sum + r.total, 0);

    return {
      answer: `Total spending: ${grandTotal}. Broken down across ${rows.length} categories.`,
      data: rows,
      chartData: {
        type: 'bar',
        labels: rows.map((r) => r.category || 'Uncategorized'),
        values: rows.map((r) => r.total),
      },
    };
  } catch {
    return { answer: 'Could not query spending data. The transactions table may not be available.' };
  }
}

function executeBalanceQuery(
  fileId: string,
  params: Record<string, unknown>,
): QueryResult {
  const db = getAccountDb();

  try {
    const conditions = ['t.file_id = ?'];
    const sqlParams: unknown[] = [fileId];

    if (params.accountId) {
      conditions.push('t.account = ?');
      sqlParams.push(params.accountId);
    }
    if (params.date) {
      conditions.push('t.date <= ?');
      sqlParams.push(params.date);
    }

    const row = db.first(
      `SELECT SUM(t.amount) AS balance, COUNT(*) AS tx_count
       FROM transactions t
       WHERE ${conditions.join(' AND ')}`,
      sqlParams,
    ) as { balance: number | null; tx_count: number } | null;

    if (!row || row.balance === null) {
      return { answer: 'No balance data found.' };
    }

    return {
      answer: `Current balance: ${row.balance} (based on ${row.tx_count} transactions).`,
      data: [row],
    };
  } catch {
    return { answer: 'Could not query balance data.' };
  }
}

function executeForecastQuery(
  fileId: string,
  params: Record<string, unknown>,
): QueryResult {
  const db = getAccountDb();

  try {
    const horizon = (params.horizon as number) || 90;
    const rows = db.all(
      `SELECT date, balance
       FROM forecast_snapshots
       WHERE file_id = ?
         AND date <= date('now', '+' || ? || ' days')
       ORDER BY date ASC`,
      [fileId, horizon],
    ) as Array<{ date: string; balance: number }>;

    if (rows.length === 0) {
      return {
        answer:
          'No forecast data available. Run a forecast first to generate projections.',
      };
    }

    const minRow = rows.reduce((min, r) => (r.balance < min.balance ? r : min), rows[0]);

    return {
      answer: `Forecast covers ${rows.length} days. Lowest projected balance: ${minRow.balance} on ${minRow.date}.`,
      data: rows,
      chartData: {
        type: 'line',
        labels: rows.map((r) => r.date),
        values: rows.map((r) => r.balance),
      },
    };
  } catch {
    return { answer: 'Could not query forecast data.' };
  }
}

function executeContractsQuery(
  fileId: string,
  params: Record<string, unknown>,
): QueryResult {
  const db = getAccountDb();

  const conditions = ['c.file_id = ?'];
  const sqlParams: unknown[] = [fileId];

  if (params.status) {
    conditions.push('c.status = ?');
    sqlParams.push(params.status);
  }
  if (params.type) {
    conditions.push('c.type = ?');
    sqlParams.push(params.type);
  }

  try {
    const rows = db.all(
      `SELECT c.id, c.name, c.provider, c.type, c.amount, c.frequency, c.status, c.cancellation_deadline
       FROM contracts c
       WHERE ${conditions.join(' AND ')}
       ORDER BY c.amount DESC NULLS LAST`,
      sqlParams,
    ) as Array<Record<string, unknown>>;

    if (rows.length === 0) {
      return { answer: 'No contracts found matching the criteria.' };
    }

    const totalMonthly = rows.reduce(
      (sum, r) => sum + ((r.amount as number) || 0),
      0,
    );

    return {
      answer: `Found ${rows.length} contract(s) with a combined monthly cost of ${totalMonthly}.`,
      data: rows,
    };
  } catch {
    return { answer: 'Could not query contracts.' };
  }
}

function executeComparisonQuery(
  fileId: string,
  params: Record<string, unknown>,
): QueryResult {
  const db = getAccountDb();

  const period = (params.period as string) || 'month';
  const periodDays =
    period === 'week' ? 7 : period === 'quarter' ? 90 : period === 'year' ? 365 : 30;

  try {
    const rows = db.all(
      `SELECT t.category, SUM(ABS(t.amount)) AS total
       FROM transactions t
       WHERE t.file_id = ?
         AND t.date >= date('now', '-' || ? || ' days')
         AND t.amount < 0
         AND t.category IS NOT NULL
       GROUP BY t.category
       ORDER BY total DESC
       LIMIT 10`,
      [fileId, periodDays],
    ) as Array<{ category: string; total: number }>;

    if (rows.length === 0) {
      return { answer: 'No spending data to compare.' };
    }

    return {
      answer: `Top ${rows.length} spending categories over the last ${period}.`,
      data: rows,
      chartData: {
        type: 'bar',
        labels: rows.map((r) => r.category),
        values: rows.map((r) => r.total),
      },
    };
  } catch {
    return { answer: 'Could not execute comparison query.' };
  }
}

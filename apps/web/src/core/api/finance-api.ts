import { type Uuid } from 'surrealdb';

import { db, connect } from './surreal-client';
import type {
  Account,
  Anomaly,
  Budget,
  BudgetSummary,
  Category,
  CategorySpending,
  Contract,
  FixedVarDetail,
  MerchantSpending,
  MonthDelta,
  MonthSummary,
  ReviewItem,
  DashboardPulse,
  Schedule,
  SpendingPattern,
  ThisMonthSummary,
  Transaction,
  TrendPoint,
} from '../types/finance';

// -- Transactions --

export async function listTransactions(opts?: {
  accountId?: string;
  categoryId?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  limit?: number;
  start?: number;
}): Promise<Transaction[]> {
  await connect();
  const limit = opts?.limit ?? 50;
  const start = opts?.start ?? 0;

  let where = 'true';
  const params: Record<string, unknown> = { limit, start };

  if (opts?.accountId) {
    where += ' AND account = $accountId';
    params.accountId = opts.accountId;
  }
  if (opts?.categoryId) {
    where += ' AND category = $categoryId';
    params.categoryId = opts.categoryId;
  }
  if (opts?.startDate) {
    where += ' AND date >= $startDate';
    params.startDate = opts.startDate;
  }
  if (opts?.endDate) {
    where += ' AND date <= $endDate';
    params.endDate = opts.endDate;
  }
  if (opts?.search) {
    where += ' AND (notes CONTAINS $search OR payee.name CONTAINS $search)';
    params.search = opts.search;
  }

  const [results] = await db.query<[Transaction[]]>(
    `SELECT *, payee.name AS payee_name, category.name AS category_name FROM transaction WHERE ${where} ORDER BY date DESC LIMIT $limit START $start`,
    params,
  );
  return results;
}

export async function createTransaction(
  data: Omit<
    Transaction,
    | 'id'
    | 'created_at'
    | 'updated_at'
    | 'imported'
    | 'cleared'
    | 'reconciled'
    | 'ai_classified'
  >,
): Promise<Transaction> {
  await connect();
  const [result] = await db.query<[Transaction]>(
    `CREATE transaction SET
      date = $date,
      amount = $amount,
      account = $account,
      payee = $payee,
      category = $category,
      notes = $notes,
      created_at = time::now(),
      updated_at = time::now()`,
    data,
  );
  return result;
}

export async function updateTransaction(
  id: string,
  data: Partial<Transaction>,
): Promise<Transaction> {
  await connect();
  const [result] = await db.query<[Transaction]>(
    `UPDATE $id MERGE $data SET updated_at = time::now()`,
    { id, data },
  );
  return result;
}

export async function deleteTransaction(id: string): Promise<void> {
  await connect();
  await db.query('DELETE $id', { id });
}

// -- Accounts --

export async function listAccounts(): Promise<Account[]> {
  await connect();
  const [results] = await db.query<[Account[]]>(
    'SELECT * FROM account WHERE closed = false ORDER BY sort_order',
  );
  return results;
}

export async function createAccount(
  data: Pick<Account, 'name' | 'type'> & Partial<Account>,
): Promise<Account> {
  await connect();
  const [result] = await db.query<[Account]>(
    `CREATE account SET
      name = $name,
      type = $type,
      balance = $balance,
      currency = $currency,
      sort_order = $sort_order,
      created_at = time::now(),
      updated_at = time::now()`,
    {
      name: data.name,
      type: data.type,
      balance: data.balance ?? 0,
      currency: data.currency ?? 'EUR',
      sort_order: data.sort_order ?? 0,
    },
  );
  return result;
}

export async function updateAccount(
  id: string,
  data: Partial<Account>,
): Promise<Account> {
  await connect();
  const [result] = await db.query<[Account]>(
    `UPDATE $id MERGE $data SET updated_at = time::now()`,
    { id, data },
  );
  return result;
}

// -- Categories --

export async function listCategories(): Promise<Category[]> {
  await connect();
  const [results] = await db.query<[Category[]]>(
    'SELECT * FROM category ORDER BY sort_order',
  );
  return results;
}

export async function createCategory(
  data: Pick<Category, 'name'> & Partial<Category>,
): Promise<Category> {
  await connect();
  const [result] = await db.query<[Category]>(
    `CREATE category SET
      name = $name,
      parent = $parent,
      color = $color,
      icon = $icon,
      sort_order = $sort_order,
      is_income = $is_income,
      created_at = time::now()`,
    {
      name: data.name,
      parent: data.parent ?? null,
      color: data.color ?? null,
      icon: data.icon ?? null,
      sort_order: data.sort_order ?? 0,
      is_income: data.is_income ?? false,
    },
  );
  return result;
}

// -- Contracts --

export async function listContracts(): Promise<Contract[]> {
  await connect();
  const [results] = await db.query<[Contract[]]>(
    `SELECT * FROM contract WHERE status != 'cancelled' ORDER BY name`,
  );
  return results;
}

export async function createContract(
  data: Pick<Contract, 'name' | 'provider' | 'amount' | 'interval'> &
    Partial<Contract>,
): Promise<Contract> {
  await connect();
  const [result] = await db.query<[Contract]>(
    `CREATE contract SET
      name = $name,
      provider = $provider,
      category = $category,
      type = $type,
      amount = $amount,
      interval = $interval,
      start_date = $start_date,
      end_date = $end_date,
      notice_period_months = $notice_period_months,
      auto_renewal = $auto_renewal,
      created_at = time::now(),
      updated_at = time::now()`,
    {
      name: data.name,
      provider: data.provider,
      category: data.category ?? null,
      type: data.type ?? 'subscription',
      amount: data.amount,
      interval: data.interval,
      start_date: data.start_date ?? null,
      end_date: data.end_date ?? null,
      notice_period_months: data.notice_period_months ?? null,
      auto_renewal: data.auto_renewal ?? true,
    },
  );
  return result;
}

export async function updateContract(
  id: string,
  data: Partial<Contract>,
): Promise<Contract> {
  await connect();
  const [result] = await db.query<[Contract]>(
    `UPDATE $id MERGE $data SET updated_at = time::now()`,
    { id, data },
  );
  return result;
}

// -- Review Items --

export async function listReviewItems(
  status?: string,
): Promise<ReviewItem[]> {
  await connect();
  const where = status ? 'WHERE status = $status' : '';
  const [results] = await db.query<[ReviewItem[]]>(
    `SELECT *,
      transaction.amount AS transaction_amount,
      transaction.payee.name AS transaction_payee_name,
      transaction.date AS transaction_date,
      transaction.notes AS transaction_notes
    FROM review_item ${where} ORDER BY
      CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
      created_at DESC`,
    status ? { status } : undefined,
  );
  return results;
}

export async function updateReviewItem(
  id: string,
  data: Partial<ReviewItem>,
): Promise<ReviewItem> {
  await connect();
  const [result] = await db.query<[ReviewItem]>(
    `UPDATE $id MERGE $data SET resolved_at = time::now()`,
    { id, data },
  );
  return result;
}

export async function acceptReviewItem(id: string): Promise<void> {
  await connect();
  // Fetch the review item to get the AI suggestion
  const [items] = await db.query<[ReviewItem[]]>(
    'SELECT * FROM $id',
    { id },
  );
  const item = items?.[0];
  if (!item) return;

  // If it has a suggested category, apply it to the transaction
  const suggestion = item.ai_suggestion as { suggested_category?: string } | undefined;
  if (item.transaction && suggestion?.suggested_category) {
    await db.query(
      `UPDATE $txn SET category = $cat, ai_classified = true, updated_at = time::now()`,
      { txn: item.transaction, cat: suggestion.suggested_category },
    );
  }

  // Mark as accepted
  await db.query(
    `UPDATE $id SET status = 'accepted', resolved_at = time::now()`,
    { id },
  );
}

export async function dismissReviewItem(id: string): Promise<void> {
  await connect();
  await db.query(
    `UPDATE $id SET status = 'dismissed', resolved_at = time::now()`,
    { id },
  );
}

export async function snoozeReviewItem(id: string): Promise<void> {
  await connect();
  await db.query(
    `UPDATE $id SET status = 'snoozed', resolved_at = NONE`,
    { id },
  );
}

export async function batchAcceptReviewItems(ids: string[]): Promise<number> {
  await connect();
  let accepted = 0;
  for (const id of ids) {
    await acceptReviewItem(id);
    accepted++;
  }
  return accepted;
}

// -- Dashboard --

export async function getDashboardPulse(): Promise<DashboardPulse> {
  await connect();
  // Single multi-statement query instead of 4 round-trips
  const [balances, reviews, contracts, upcoming] = await db.query<[
    { total: number }[],
    { count: number }[],
    { count: number }[],
    Contract[],
  ]>(
    `SELECT math::sum(balance) AS total FROM account WHERE closed = false GROUP ALL;
     SELECT count() AS count FROM review_item WHERE status = 'pending' GROUP ALL;
     SELECT count() AS count FROM contract WHERE status = 'active' GROUP ALL;
     SELECT * FROM contract WHERE status = 'active' ORDER BY amount DESC LIMIT 10;`,
  );

  return {
    total_balance: balances?.[0]?.total ?? 0,
    pending_reviews: reviews?.[0]?.count ?? 0,
    active_contracts: contracts?.[0]?.count ?? 0,
    upcoming_payments: upcoming ?? [],
  };
}

// -- This Month Summary --

export async function getThisMonth(): Promise<ThisMonthSummary> {
  await connect();
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

  const [results] = await db.query<[{ income: number; expenses: number; count: number }[]]>(
    `SELECT
      math::sum(IF amount > 0 THEN amount ELSE 0 END) AS income,
      math::sum(IF amount < 0 THEN amount ELSE 0 END) AS expenses,
      count() AS count
    FROM transaction
    WHERE date >= $start AND date <= $end
    GROUP ALL`,
    { start: firstDay, end: lastDay },
  );

  const row = results?.[0];
  return {
    income: row?.income ?? 0,
    expenses: row?.expenses ?? 0,
    net: (row?.income ?? 0) + (row?.expenses ?? 0),
    transaction_count: row?.count ?? 0,
  };
}

// -- Schedules --

export async function listSchedules(opts?: {
  activeOnly?: boolean;
}): Promise<Schedule[]> {
  await connect();
  const where = opts?.activeOnly !== false ? 'WHERE active = true' : '';
  const [results] = await db.query<[Schedule[]]>(
    `SELECT * FROM schedule ${where} ORDER BY next_date`,
  );
  return results;
}

export async function createSchedule(
  data: Pick<Schedule, 'name' | 'amount' | 'account' | 'frequency' | 'next_date'> &
    Partial<Schedule>,
): Promise<Schedule> {
  await connect();
  const [result] = await db.query<[Schedule]>(
    `CREATE schedule SET
      name = $name,
      amount = $amount,
      account = $account,
      category = $category,
      payee = $payee,
      frequency = $frequency,
      next_date = $next_date,
      active = $active,
      created_at = time::now()`,
    {
      name: data.name,
      amount: data.amount,
      account: data.account,
      category: data.category ?? null,
      payee: data.payee ?? null,
      frequency: data.frequency,
      next_date: data.next_date,
      active: data.active ?? true,
    },
  );
  return result;
}

// -- Live Subscriptions --

export async function subscribeToTransactions(
  callback: (action: string, result: Transaction) => void,
): Promise<Uuid> {
  await connect();
  const queryUuid = await db.live<Transaction>('transaction', (action, result) => {
    if (action === 'CLOSE') return;
    callback(action, result);
  });
  return queryUuid;
}

export async function unsubscribeFromTransactions(
  queryUuid: Uuid,
): Promise<void> {
  await db.kill(queryUuid);
}

// -- Analytics --

export async function getSpendingByCategory(
  startDate: string,
  endDate: string,
): Promise<CategorySpending[]> {
  await connect();
  const [results] = await db.query<[CategorySpending[]]>(
    `SELECT
      category AS category_id,
      category.name AS category_name,
      category.parent AS parent_id,
      math::sum(math::abs(amount)) AS total,
      count() AS count
    FROM transaction
    WHERE amount < 0 AND date >= $start AND date <= $end AND category IS NOT NONE
    GROUP BY category
    ORDER BY total DESC`,
    { start: startDate, end: endDate },
  );
  const grandTotal = results.reduce((s, r) => s + r.total, 0);
  return results.map(r => ({ ...r, percentage: grandTotal > 0 ? r.total / grandTotal : 0 }));
}

export async function getMonthlyOverview(months: number = 6): Promise<MonthSummary[]> {
  await connect();
  const [results] = await db.query<[MonthSummary[]]>(
    `SELECT
      time::format(date, '%Y-%m') AS month,
      math::sum(IF amount > 0 THEN amount ELSE 0 END) AS income,
      math::sum(IF amount < 0 THEN math::abs(amount) ELSE 0 END) AS expenses
    FROM transaction
    WHERE date >= $since
    GROUP BY month
    ORDER BY month`,
    {
      since: new Date(
        new Date().getFullYear(),
        new Date().getMonth() - months,
        1,
      ).toISOString(),
    },
  );
  return results.map(r => ({ ...r, net: r.income - r.expenses }));
}

export async function getFixedVsVariable(months: number = 6): Promise<FixedVarDetail[]> {
  await connect();
  const since = new Date(
    new Date().getFullYear(),
    new Date().getMonth() - months,
    1,
  ).toISOString();

  // SurrealDB subquery: classify transactions as fixed (contract-linked category) or variable
  const [fixed, variable] = await db.query<[
    { month: string; total: number }[],
    { month: string; total: number }[],
  ]>(
    `SELECT time::format(date, '%Y-%m') AS month, math::sum(math::abs(amount)) AS total
     FROM transaction
     WHERE amount < 0 AND date >= $since
       AND category IN (SELECT VALUE category FROM contract WHERE category IS NOT NONE AND status = 'active')
     GROUP BY month ORDER BY month;

     SELECT time::format(date, '%Y-%m') AS month, math::sum(math::abs(amount)) AS total
     FROM transaction
     WHERE amount < 0 AND date >= $since AND category IS NOT NONE
       AND category NOT IN (SELECT VALUE category FROM contract WHERE category IS NOT NONE AND status = 'active')
     GROUP BY month ORDER BY month;`,
    { since },
  );

  const fixedMap = new Map((fixed ?? []).map(r => [r.month, r.total]));
  const variableMap = new Map((variable ?? []).map(r => [r.month, r.total]));
  const allMonths = new Set([...fixedMap.keys(), ...variableMap.keys()]);

  return Array.from(allMonths)
    .map(month => ({
      month,
      fixed: fixedMap.get(month) ?? 0,
      variable: variableMap.get(month) ?? 0,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

export async function getSpendingTrends(
  months: number = 6,
  categoryIds?: string[],
): Promise<TrendPoint[]> {
  await connect();
  const since = new Date(
    new Date().getFullYear(),
    new Date().getMonth() - months,
    1,
  ).toISOString();

  let catFilter = '';
  const params: Record<string, unknown> = { since };
  if (categoryIds && categoryIds.length > 0) {
    catFilter = ' AND category IN $cats';
    params.cats = categoryIds;
  }

  const [results] = await db.query<[TrendPoint[]]>(
    `SELECT
      time::format(date, '%Y-%m') AS month,
      category AS category_id,
      category.name AS category_name,
      math::sum(math::abs(amount)) AS total
    FROM transaction
    WHERE amount < 0 AND date >= $since AND category IS NOT NONE${catFilter}
    GROUP BY month, category
    ORDER BY month, total DESC`,
    params,
  );
  return results;
}

export async function getTopMerchants(
  startDate: string,
  endDate: string,
  limit: number = 10,
): Promise<MerchantSpending[]> {
  await connect();
  const [results] = await db.query<[MerchantSpending[]]>(
    `SELECT
      payee AS payee_id,
      payee.name AS payee_name,
      math::sum(math::abs(amount)) AS total,
      count() AS count
    FROM transaction
    WHERE amount < 0 AND date >= $start AND date <= $end AND payee IS NOT NONE
    GROUP BY payee
    ORDER BY total DESC
    LIMIT $limit`,
    { start: startDate, end: endDate, limit },
  );
  return results;
}

export async function getWhatChanged(
  currentMonth: string,
  previousMonth: string,
): Promise<MonthDelta[]> {
  await connect();
  const [current] = await db.query<[{ category_name: string; total: number }[]]>(
    `SELECT category.name AS category_name, math::sum(math::abs(amount)) AS total
    FROM transaction
    WHERE amount < 0 AND time::format(date, '%Y-%m') = $month AND category IS NOT NONE
    GROUP BY category
    ORDER BY total DESC`,
    { month: currentMonth },
  );
  const [previous] = await db.query<[{ category_name: string; total: number }[]]>(
    `SELECT category.name AS category_name, math::sum(math::abs(amount)) AS total
    FROM transaction
    WHERE amount < 0 AND time::format(date, '%Y-%m') = $month AND category IS NOT NONE
    GROUP BY category
    ORDER BY total DESC`,
    { month: previousMonth },
  );

  const prevMap = new Map((previous ?? []).map(r => [r.category_name, r.total]));
  const allCategories = new Set([
    ...(current ?? []).map(r => r.category_name),
    ...(previous ?? []).map(r => r.category_name),
  ]);

  return Array.from(allCategories).map(name => {
    const cur = (current ?? []).find(r => r.category_name === name)?.total ?? 0;
    const prev = prevMap.get(name) ?? 0;
    const delta = cur - prev;
    return {
      category_name: name,
      current: cur,
      previous: prev,
      delta,
      delta_pct: prev > 0 ? delta / prev : cur > 0 ? 1 : 0,
    };
  }).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

// -- Dashboard Preferences --

export async function getUserPref(key: string): Promise<string | null> {
  await connect();
  const [results] = await db.query<[{ value: string }[]]>(
    `SELECT value FROM user_pref WHERE key = $key LIMIT 1`,
    { key },
  );
  return results?.[0]?.value ?? null;
}

export async function setUserPref(key: string, value: string): Promise<void> {
  await connect();
  // Upsert: try update first, create if not found
  const [existing] = await db.query<[{ id: string }[]]>(
    `SELECT id FROM user_pref WHERE key = $key LIMIT 1`,
    { key },
  );
  if (existing?.[0]) {
    await db.query(
      `UPDATE $id SET value = $value, updated_at = time::now()`,
      { id: existing[0].id, value },
    );
  } else {
    await db.query(
      `CREATE user_pref SET key = $key, value = $value, updated_at = time::now()`,
      { key, value },
    );
  }
}

export async function getAvailableToSpend(): Promise<{
  available: number;
  committed: number;
  balance: number;
}> {
  await connect();
  const [balances] = await db.query<[{ total: number }[]]>(
    `SELECT math::sum(balance) AS total FROM account WHERE closed = false GROUP ALL`,
  );
  const [contracts] = await db.query<[{ total: number }[]]>(
    `SELECT math::sum(amount) AS total FROM contract WHERE status = 'active' GROUP ALL`,
  );

  const balance = balances?.[0]?.total ?? 0;
  const committed = contracts?.[0]?.total ?? 0;
  return { available: balance - committed, committed, balance };
}

export async function getBalanceProjection(
  days: number = 30,
): Promise<{ date: string; balance: number }[]> {
  await connect();
  const [balances] = await db.query<[{ total: number }[]]>(
    `SELECT math::sum(balance) AS total FROM account WHERE closed = false GROUP ALL`,
  );
  const [schedules] = await db.query<[Schedule[]]>(
    `SELECT * FROM schedule WHERE active = true ORDER BY next_date`,
  );

  let balance = balances?.[0]?.total ?? 0;
  const today = new Date();
  const points: { date: string; balance: number }[] = [];

  for (let d = 0; d <= days; d++) {
    const date = new Date(today);
    date.setDate(today.getDate() + d);
    const dateStr = date.toISOString().slice(0, 10);

    for (const sched of schedules ?? []) {
      if (sched.next_date.slice(0, 10) === dateStr) {
        balance += sched.amount;
      }
    }
    points.push({ date: dateStr, balance });
  }

  return points;
}

// -- Budget --

export async function listBudgets(month: string): Promise<Budget[]> {
  await connect();
  const [results] = await db.query<[Budget[]]>(
    `SELECT * FROM budget WHERE month = $month ORDER BY category`,
    { month },
  );
  return results;
}

export async function upsertBudget(
  category: string,
  month: string,
  amount: number,
  rollover: boolean = false,
): Promise<Budget> {
  await connect();
  const [existing] = await db.query<[Budget[]]>(
    `SELECT * FROM budget WHERE category = $cat AND month = $month LIMIT 1`,
    { cat: category, month },
  );
  if (existing?.[0]) {
    const [result] = await db.query<[Budget]>(
      `UPDATE $id SET amount = $amount, rollover = $rollover, updated_at = time::now() RETURN AFTER`,
      { id: existing[0].id, amount, rollover },
    );
    return result;
  }
  const [result] = await db.query<[Budget]>(
    `CREATE budget SET
      category = $cat,
      month = $month,
      amount = $amount,
      rollover = $rollover,
      created_at = time::now(),
      updated_at = time::now()`,
    { cat: category, month, amount, rollover },
  );
  return result;
}

export async function deleteBudget(id: string): Promise<void> {
  await connect();
  await db.query('DELETE $id', { id });
}

export async function getBudgetSummary(month: string): Promise<BudgetSummary> {
  await connect();
  const [budgets] = await db.query<[{ total: number; count: number }[]]>(
    `SELECT math::sum(amount) AS total, count() AS count FROM budget WHERE month = $month GROUP ALL`,
    { month },
  );

  const monthStart = `${month}-01`;
  const nextMonth = new Date(
    Number(month.slice(0, 4)),
    Number(month.slice(5, 7)),
    0,
  );
  const monthEnd = nextMonth.toISOString().slice(0, 10);

  const [spent] = await db.query<[{ total: number }[]]>(
    `SELECT math::sum(math::abs(amount)) AS total
    FROM transaction
    WHERE amount < 0 AND date >= $start AND date <= $end
    GROUP ALL`,
    { start: monthStart, end: monthEnd },
  );

  const totalBudgeted = budgets?.[0]?.total ?? 0;
  const totalSpent = spent?.[0]?.total ?? 0;

  return {
    total_budgeted: totalBudgeted,
    total_spent: totalSpent,
    total_remaining: totalBudgeted - totalSpent,
    envelope_count: budgets?.[0]?.count ?? 0,
  };
}

// -- Intelligence --

export async function listAnomalies(resolved?: boolean): Promise<Anomaly[]> {
  await connect();
  const where = resolved !== undefined ? 'WHERE resolved = $resolved' : '';
  const [results] = await db.query<[Anomaly[]]>(
    `SELECT * FROM anomaly ${where} ORDER BY created_at DESC`,
    resolved !== undefined ? { resolved } : undefined,
  );
  return results;
}

export async function resolveAnomaly(id: string): Promise<void> {
  await connect();
  await db.query(`UPDATE $id SET resolved = true`, { id });
}

export async function listSpendingPatterns(
  dismissed?: boolean,
): Promise<SpendingPattern[]> {
  await connect();
  const where = dismissed !== undefined ? 'WHERE dismissed = $dismissed' : '';
  const [results] = await db.query<[SpendingPattern[]]>(
    `SELECT * FROM spending_pattern ${where} ORDER BY confidence DESC`,
    dismissed !== undefined ? { dismissed } : undefined,
  );
  return results;
}

export async function dismissSpendingPattern(id: string): Promise<void> {
  await connect();
  await db.query(`UPDATE $id SET dismissed = true`, { id });
}

export async function requestExplanation(
  reviewItemId: string,
): Promise<{ explanation: string }> {
  await connect();
  // Enqueue an explain job for the worker
  await db.query(
    `CREATE job_queue SET
      name = 'explain-classification',
      payload = { review_item_id: $id },
      status = 'pending',
      attempt = 0,
      visible_at = time::now(),
      created_at = time::now()`,
    { id: reviewItemId },
  );
  // Return a placeholder — the worker will fill in the explanation async
  return { explanation: 'Erklärung wird generiert...' };
}

// -- Import --

export async function bulkCreateTransactions(
  transactions: Omit<Transaction, 'id' | 'created_at' | 'updated_at' | 'imported' | 'cleared' | 'reconciled' | 'ai_classified'>[],
): Promise<{ created: number; duplicates: number }> {
  await connect();
  let created = 0;
  let duplicates = 0;

  for (const txn of transactions) {
    // Check for duplicates by date + amount + payee
    const [existing] = await db.query<[{ id: string }[]]>(
      `SELECT id FROM transaction WHERE date = $date AND amount = $amount AND payee = $payee LIMIT 1`,
      { date: txn.date, amount: txn.amount, payee: txn.payee ?? null },
    );
    if (existing?.[0]) {
      duplicates++;
      continue;
    }
    await db.query(
      `CREATE transaction SET
        date = $date, amount = $amount, account = $account,
        payee = $payee, category = $category, notes = $notes,
        imported = true, cleared = false, reconciled = false,
        ai_classified = false,
        created_at = time::now(), updated_at = time::now()`,
      txn,
    );
    created++;
  }

  return { created, duplicates };
}

export async function findDuplicateTransactions(
  date: string,
  amount: number,
  payee?: string,
): Promise<Transaction[]> {
  await connect();
  let where = 'date = $date AND amount = $amount';
  const params: Record<string, unknown> = { date, amount };
  if (payee) {
    where += ' AND payee = $payee';
    params.payee = payee;
  }
  const [results] = await db.query<[Transaction[]]>(
    `SELECT *, payee.name AS payee_name, category.name AS category_name FROM transaction WHERE ${where}`,
    params,
  );
  return results;
}

export async function createImportBatch(
  name: string,
  count: number,
  source: string,
): Promise<{ id: string }> {
  await connect();
  const [result] = await db.query<[{ id: string }]>(
    `CREATE import_batch SET
      name = $name, source = $source, row_count = $count,
      status = 'pending', created_at = time::now()`,
    { name, source, count },
  );
  return result;
}

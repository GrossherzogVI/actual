import { type Uuid } from 'surrealdb';

import { db, connect } from './surreal-client';
import type {
  Account,
  Transaction,
  Category,
  Contract,
  Payee,
  ReviewItem,
  DashboardPulse,
  Schedule,
  ThisMonthSummary,
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

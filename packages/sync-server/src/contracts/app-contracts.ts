import express from 'express';
import { v4 as uuidv4 } from 'uuid';

import { getAccountDb } from '../account-db.js';
import {
  requestLoggerMiddleware,
  validateSessionMiddleware,
} from '../util/middlewares.js';

const app = express();

export { app as handlers };
app.use(express.json());
app.use(requestLoggerMiddleware);
app.use(validateSessionMiddleware);

const VALID_TYPES = [
  'subscription',
  'insurance',
  'utility',
  'loan',
  'membership',
  'rent',
  'tax',
  'other',
] as const;

const VALID_STATUSES = [
  'active',
  'expiring',
  'cancelled',
  'paused',
  'discovered',
] as const;

const VALID_INTERVALS = [
  'weekly',
  'monthly',
  'quarterly',
  'semi-annual',
  'annual',
  'custom',
] as const;

// Intervals per year for annual_cost calculation
const INTERVALS_PER_YEAR: Record<string, number> = {
  weekly: 52,
  monthly: 12,
  quarterly: 4,
  'semi-annual': 2,
  annual: 1,
  custom: 1,
};

function computeCancellationDeadline(
  endDate: string | null | undefined,
  noticePeriodMonths: number | null | undefined,
): string | null {
  if (!endDate || !noticePeriodMonths) return null;
  const end = new Date(endDate + 'T00:00:00Z');
  if (isNaN(end.getTime())) return null;
  end.setUTCMonth(end.getUTCMonth() - noticePeriodMonths);
  return end.toISOString().split('T')[0];
}

function computeHealth(
  cancellationDeadline: string | null,
  endDate: string | null,
): 'green' | 'yellow' | 'red' {
  const now = new Date();
  const today = now.toISOString().split('T')[0];

  if (cancellationDeadline) {
    const deadlineDate = new Date(cancellationDeadline + 'T00:00:00Z');
    const daysUntilDeadline = Math.floor(
      (deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (daysUntilDeadline <= 30) return 'red';
  }

  if (endDate) {
    const endDateObj = new Date(endDate + 'T00:00:00Z');
    const daysUntilEnd = Math.floor(
      (endDateObj.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (daysUntilEnd <= 60) return 'yellow';
  }

  return 'green';
}

function computeAnnualCost(
  amount: number | null,
  interval: string,
  additionalEvents: Array<{ amount: number; interval: string }>,
): number | null {
  if (amount == null) return null;
  const multiplier = INTERVALS_PER_YEAR[interval] ?? 1;
  let annual = amount * multiplier;

  for (const ev of additionalEvents) {
    const evMultiplier = INTERVALS_PER_YEAR[ev.interval] ?? 1;
    annual += ev.amount * evMultiplier;
  }

  return annual;
}

function enrichContract(row: Record<string, unknown>) {
  const db = getAccountDb();

  const tags = db
    .all('SELECT tag FROM contract_tags WHERE contract_id = ?', [row.id])
    .map((t: Record<string, unknown>) => t.tag as string);

  const priceHistory = db.all(
    'SELECT * FROM contract_price_history WHERE contract_id = ? ORDER BY change_date DESC',
    [row.id],
  );

  const additionalEvents = db.all(
    'SELECT * FROM contract_events WHERE contract_id = ? ORDER BY created_at',
    [row.id],
  );

  const documents = db.all(
    'SELECT * FROM contract_documents WHERE contract_id = ? ORDER BY uploaded_at DESC',
    [row.id],
  );

  const health = computeHealth(
    row.cancellation_deadline as string | null,
    row.end_date as string | null,
  );

  const annualCost = computeAnnualCost(
    row.amount as number | null,
    row.interval as string,
    additionalEvents as Array<{ amount: number; interval: string }>,
  );

  const costPerDay = annualCost != null ? Math.round(annualCost / 365) : null;

  return {
    ...row,
    auto_renewal: row.auto_renewal === 1 || row.auto_renewal === true,
    tombstone: undefined,
    health,
    annual_cost: annualCost,
    cost_per_day: costPerDay,
    tags,
    price_history: priceHistory,
    additional_events: additionalEvents,
    documents,
  };
}

// ─── Summary (must be registered before /:id) ─────────────────────────────

/** GET /contracts/summary — aggregate cost summary */
app.get('/summary', (_req, res) => {
  const db = getAccountDb();

  const contracts = db.all(
    "SELECT * FROM contracts WHERE tombstone = 0 AND status NOT IN ('cancelled')",
    [],
  );

  let totalMonthly = 0;
  let totalAnnual = 0;
  const byType: Record<string, number> = {};
  const byStatus: Record<string, number> = {};

  for (const c of contracts as Record<string, unknown>[]) {
    const multiplier = INTERVALS_PER_YEAR[c.interval as string] ?? 1;
    const annual = ((c.amount as number) ?? 0) * multiplier;
    const monthly = annual / 12;

    totalAnnual += annual;
    totalMonthly += monthly;

    const type = (c.type as string) ?? 'other';
    byType[type] = (byType[type] ?? 0) + annual;

    const status = c.status as string;
    byStatus[status] = (byStatus[status] ?? 0) + 1;
  }

  res.json({
    status: 'ok',
    data: {
      total_monthly: Math.round(totalMonthly),
      total_annual: Math.round(totalAnnual),
      by_type: byType,
      by_status: byStatus,
    },
  });
});

/** GET /contracts/expiring — contracts with cancellation deadline within N days */
app.get('/expiring', (req, res) => {
  const days = parseInt(String(req.query.days ?? '60'), 10);
  const db = getAccountDb();

  const rows = db.all(
    `SELECT * FROM contracts
     WHERE tombstone = 0
       AND cancellation_deadline IS NOT NULL
       AND cancellation_deadline <= date('now', '+' || ? || ' days')
       AND status NOT IN ('cancelled')
     ORDER BY cancellation_deadline ASC`,
    [days],
  ) as Record<string, unknown>[];

  res.json({ status: 'ok', data: rows.map(enrichContract) });
});

/** POST /contracts/discover — stub for AI contract discovery */
app.post('/discover', (_req, res) => {
  res.json({
    status: 'ok',
    data: { message: 'Discovery not yet implemented' },
  });
});

/** POST /contracts/bulk-import — stub for bulk import */
app.post('/bulk-import', (_req, res) => {
  res.json({
    status: 'ok',
    data: { message: 'Bulk import not yet implemented' },
  });
});

// ─── Contract CRUD ────────────────────────────────────────────────────────

/** GET /contracts — list contracts */
app.get('/', (req, res) => {
  const { status, type, category_id, search } = req.query;

  const db = getAccountDb();
  const conditions = ['tombstone = 0'];
  const params: unknown[] = [];

  if (status) {
    conditions.push('status = ?');
    params.push(status);
  }

  if (type) {
    conditions.push('type = ?');
    params.push(type);
  }

  if (category_id) {
    conditions.push('category_id = ?');
    params.push(category_id);
  }

  if (search) {
    conditions.push('(name LIKE ? OR provider LIKE ? OR counterparty LIKE ?)');
    const term = `%${search}%`;
    params.push(term, term, term);
  }

  const rows = db.all(
    `SELECT * FROM contracts WHERE ${conditions.join(' AND ')} ORDER BY name ASC`,
    params,
  ) as Record<string, unknown>[];

  res.json({ status: 'ok', data: rows.map(enrichContract) });
});

/** GET /contracts/:id — get single contract with full details */
app.get('/:id', (req, res) => {
  const db = getAccountDb();
  const row = db.first(
    'SELECT * FROM contracts WHERE id = ? AND tombstone = 0',
    [req.params.id],
  ) as Record<string, unknown> | undefined;

  if (!row) {
    res.status(404).json({ status: 'error', reason: 'not-found' });
    return;
  }

  res.json({ status: 'ok', data: enrichContract(row) });
});

/** POST /contracts — create a contract */
app.post('/', (req, res) => {
  const {
    name,
    provider,
    type,
    category_id,
    schedule_id,
    amount,
    currency,
    interval,
    custom_interval_days,
    payment_account_id,
    start_date,
    end_date,
    notice_period_months,
    auto_renewal,
    status: contractStatus,
    notes,
    iban,
    counterparty,
    tags,
  } = req.body ?? {};

  if (!name) {
    res.status(400).json({ status: 'error', reason: 'name-required' });
    return;
  }

  if (type && !VALID_TYPES.includes(type)) {
    res.status(400).json({ status: 'error', reason: 'invalid-type' });
    return;
  }

  if (contractStatus && !VALID_STATUSES.includes(contractStatus)) {
    res.status(400).json({ status: 'error', reason: 'invalid-status' });
    return;
  }

  if (interval && !VALID_INTERVALS.includes(interval)) {
    res.status(400).json({ status: 'error', reason: 'invalid-interval' });
    return;
  }

  const id = uuidv4();
  const cancellation_deadline = computeCancellationDeadline(
    end_date,
    notice_period_months,
  );

  const db = getAccountDb();
  db.mutate(
    `INSERT INTO contracts (
      id, name, provider, type, category_id, schedule_id, amount, currency,
      interval, custom_interval_days, payment_account_id, start_date, end_date,
      notice_period_months, auto_renewal, cancellation_deadline, status,
      notes, iban, counterparty
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      name,
      provider ?? null,
      type ?? 'other',
      category_id ?? null,
      schedule_id ?? null,
      amount ?? null,
      currency ?? 'EUR',
      interval ?? 'monthly',
      custom_interval_days ?? null,
      payment_account_id ?? null,
      start_date ?? null,
      end_date ?? null,
      notice_period_months ?? 0,
      auto_renewal !== false ? 1 : 0,
      cancellation_deadline,
      contractStatus ?? 'active',
      notes ?? null,
      iban ?? null,
      counterparty ?? null,
    ],
  );

  // Set tags if provided
  if (Array.isArray(tags)) {
    for (const tag of tags) {
      db.mutate(
        'INSERT OR IGNORE INTO contract_tags (contract_id, tag) VALUES (?, ?)',
        [id, tag],
      );
    }
  }

  const created = db.first(
    'SELECT * FROM contracts WHERE id = ?',
    [id],
  ) as Record<string, unknown>;
  res.json({ status: 'ok', data: enrichContract(created) });
});

/** PATCH /contracts/:id — partial update */
app.patch('/:id', (req, res) => {
  const db = getAccountDb();
  const existing = db.first(
    'SELECT * FROM contracts WHERE id = ? AND tombstone = 0',
    [req.params.id],
  ) as Record<string, unknown> | undefined;

  if (!existing) {
    res.status(404).json({ status: 'error', reason: 'not-found' });
    return;
  }

  const body = req.body ?? {};

  if (body.type && !VALID_TYPES.includes(body.type)) {
    res.status(400).json({ status: 'error', reason: 'invalid-type' });
    return;
  }

  if (body.status && !VALID_STATUSES.includes(body.status)) {
    res.status(400).json({ status: 'error', reason: 'invalid-status' });
    return;
  }

  if (body.interval && !VALID_INTERVALS.includes(body.interval)) {
    res.status(400).json({ status: 'error', reason: 'invalid-interval' });
    return;
  }

  const allowedFields = [
    'name', 'provider', 'type', 'category_id', 'schedule_id', 'amount',
    'currency', 'interval', 'custom_interval_days', 'payment_account_id',
    'start_date', 'end_date', 'notice_period_months', 'auto_renewal',
    'status', 'notes', 'iban', 'counterparty',
  ];

  const updates: string[] = [];
  const params: unknown[] = [];

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      if (field === 'auto_renewal') {
        updates.push(`${field} = ?`);
        params.push(body[field] ? 1 : 0);
      } else {
        updates.push(`${field} = ?`);
        params.push(body[field]);
      }
    }
  }

  if (updates.length === 0 && body.tags === undefined) {
    res.status(400).json({ status: 'error', reason: 'no-fields-to-update' });
    return;
  }

  if (updates.length > 0) {
    // Recompute cancellation_deadline if relevant fields changed
    const endDate =
      body.end_date !== undefined ? body.end_date : existing.end_date;
    const noticePeriod =
      body.notice_period_months !== undefined
        ? body.notice_period_months
        : existing.notice_period_months;

    const newDeadline = computeCancellationDeadline(endDate, noticePeriod);
    updates.push('cancellation_deadline = ?');
    params.push(newDeadline);
    updates.push("updated_at = datetime('now')");
    params.push(req.params.id);

    db.mutate(
      `UPDATE contracts SET ${updates.join(', ')} WHERE id = ?`,
      params,
    );
  }

  // Update tags if provided
  if (Array.isArray(body.tags)) {
    db.mutate('DELETE FROM contract_tags WHERE contract_id = ?', [req.params.id]);
    for (const tag of body.tags) {
      db.mutate(
        'INSERT OR IGNORE INTO contract_tags (contract_id, tag) VALUES (?, ?)',
        [req.params.id, tag],
      );
    }
  }

  const updated = db.first(
    'SELECT * FROM contracts WHERE id = ?',
    [req.params.id],
  ) as Record<string, unknown>;
  res.json({ status: 'ok', data: enrichContract(updated) });
});

/** DELETE /contracts/:id — soft delete */
app.delete('/:id', (req, res) => {
  const db = getAccountDb();
  const existing = db.first(
    'SELECT * FROM contracts WHERE id = ? AND tombstone = 0',
    [req.params.id],
  );

  if (!existing) {
    res.status(404).json({ status: 'error', reason: 'not-found' });
    return;
  }

  db.mutate(
    "UPDATE contracts SET tombstone = 1, updated_at = datetime('now') WHERE id = ?",
    [req.params.id],
  );

  res.json({ status: 'ok', data: { deleted: true } });
});

// ─── Price History ─────────────────────────────────────────────────────────

/** GET /contracts/:id/price-history */
app.get('/:id/price-history', (req, res) => {
  const db = getAccountDb();
  const contract = db.first(
    'SELECT id FROM contracts WHERE id = ? AND tombstone = 0',
    [req.params.id],
  );

  if (!contract) {
    res.status(404).json({ status: 'error', reason: 'not-found' });
    return;
  }

  const rows = db.all(
    'SELECT * FROM contract_price_history WHERE contract_id = ? ORDER BY change_date DESC',
    [req.params.id],
  );

  res.json({ status: 'ok', data: rows });
});

/** POST /contracts/:id/price-change */
app.post('/:id/price-change', (req, res) => {
  const { old_amount, new_amount, change_date, reason, detected_by } =
    req.body ?? {};

  if (old_amount == null || new_amount == null || !change_date) {
    res.status(400).json({ status: 'error', reason: 'missing-fields' });
    return;
  }

  const db = getAccountDb();
  const contract = db.first(
    'SELECT id FROM contracts WHERE id = ? AND tombstone = 0',
    [req.params.id],
  );

  if (!contract) {
    res.status(404).json({ status: 'error', reason: 'not-found' });
    return;
  }

  const id = uuidv4();
  db.mutate(
    `INSERT INTO contract_price_history (id, contract_id, old_amount, new_amount, change_date, reason, detected_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      req.params.id,
      old_amount,
      new_amount,
      change_date,
      reason ?? null,
      detected_by ?? 'manual',
    ],
  );

  // Update contract's current amount
  db.mutate(
    "UPDATE contracts SET amount = ?, updated_at = datetime('now') WHERE id = ?",
    [new_amount, req.params.id],
  );

  const created = db.first(
    'SELECT * FROM contract_price_history WHERE id = ?',
    [id],
  );
  res.json({ status: 'ok', data: created });
});

// ─── Additional Events ─────────────────────────────────────────────────────

/** GET /contracts/:id/events */
app.get('/:id/events', (req, res) => {
  const db = getAccountDb();
  const contract = db.first(
    'SELECT id FROM contracts WHERE id = ? AND tombstone = 0',
    [req.params.id],
  );

  if (!contract) {
    res.status(404).json({ status: 'error', reason: 'not-found' });
    return;
  }

  const rows = db.all(
    'SELECT * FROM contract_events WHERE contract_id = ? ORDER BY created_at',
    [req.params.id],
  );

  res.json({ status: 'ok', data: rows });
});

/** POST /contracts/:id/events */
app.post('/:id/events', (req, res) => {
  const { description, amount, interval, month, day, next_date } =
    req.body ?? {};

  if (!description || amount == null) {
    res.status(400).json({ status: 'error', reason: 'missing-fields' });
    return;
  }

  const db = getAccountDb();
  const contract = db.first(
    'SELECT id FROM contracts WHERE id = ? AND tombstone = 0',
    [req.params.id],
  );

  if (!contract) {
    res.status(404).json({ status: 'error', reason: 'not-found' });
    return;
  }

  const id = uuidv4();
  db.mutate(
    `INSERT INTO contract_events (id, contract_id, description, amount, interval, month, day, next_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      req.params.id,
      description,
      amount,
      interval ?? 'annual',
      month ?? null,
      day ?? null,
      next_date ?? null,
    ],
  );

  const created = db.first('SELECT * FROM contract_events WHERE id = ?', [id]);
  res.json({ status: 'ok', data: created });
});

/** DELETE /contracts/:id/events/:eid */
app.delete('/:id/events/:eid', (req, res) => {
  const db = getAccountDb();
  const event = db.first(
    'SELECT id FROM contract_events WHERE id = ? AND contract_id = ?',
    [req.params.eid, req.params.id],
  );

  if (!event) {
    res.status(404).json({ status: 'error', reason: 'not-found' });
    return;
  }

  db.mutate('DELETE FROM contract_events WHERE id = ?', [req.params.eid]);
  res.json({ status: 'ok', data: { deleted: true } });
});

// ─── Tags ─────────────────────────────────────────────────────────────────

/** POST /contracts/:id/tags — replace all tags */
app.post('/:id/tags', (req, res) => {
  const { tags } = req.body ?? {};

  if (!Array.isArray(tags)) {
    res.status(400).json({ status: 'error', reason: 'tags-must-be-array' });
    return;
  }

  const db = getAccountDb();
  const contract = db.first(
    'SELECT id FROM contracts WHERE id = ? AND tombstone = 0',
    [req.params.id],
  );

  if (!contract) {
    res.status(404).json({ status: 'error', reason: 'not-found' });
    return;
  }

  db.mutate('DELETE FROM contract_tags WHERE contract_id = ?', [req.params.id]);
  for (const tag of tags) {
    db.mutate(
      'INSERT OR IGNORE INTO contract_tags (contract_id, tag) VALUES (?, ?)',
      [req.params.id, tag],
    );
  }

  const updatedTags = db
    .all('SELECT tag FROM contract_tags WHERE contract_id = ?', [req.params.id])
    .map((t: Record<string, unknown>) => t.tag);

  res.json({ status: 'ok', data: { tags: updatedTags } });
});

/** POST /contracts/:id/documents — upload document (multipart stub) */
app.post('/:id/documents', (req, res) => {
  res.status(501).json({
    status: 'error',
    reason: 'Document upload not yet implemented',
  });
});

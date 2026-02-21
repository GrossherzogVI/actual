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
  'insurance',
  'rent',
  'utility',
  'subscription',
  'tax',
  'loan',
  'other',
] as const;

const VALID_STATUSES = [
  'active',
  'cancelled',
  'pending_cancel',
  'expired',
  'discovered',
] as const;

function computeCancellationDeadline(
  endDate: string | null | undefined,
  cancellationPeriodDays: number | null | undefined,
): string | null {
  if (!endDate || !cancellationPeriodDays) return null;
  // Use UTC methods to avoid timezone-related off-by-one errors
  const end = new Date(endDate + 'T00:00:00Z');
  if (isNaN(end.getTime())) return null;
  end.setUTCDate(end.getUTCDate() - cancellationPeriodDays);
  return end.toISOString().split('T')[0];
}

/** GET /contracts — list contracts for a file */
app.get('/', (req, res) => {
  const { fileId, status, expiringWithin } = req.query;

  if (!fileId) {
    res.status(400).json({ status: 'error', reason: 'file-id-required' });
    return;
  }

  const db = getAccountDb();
  const conditions = ['file_id = ?'];
  const params: unknown[] = [fileId];

  if (status) {
    conditions.push('status = ?');
    params.push(status);
  }

  if (expiringWithin) {
    const days = parseInt(String(expiringWithin), 10);
    if (!isNaN(days) && days > 0) {
      conditions.push(
        "cancellation_deadline IS NOT NULL AND cancellation_deadline <= date('now', '+' || ? || ' days')",
      );
      params.push(days);
    }
  }

  const rows = db.all(
    `SELECT * FROM contracts WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`,
    params,
  );

  res.json({ status: 'ok', data: rows });
});

/** GET /contracts/:id — get a single contract */
app.get('/:id', (req, res) => {
  const db = getAccountDb();
  const row = db.first('SELECT * FROM contracts WHERE id = ?', [req.params.id]);

  if (!row) {
    res.status(404).json({ status: 'error', reason: 'not-found' });
    return;
  }

  res.json({ status: 'ok', data: row });
});

/** POST /contracts — create a contract */
app.post('/', (req, res) => {
  const {
    name,
    provider,
    type,
    category_id,
    amount,
    frequency,
    start_date,
    end_date,
    cancellation_period_days,
    schedule_id,
    notes,
    file_id,
    status: contractStatus,
  } = req.body || {};

  if (!name) {
    res.status(400).json({ status: 'error', reason: 'name-required' });
    return;
  }

  if (!file_id) {
    res.status(400).json({ status: 'error', reason: 'file-id-required' });
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

  const id = uuidv4();
  const cancellation_deadline = computeCancellationDeadline(
    end_date,
    cancellation_period_days,
  );

  const db = getAccountDb();
  db.mutate(
    `INSERT INTO contracts (id, file_id, name, provider, type, category_id, amount, frequency, start_date, end_date, cancellation_period_days, cancellation_deadline, schedule_id, status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      file_id,
      name,
      provider || null,
      type || null,
      category_id || null,
      amount ?? null,
      frequency || 'monthly',
      start_date || null,
      end_date || null,
      cancellation_period_days ?? null,
      cancellation_deadline,
      schedule_id || null,
      contractStatus || 'active',
      notes || null,
    ],
  );

  const created = db.first('SELECT * FROM contracts WHERE id = ?', [id]);
  res.json({ status: 'ok', data: created });
});

/** PATCH /contracts/:id — partial update */
app.patch('/:id', (req, res) => {
  const db = getAccountDb();
  const existing = db.first('SELECT * FROM contracts WHERE id = ?', [
    req.params.id,
  ]);

  if (!existing) {
    res.status(404).json({ status: 'error', reason: 'not-found' });
    return;
  }

  const allowedFields = [
    'name',
    'provider',
    'type',
    'category_id',
    'amount',
    'frequency',
    'start_date',
    'end_date',
    'cancellation_period_days',
    'next_payment_date',
    'schedule_id',
    'status',
    'notes',
  ];

  const updates: string[] = [];
  const params: unknown[] = [];
  const body = req.body || {};

  if (body.type && !VALID_TYPES.includes(body.type)) {
    res.status(400).json({ status: 'error', reason: 'invalid-type' });
    return;
  }

  if (body.status && !VALID_STATUSES.includes(body.status)) {
    res.status(400).json({ status: 'error', reason: 'invalid-status' });
    return;
  }

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates.push(`${field} = ?`);
      params.push(body[field]);
    }
  }

  if (updates.length === 0) {
    res.status(400).json({ status: 'error', reason: 'no-fields-to-update' });
    return;
  }

  // Recompute cancellation_deadline if relevant fields changed
  const endDate =
    body.end_date !== undefined ? body.end_date : existing.end_date;
  const cancelDays =
    body.cancellation_period_days !== undefined
      ? body.cancellation_period_days
      : existing.cancellation_period_days;

  const newDeadline = computeCancellationDeadline(endDate, cancelDays);
  updates.push('cancellation_deadline = ?');
  params.push(newDeadline);

  updates.push("updated_at = datetime('now')");

  params.push(req.params.id);
  db.mutate(
    `UPDATE contracts SET ${updates.join(', ')} WHERE id = ?`,
    params,
  );

  const updated = db.first('SELECT * FROM contracts WHERE id = ?', [
    req.params.id,
  ]);
  res.json({ status: 'ok', data: updated });
});

/** DELETE /contracts/:id — delete contract and cascade */
app.delete('/:id', (req, res) => {
  const db = getAccountDb();
  const existing = db.first('SELECT * FROM contracts WHERE id = ?', [
    req.params.id,
  ]);

  if (!existing) {
    res.status(404).json({ status: 'error', reason: 'not-found' });
    return;
  }

  // Cascade: remove contract_documents and nullify invoices
  db.mutate('DELETE FROM contract_documents WHERE contract_id = ?', [
    req.params.id,
  ]);
  db.mutate(
    'UPDATE invoices SET contract_id = NULL WHERE contract_id = ?',
    [req.params.id],
  );
  db.mutate('DELETE FROM contracts WHERE id = ?', [req.params.id]);

  res.json({ status: 'ok', data: { deleted: true } });
});

/** POST /contracts/discover — stub for AI discovery */
app.post('/discover', (_req, res) => {
  res.json({
    status: 'ok',
    data: { message: 'Discovery not yet implemented' },
  });
});

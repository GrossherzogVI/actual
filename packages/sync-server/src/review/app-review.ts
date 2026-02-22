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

const VALID_STATUSES = [
  'pending',
  'accepted',
  'rejected',
  'snoozed',
  'dismissed',
] as const;

const VALID_TYPES = [
  'uncategorized',
  'low_confidence',
  'recurring_detected',
  'amount_mismatch',
  'budget_suggestion',
  'parked_expense',
] as const;

const VALID_PRIORITIES = ['urgent', 'review', 'suggestion'] as const;

/** POST /review — create a new review item (e.g. parked expense from Quick Add) */
app.post('/', (req, res) => {
  const { type, priority, amount, category_id, notes } = req.body ?? {};

  if (!type || !VALID_TYPES.includes(type)) {
    res.status(400).json({ status: 'error', reason: 'invalid-type' });
    return;
  }

  if (!priority || !VALID_PRIORITIES.includes(priority)) {
    res.status(400).json({ status: 'error', reason: 'invalid-priority' });
    return;
  }

  const db = getAccountDb();
  const id = uuidv4();

  const aiSuggestion = (amount != null || notes)
    ? JSON.stringify({ amount, category_id, notes: notes ?? undefined })
    : null;

  db.mutate(
    `INSERT INTO review_queue
       (id, type, priority, transaction_id, contract_id, schedule_id,
        ai_suggestion, ai_confidence, status, snoozed_until, resolved_at,
        resolved_action, created_at, updated_at)
     VALUES (?, ?, ?, NULL, NULL, NULL, ?, NULL, 'pending', NULL, NULL, NULL,
             datetime('now'), datetime('now'))`,
    [id, type, priority, aiSuggestion],
  );

  const created = db.first('SELECT * FROM review_queue WHERE id = ?', [id]);
  res.status(201).json({ status: 'ok', data: created });
});

/** GET /review/count — counts by priority */
app.get('/count', (_req, res) => {
  const db = getAccountDb();

  const rows = db.all(
    `SELECT priority, COUNT(*) as count FROM review_queue
     WHERE status = 'pending'
     GROUP BY priority`,
    [],
  ) as Array<{ priority: string; count: number }>;

  const counts: Record<string, number> = { pending: 0, urgent: 0, review: 0, suggestion: 0 };
  let total = 0;
  for (const row of rows) {
    counts[row.priority] = row.count;
    total += row.count;
  }
  counts.pending = total;

  res.json({ status: 'ok', data: counts });
});

/** GET /review — list pending review items */
app.get('/', (req, res) => {
  const { type, priority, limit, offset } = req.query;

  const db = getAccountDb();
  const conditions = ["status = 'pending'"];
  const params: unknown[] = [];

  if (type) {
    conditions.push('type = ?');
    params.push(type);
  }

  if (priority) {
    conditions.push('priority = ?');
    params.push(priority);
  }

  const limitNum = parseInt(String(limit ?? '50'), 10);
  const offsetNum = parseInt(String(offset ?? '0'), 10);

  const rows = db.all(
    `SELECT * FROM review_queue
     WHERE ${conditions.join(' AND ')}
     ORDER BY
       CASE priority WHEN 'urgent' THEN 0 WHEN 'review' THEN 1 ELSE 2 END,
       created_at ASC
     LIMIT ? OFFSET ?`,
    [...params, limitNum, offsetNum],
  );

  res.json({ status: 'ok', data: rows });
});

/** PATCH /review/:id — update status */
app.patch('/:id', (req, res) => {
  const { status: newStatus, snoozed_until, resolved_action } = req.body ?? {};

  if (!newStatus || !VALID_STATUSES.includes(newStatus)) {
    res.status(400).json({ status: 'error', reason: 'invalid-status' });
    return;
  }

  const db = getAccountDb();
  const existing = db.first(
    'SELECT * FROM review_queue WHERE id = ?',
    [req.params.id],
  );

  if (!existing) {
    res.status(404).json({ status: 'error', reason: 'not-found' });
    return;
  }

  const isResolved = ['accepted', 'rejected', 'dismissed'].includes(newStatus);
  const isSnoozed = newStatus === 'snoozed';

  db.mutate(
    `UPDATE review_queue SET
       status = ?,
       snoozed_until = ?,
       resolved_at = CASE WHEN ? THEN datetime('now') ELSE NULL END,
       resolved_action = ?,
       updated_at = datetime('now')
     WHERE id = ?`,
    [
      newStatus,
      isSnoozed ? (snoozed_until ?? null) : null,
      isResolved ? 1 : 0,
      resolved_action ?? null,
      req.params.id,
    ],
  );

  const updated = db.first('SELECT * FROM review_queue WHERE id = ?', [req.params.id]);
  res.json({ status: 'ok', data: updated });
});

/** POST /review/batch — batch accept or reject */
app.post('/batch', (req, res) => {
  const { ids, status: newStatus, resolved_action } = req.body ?? {};

  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ status: 'error', reason: 'ids-required' });
    return;
  }

  if (!newStatus || !['accepted', 'rejected', 'dismissed'].includes(newStatus)) {
    res.status(400).json({ status: 'error', reason: 'invalid-status' });
    return;
  }

  const db = getAccountDb();
  const placeholders = ids.map(() => '?').join(',');

  db.mutate(
    `UPDATE review_queue SET
       status = ?,
       resolved_at = datetime('now'),
       resolved_action = ?,
       updated_at = datetime('now')
     WHERE id IN (${placeholders}) AND status = 'pending'`,
    [newStatus, resolved_action ?? null, ...ids],
  );

  res.json({ status: 'ok', data: { updated: ids.length } });
});

/** POST /review/:id/apply — apply the AI suggestion */
app.post('/:id/apply', (req, res) => {
  const db = getAccountDb();
  const item = db.first(
    'SELECT * FROM review_queue WHERE id = ?',
    [req.params.id],
  ) as Record<string, unknown> | undefined;

  if (!item) {
    res.status(404).json({ status: 'error', reason: 'not-found' });
    return;
  }

  if (item.status !== 'pending') {
    res.status(400).json({ status: 'error', reason: 'already-resolved' });
    return;
  }

  // The actual application of the suggestion (e.g., setting a category on a transaction)
  // is handled by the frontend via loot-core handlers after receiving the suggestion data.
  // Here we just mark it as accepted and return the suggestion payload.
  db.mutate(
    `UPDATE review_queue SET
       status = 'accepted',
       resolved_at = datetime('now'),
       resolved_action = 'applied',
       updated_at = datetime('now')
     WHERE id = ?`,
    [req.params.id],
  );

  res.json({
    status: 'ok',
    data: {
      applied: true,
      suggestion: item.ai_suggestion
        ? JSON.parse(item.ai_suggestion as string)
        : null,
    },
  });
});

// ─── Batch accept by confidence threshold ────────────────────────────────

/** POST /review/batch-accept — accept all pending items above confidence threshold */
app.post('/batch-accept', (req, res) => {
  const { minConfidence } = req.body ?? {};
  const threshold = typeof minConfidence === 'number' ? minConfidence : 0.9;

  const db = getAccountDb();

  const result = db.mutate(
    `UPDATE review_queue SET
       status = 'accepted',
       resolved_at = datetime('now'),
       resolved_action = 'batch_accept',
       updated_at = datetime('now')
     WHERE status = 'pending' AND ai_confidence >= ?`,
    [threshold],
  );

  res.json({
    status: 'ok',
    data: { accepted: result.changes ?? 0, threshold },
  });
});

// ─── Individual inline actions ───────────────────────────────────────────

/** POST /review/:id/accept — accept and apply AI suggestion */
app.post('/:id/accept', (req, res) => {
  const db = getAccountDb();
  const item = db.first(
    'SELECT * FROM review_queue WHERE id = ?',
    [req.params.id],
  ) as Record<string, unknown> | undefined;

  if (!item) {
    res.status(404).json({ status: 'error', reason: 'not-found' });
    return;
  }

  if (item.status !== 'pending') {
    res.status(400).json({ status: 'error', reason: 'already-resolved' });
    return;
  }

  db.mutate(
    `UPDATE review_queue SET
       status = 'accepted',
       resolved_at = datetime('now'),
       resolved_action = 'inline_accept',
       updated_at = datetime('now')
     WHERE id = ?`,
    [req.params.id],
  );

  const suggestion = item.ai_suggestion
    ? JSON.parse(item.ai_suggestion as string)
    : null;

  res.json({
    status: 'ok',
    data: { accepted: true, suggestion },
  });
});

/** POST /review/:id/reject — reject, optionally provide correct category */
app.post('/:id/reject', (req, res) => {
  const { correct_category_id } = req.body ?? {};

  const db = getAccountDb();
  const item = db.first(
    'SELECT * FROM review_queue WHERE id = ?',
    [req.params.id],
  ) as Record<string, unknown> | undefined;

  if (!item) {
    res.status(404).json({ status: 'error', reason: 'not-found' });
    return;
  }

  if (item.status !== 'pending') {
    res.status(400).json({ status: 'error', reason: 'already-resolved' });
    return;
  }

  const resolvedAction = correct_category_id
    ? `rejected_with_correction:${correct_category_id}`
    : 'inline_reject';

  db.mutate(
    `UPDATE review_queue SET
       status = 'rejected',
       resolved_at = datetime('now'),
       resolved_action = ?,
       updated_at = datetime('now')
     WHERE id = ?`,
    [resolvedAction, req.params.id],
  );

  res.json({
    status: 'ok',
    data: { rejected: true, correct_category_id: correct_category_id ?? null },
  });
});

/** POST /review/:id/snooze — snooze for N days */
app.post('/:id/snooze', (req, res) => {
  const { days } = req.body ?? {};
  const snoozeDays = typeof days === 'number' ? days : 7;

  const db = getAccountDb();
  const item = db.first(
    'SELECT * FROM review_queue WHERE id = ?',
    [req.params.id],
  ) as Record<string, unknown> | undefined;

  if (!item) {
    res.status(404).json({ status: 'error', reason: 'not-found' });
    return;
  }

  if (item.status !== 'pending') {
    res.status(400).json({ status: 'error', reason: 'already-resolved' });
    return;
  }

  db.mutate(
    `UPDATE review_queue SET
       status = 'snoozed',
       snoozed_until = datetime('now', '+' || ? || ' days'),
       resolved_action = 'snoozed',
       updated_at = datetime('now')
     WHERE id = ?`,
    [snoozeDays, req.params.id],
  );

  const updated = db.first('SELECT * FROM review_queue WHERE id = ?', [req.params.id]);
  res.json({ status: 'ok', data: updated });
});

/** DELETE /review/:id — dismiss permanently */
app.delete('/:id', (req, res) => {
  const db = getAccountDb();
  const existing = db.first(
    'SELECT id FROM review_queue WHERE id = ?',
    [req.params.id],
  );

  if (!existing) {
    res.status(404).json({ status: 'error', reason: 'not-found' });
    return;
  }

  db.mutate(
    `UPDATE review_queue SET
       status = 'dismissed',
       resolved_at = datetime('now'),
       resolved_action = 'deleted',
       updated_at = datetime('now')
     WHERE id = ?`,
    [req.params.id],
  );

  res.json({ status: 'ok', data: { deleted: true } });
});

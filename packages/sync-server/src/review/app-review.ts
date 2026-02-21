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

  res.json({ status: 'ok', data: { dismissed: true } });
});

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

/** GET /quick-add/presets — list presets sorted by sort_order */
app.get('/presets', (_req, res) => {
  const db = getAccountDb();
  const rows = db.all(
    'SELECT * FROM quick_add_presets ORDER BY sort_order ASC, created_at ASC',
    [],
  );
  res.json({ status: 'ok', data: rows });
});

/** POST /quick-add/presets — create a preset */
app.post('/presets', (req, res) => {
  const { label, icon, amount, category_id, payee, account_id, sort_order } =
    req.body ?? {};

  if (!label || typeof label !== 'string') {
    res.status(400).json({ status: 'error', reason: 'label-required' });
    return;
  }

  const db = getAccountDb();
  const id = uuidv4();

  db.mutate(
    `INSERT INTO quick_add_presets
       (id, label, icon, amount, category_id, payee, account_id, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      label,
      icon ?? null,
      amount ?? null,
      category_id ?? null,
      payee ?? null,
      account_id ?? null,
      sort_order ?? 0,
    ],
  );

  const created = db.first('SELECT * FROM quick_add_presets WHERE id = ?', [id]);
  res.json({ status: 'ok', data: created });
});

/** PATCH /quick-add/presets/:id — update preset fields */
app.patch('/presets/:id', (req, res) => {
  const db = getAccountDb();
  const existing = db.first(
    'SELECT id FROM quick_add_presets WHERE id = ?',
    [req.params.id],
  );

  if (!existing) {
    res.status(404).json({ status: 'error', reason: 'not-found' });
    return;
  }

  const { label, icon, amount, category_id, payee, account_id, sort_order } =
    req.body ?? {};

  const fields: string[] = [];
  const params: unknown[] = [];

  if (label !== undefined) { fields.push('label = ?'); params.push(label); }
  if (icon !== undefined) { fields.push('icon = ?'); params.push(icon); }
  if (amount !== undefined) { fields.push('amount = ?'); params.push(amount); }
  if (category_id !== undefined) { fields.push('category_id = ?'); params.push(category_id); }
  if (payee !== undefined) { fields.push('payee = ?'); params.push(payee); }
  if (account_id !== undefined) { fields.push('account_id = ?'); params.push(account_id); }
  if (sort_order !== undefined) { fields.push('sort_order = ?'); params.push(sort_order); }

  if (fields.length === 0) {
    res.status(400).json({ status: 'error', reason: 'no-fields' });
    return;
  }

  params.push(req.params.id);
  db.mutate(
    `UPDATE quick_add_presets SET ${fields.join(', ')} WHERE id = ?`,
    params,
  );

  const updated = db.first('SELECT * FROM quick_add_presets WHERE id = ?', [req.params.id]);
  res.json({ status: 'ok', data: updated });
});

/** DELETE /quick-add/presets/:id — delete a preset */
app.delete('/presets/:id', (req, res) => {
  const db = getAccountDb();
  const existing = db.first(
    'SELECT id FROM quick_add_presets WHERE id = ?',
    [req.params.id],
  );

  if (!existing) {
    res.status(404).json({ status: 'error', reason: 'not-found' });
    return;
  }

  db.mutate('DELETE FROM quick_add_presets WHERE id = ?', [req.params.id]);
  res.json({ status: 'ok', data: { deleted: true } });
});

/** POST /quick-add/presets/reorder — update sort_order for array of { id, sort_order } */
app.post('/presets/reorder', (req, res) => {
  const { order } = req.body ?? {};

  if (!Array.isArray(order) || order.length === 0) {
    res.status(400).json({ status: 'error', reason: 'order-required' });
    return;
  }

  const db = getAccountDb();
  for (const item of order as Array<{ id: string; sort_order: number }>) {
    if (!item.id || item.sort_order === undefined) continue;
    db.mutate(
      'UPDATE quick_add_presets SET sort_order = ? WHERE id = ?',
      [item.sort_order, item.id],
    );
  }

  res.json({ status: 'ok', data: { reordered: order.length } });
});

/** GET /quick-add/frecency — list category frecency scores sorted by score DESC */
app.get('/frecency', (_req, res) => {
  const db = getAccountDb();
  const rows = db.all(
    'SELECT * FROM category_frecency ORDER BY score DESC',
    [],
  );
  res.json({ status: 'ok', data: rows });
});

/** POST /quick-add/frecency/bump — increment use_count, recalculate score */
app.post('/frecency/bump', (req, res) => {
  const { category_id } = req.body ?? {};

  if (!category_id || typeof category_id !== 'string') {
    res.status(400).json({ status: 'error', reason: 'category_id-required' });
    return;
  }

  const db = getAccountDb();
  const now = new Date().toISOString();

  const existing = db.first(
    'SELECT * FROM category_frecency WHERE category_id = ?',
    [category_id],
  ) as { category_id: string; use_count: number; last_used_at: string | null; score: number } | undefined;

  const newCount = (existing?.use_count ?? 0) + 1;
  const score = calculateFrecencyScore(newCount, now);

  if (existing) {
    db.mutate(
      `UPDATE category_frecency
         SET use_count = ?, last_used_at = ?, score = ?
       WHERE category_id = ?`,
      [newCount, now, score, category_id],
    );
  } else {
    db.mutate(
      `INSERT INTO category_frecency (category_id, use_count, last_used_at, score)
       VALUES (?, ?, ?, ?)`,
      [category_id, newCount, now, score],
    );
  }

  const updated = db.first(
    'SELECT * FROM category_frecency WHERE category_id = ?',
    [category_id],
  );
  res.json({ status: 'ok', data: updated });
});

function calculateFrecencyScore(useCount: number, lastUsedAt: string): number {
  const now = new Date();
  const lastUsed = new Date(lastUsedAt);
  const daysSince = (now.getTime() - lastUsed.getTime()) / (1000 * 60 * 60 * 24);
  const recencyWeight = Math.max(0.1, 1.0 - daysSince / 90);
  return useCount * recencyWeight;
}

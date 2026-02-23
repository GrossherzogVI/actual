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

let tablesEnsured = false;

function ensureTables() {
  if (tablesEnsured) return;

  const db = getAccountDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS delegate_lanes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'assigned',
      assignee TEXT,
      assigned_by TEXT,
      payload_json TEXT,
      accepted_at TEXT,
      completed_at TEXT,
      rejected_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  tablesEnsured = true;
}

app.get('/lanes', (_req, res) => {
  ensureTables();

  const db = getAccountDb();
  const rows = db.all(
    'SELECT * FROM delegate_lanes ORDER BY updated_at DESC',
    [],
  ) as Array<Record<string, unknown>>;

  res.json({
    status: 'ok',
    data: rows.map(row => ({
      ...row,
      payload: row.payload_json ? JSON.parse(String(row.payload_json)) : null,
      payload_json: undefined,
    })),
  });
});

app.post('/assign-lane', (req, res) => {
  ensureTables();

  const { title, assignee, assigned_by, payload } = req.body ?? {};

  if (!title || typeof title !== 'string') {
    res.status(400).json({ status: 'error', reason: 'title-required' });
    return;
  }

  const id = uuidv4();
  const db = getAccountDb();

  db.mutate(
    `INSERT INTO delegate_lanes
      (id, title, status, assignee, assigned_by, payload_json, created_at, updated_at)
     VALUES (?, ?, 'assigned', ?, ?, ?, datetime('now'), datetime('now'))`,
    [id, title, assignee ?? null, assigned_by ?? 'owner', payload ? JSON.stringify(payload) : null],
  );

  const created = db.first('SELECT * FROM delegate_lanes WHERE id = ?', [id]);
  res.status(201).json({ status: 'ok', data: created });
});

app.post('/accept-lane/:id', (_req, res) => {
  ensureTables();

  const db = getAccountDb();
  const existing = db.first('SELECT id FROM delegate_lanes WHERE id = ?', [
    _req.params.id,
  ]);

  if (!existing) {
    res.status(404).json({ status: 'error', reason: 'not-found' });
    return;
  }

  db.mutate(
    `UPDATE delegate_lanes
     SET status = 'accepted', accepted_at = datetime('now'), updated_at = datetime('now')
     WHERE id = ?`,
    [_req.params.id],
  );

  const updated = db.first('SELECT * FROM delegate_lanes WHERE id = ?', [
    _req.params.id,
  ]);
  res.json({ status: 'ok', data: updated });
});

app.post('/complete-lane/:id', (_req, res) => {
  ensureTables();

  const db = getAccountDb();
  const existing = db.first('SELECT id FROM delegate_lanes WHERE id = ?', [
    _req.params.id,
  ]);

  if (!existing) {
    res.status(404).json({ status: 'error', reason: 'not-found' });
    return;
  }

  db.mutate(
    `UPDATE delegate_lanes
     SET status = 'completed', completed_at = datetime('now'), updated_at = datetime('now')
     WHERE id = ?`,
    [_req.params.id],
  );

  const updated = db.first('SELECT * FROM delegate_lanes WHERE id = ?', [
    _req.params.id,
  ]);
  res.json({ status: 'ok', data: updated });
});

app.post('/reject-lane/:id', (_req, res) => {
  ensureTables();

  const db = getAccountDb();
  const existing = db.first('SELECT id FROM delegate_lanes WHERE id = ?', [
    _req.params.id,
  ]);

  if (!existing) {
    res.status(404).json({ status: 'error', reason: 'not-found' });
    return;
  }

  db.mutate(
    `UPDATE delegate_lanes
     SET status = 'rejected', rejected_at = datetime('now'), updated_at = datetime('now')
     WHERE id = ?`,
    [_req.params.id],
  );

  const updated = db.first('SELECT * FROM delegate_lanes WHERE id = ?', [
    _req.params.id,
  ]);
  res.json({ status: 'ok', data: updated });
});

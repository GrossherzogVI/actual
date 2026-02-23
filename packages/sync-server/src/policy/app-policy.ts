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
    CREATE TABLE IF NOT EXISTS policy_egress (
      id TEXT PRIMARY KEY,
      allow_cloud INTEGER NOT NULL DEFAULT 0,
      allowed_providers_json TEXT NOT NULL DEFAULT '[]',
      redaction_mode TEXT NOT NULL DEFAULT 'strict',
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS policy_egress_audit (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      provider TEXT,
      payload_json TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  const existing = db.first('SELECT id FROM policy_egress WHERE id = ?', ['default']);
  if (!existing) {
    db.mutate(
      `INSERT INTO policy_egress
        (id, allow_cloud, allowed_providers_json, redaction_mode)
       VALUES ('default', 0, '[]', 'strict')`,
      [],
    );
  }

  tablesEnsured = true;
}

app.get('/egress-policy', (_req, res) => {
  ensureTables();

  const db = getAccountDb();
  const row = db.first(
    'SELECT * FROM policy_egress WHERE id = ?',
    ['default'],
  ) as Record<string, unknown>;

  res.json({
    status: 'ok',
    data: {
      ...row,
      allow_cloud: row.allow_cloud === 1,
      allowed_providers: JSON.parse(String(row.allowed_providers_json || '[]')),
      allowed_providers_json: undefined,
    },
  });
});

app.patch('/egress-policy', (req, res) => {
  ensureTables();

  const { allow_cloud, allowed_providers, redaction_mode } = req.body ?? {};

  if (allow_cloud !== undefined && typeof allow_cloud !== 'boolean') {
    res.status(400).json({ status: 'error', reason: 'allow-cloud-must-be-boolean' });
    return;
  }

  if (allowed_providers !== undefined && !Array.isArray(allowed_providers)) {
    res.status(400).json({ status: 'error', reason: 'allowed-providers-must-be-array' });
    return;
  }

  if (
    redaction_mode !== undefined &&
    !['strict', 'balanced', 'off'].includes(String(redaction_mode))
  ) {
    res.status(400).json({ status: 'error', reason: 'invalid-redaction-mode' });
    return;
  }

  const db = getAccountDb();
  const current = db.first('SELECT * FROM policy_egress WHERE id = ?', [
    'default',
  ]) as Record<string, unknown>;

  const nextAllowCloud =
    allow_cloud === undefined ? current.allow_cloud === 1 : allow_cloud;
  const nextProviders =
    allowed_providers === undefined
      ? JSON.parse(String(current.allowed_providers_json || '[]'))
      : allowed_providers;
  const nextRedactionMode =
    redaction_mode === undefined
      ? String(current.redaction_mode || 'strict')
      : String(redaction_mode);

  db.mutate(
    `UPDATE policy_egress
     SET allow_cloud = ?,
         allowed_providers_json = ?,
         redaction_mode = ?,
         updated_at = datetime('now')
     WHERE id = 'default'`,
    [nextAllowCloud ? 1 : 0, JSON.stringify(nextProviders), nextRedactionMode],
  );

  const auditId = uuidv4();
  db.mutate(
    `INSERT INTO policy_egress_audit (id, event_type, provider, payload_json)
     VALUES (?, 'policy-updated', NULL, ?)`,
    [auditId, JSON.stringify({ allow_cloud: nextAllowCloud, allowed_providers: nextProviders, redaction_mode: nextRedactionMode })],
  );

  const updated = db.first('SELECT * FROM policy_egress WHERE id = ?', [
    'default',
  ]) as Record<string, unknown>;

  res.json({
    status: 'ok',
    data: {
      ...updated,
      allow_cloud: updated.allow_cloud === 1,
      allowed_providers: JSON.parse(String(updated.allowed_providers_json || '[]')),
      allowed_providers_json: undefined,
    },
  });
});

app.get('/egress-audit', (req, res) => {
  ensureTables();

  const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? '50'), 10)));

  const db = getAccountDb();
  const rows = db.all(
    `SELECT * FROM policy_egress_audit
     ORDER BY created_at DESC
     LIMIT ?`,
    [limit],
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

app.post('/record-egress', (req, res) => {
  ensureTables();

  const { event_type, provider, payload } = req.body ?? {};

  if (!event_type || typeof event_type !== 'string') {
    res.status(400).json({ status: 'error', reason: 'event-type-required' });
    return;
  }

  const db = getAccountDb();
  const id = uuidv4();
  db.mutate(
    `INSERT INTO policy_egress_audit (id, event_type, provider, payload_json)
     VALUES (?, ?, ?, ?)`,
    [id, event_type, provider ?? null, payload ? JSON.stringify(payload) : null],
  );

  const created = db.first('SELECT * FROM policy_egress_audit WHERE id = ?', [
    id,
  ]);
  res.status(201).json({ status: 'ok', data: created });
});

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
    CREATE TABLE IF NOT EXISTS ops_action_outcomes (
      id TEXT PRIMARY KEY,
      action_id TEXT NOT NULL,
      outcome TEXT NOT NULL,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  tablesEnsured = true;
}

/** GET /focus/adaptive-panel */
app.get('/adaptive-panel', (_req, res) => {
  ensureTables();

  const db = getAccountDb();

  const urgent = db.first(
    `SELECT COUNT(*) as count
     FROM review_queue
     WHERE status = 'pending' AND priority = 'urgent'`,
    [],
  ) as { count: number } | undefined;

  const pending = db.first(
    `SELECT COUNT(*) as count
     FROM review_queue
     WHERE status = 'pending'`,
    [],
  ) as { count: number } | undefined;

  const expiring = db.first(
    `SELECT COUNT(*) as count
     FROM contracts
     WHERE tombstone = 0
       AND cancellation_deadline IS NOT NULL
       AND cancellation_deadline <= date('now', '+30 days')
       AND status NOT IN ('cancelled')`,
    [],
  ) as { count: number } | undefined;

  const suggestedActions = [
    {
      id: 'focus-review-urgent',
      title: 'Clear urgent review queue',
      route: '/review?priority=urgent',
      score: (urgent?.count ?? 0) * 100,
      reason: 'Urgent review items should be resolved first',
    },
    {
      id: 'focus-contract-expiring',
      title: 'Inspect expiring contracts',
      route: '/contracts?filter=expiring',
      score: (expiring?.count ?? 0) * 80,
      reason: 'Expiring contracts require fast follow-up actions',
    },
    {
      id: 'focus-close-routine',
      title: 'Run weekly close routine',
      route: '/ops',
      score: Math.max(10, (pending?.count ?? 0) * 5),
      reason: 'Close routines reduce future manual workload',
    },
  ]
    .filter(action => action.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  res.json({
    status: 'ok',
    data: {
      generated_at: new Date().toISOString(),
      indicators: {
        urgent_review_count: urgent?.count ?? 0,
        pending_review_count: pending?.count ?? 0,
        expiring_contract_count: expiring?.count ?? 0,
      },
      suggested_actions: suggestedActions,
    },
  });
});

/** POST /focus/record-action-outcome */
app.post('/record-action-outcome', (req, res) => {
  ensureTables();

  const { action_id, outcome, notes } = req.body ?? {};

  if (!action_id || typeof action_id !== 'string') {
    res.status(400).json({ status: 'error', reason: 'action-id-required' });
    return;
  }

  if (!outcome || typeof outcome !== 'string') {
    res.status(400).json({ status: 'error', reason: 'outcome-required' });
    return;
  }

  const db = getAccountDb();
  const id = uuidv4();

  db.mutate(
    `INSERT INTO ops_action_outcomes (id, action_id, outcome, notes)
     VALUES (?, ?, ?, ?)`,
    [id, action_id, outcome, notes ?? null],
  );

  const created = db.first(
    'SELECT * FROM ops_action_outcomes WHERE id = ?',
    [id],
  );

  res.status(201).json({ status: 'ok', data: created });
});

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
    CREATE TABLE IF NOT EXISTS ops_playbooks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      commands_json TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ops_playbook_runs (
      id TEXT PRIMARY KEY,
      playbook_id TEXT NOT NULL,
      dry_run INTEGER NOT NULL DEFAULT 1,
      result_json TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (playbook_id) REFERENCES ops_playbooks(id)
    );

    CREATE TABLE IF NOT EXISTS ops_close_runs (
      id TEXT PRIMARY KEY,
      period TEXT NOT NULL,
      summary_json TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  tablesEnsured = true;
}

function intervalToMonthlyDivisor(interval: string | null | undefined): number {
  switch (interval) {
    case 'weekly':
      return 0.230769;
    case 'monthly':
      return 1;
    case 'quarterly':
      return 1 / 3;
    case 'semi-annual':
      return 1 / 6;
    case 'annual':
      return 1 / 12;
    default:
      return 1 / 12;
  }
}

app.get('/money-pulse', (_req, res) => {
  ensureTables();

  const db = getAccountDb();

  const reviewCounts = db.all(
    `SELECT priority, COUNT(*) as count
     FROM review_queue
     WHERE status = 'pending'
     GROUP BY priority`,
    [],
  ) as Array<{ priority: string; count: number }>;

  const urgent = reviewCounts.find(r => r.priority === 'urgent')?.count ?? 0;
  const pending = reviewCounts.reduce((sum, row) => sum + row.count, 0);

  const activeContracts = db.all(
    `SELECT amount, interval
     FROM contracts
     WHERE tombstone = 0 AND status NOT IN ('cancelled')`,
    [],
  ) as Array<{ amount: number | null; interval: string | null }>;

  const monthlyCommitment = Math.round(
    activeContracts.reduce((sum, row) => {
      if (row.amount == null) return sum;
      return sum + row.amount * intervalToMonthlyDivisor(row.interval);
    }, 0),
  );

  const expiringSoon = db.first(
    `SELECT COUNT(*) as count
     FROM contracts
     WHERE tombstone = 0
       AND cancellation_deadline IS NOT NULL
       AND cancellation_deadline <= date('now', '+30 days')
       AND status NOT IN ('cancelled')`,
    [],
  ) as { count: number } | undefined;

  const topActions = [
    urgent > 0
      ? {
        id: 'urgent-reviews',
        title: `${urgent} urgent review item(s)`,
        route: '/review?priority=urgent',
        urgency: 'high',
      }
      : null,
    (expiringSoon?.count ?? 0) > 0
      ? {
        id: 'expiring-contracts',
        title: `${expiringSoon?.count ?? 0} contract(s) expiring soon`,
        route: '/contracts?filter=expiring',
        urgency: 'medium',
      }
      : null,
    {
      id: 'close-week',
      title: 'Run weekly close routine',
      route: '/ops',
      urgency: 'medium',
    },
  ].filter(Boolean);

  res.json({
    status: 'ok',
    data: {
      generated_at: new Date().toISOString(),
      pending_reviews: pending,
      urgent_reviews: urgent,
      active_contracts: activeContracts.length,
      monthly_commitment: monthlyCommitment,
      top_actions: topActions,
    },
  });
});

app.post('/resolve-next-action', (_req, res) => {
  ensureTables();

  const db = getAccountDb();

  const urgent = db.first(
    `SELECT id, type, priority
     FROM review_queue
     WHERE status = 'pending' AND priority = 'urgent'
     ORDER BY created_at ASC
     LIMIT 1`,
    [],
  ) as { id: string; type: string; priority: string } | null;

  if (urgent) {
    res.json({
      status: 'ok',
      data: {
        action_type: 'review',
        title: 'Resolve urgent review item',
        route: `/review?item=${urgent.id}`,
        payload: urgent,
      },
    });
    return;
  }

  const expiring = db.first(
    `SELECT id, name, cancellation_deadline
     FROM contracts
     WHERE tombstone = 0
       AND cancellation_deadline IS NOT NULL
       AND cancellation_deadline <= date('now', '+30 days')
       AND status NOT IN ('cancelled')
     ORDER BY cancellation_deadline ASC
     LIMIT 1`,
    [],
  ) as { id: string; name: string; cancellation_deadline: string } | null;

  if (expiring) {
    res.json({
      status: 'ok',
      data: {
        action_type: 'contract',
        title: `Check expiring contract: ${expiring.name}`,
        route: `/contracts/${expiring.id}`,
        payload: expiring,
      },
    });
    return;
  }

  res.json({
    status: 'ok',
    data: {
      action_type: 'none',
      title: 'No urgent actions. Consider running weekly close.',
      route: '/ops',
      payload: null,
    },
  });
});

app.get('/playbooks', (_req, res) => {
  ensureTables();

  const db = getAccountDb();
  const rows = db.all(
    `SELECT * FROM ops_playbooks ORDER BY updated_at DESC`,
    [],
  ) as Array<Record<string, unknown>>;

  res.json({
    status: 'ok',
    data: rows.map(row => ({
      ...row,
      commands: JSON.parse(String(row.commands_json || '[]')),
      commands_json: undefined,
    })),
  });
});

app.post('/playbooks', (req, res) => {
  ensureTables();

  const { name, description, commands } = req.body ?? {};
  if (!name || typeof name !== 'string') {
    res.status(400).json({ status: 'error', reason: 'name-required' });
    return;
  }
  if (!Array.isArray(commands)) {
    res.status(400).json({ status: 'error', reason: 'commands-required' });
    return;
  }

  const db = getAccountDb();
  const id = uuidv4();

  db.mutate(
    `INSERT INTO ops_playbooks
      (id, name, description, commands_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
    [id, name, description ?? null, JSON.stringify(commands)],
  );

  const created = db.first('SELECT * FROM ops_playbooks WHERE id = ?', [id]) as Record<string, unknown>;

  res.status(201).json({
    status: 'ok',
    data: {
      ...created,
      commands,
      commands_json: undefined,
    },
  });
});

app.post('/playbooks/:id/run', (req, res) => {
  ensureTables();

  const dryRun = req.body?.dry_run !== false;

  const db = getAccountDb();
  const playbook = db.first(
    'SELECT * FROM ops_playbooks WHERE id = ?',
    [req.params.id],
  ) as Record<string, unknown> | undefined;

  if (!playbook) {
    res.status(404).json({ status: 'error', reason: 'not-found' });
    return;
  }

  const commands = JSON.parse(String(playbook.commands_json || '[]')) as Array<Record<string, unknown>>;
  const result = {
    playbook_id: req.params.id,
    dry_run: dryRun,
    executed: commands.length,
    steps: commands.map((command, index) => ({
      index,
      command,
      status: 'queued',
      reversible: true,
    })),
  };

  const runId = uuidv4();
  db.mutate(
    `INSERT INTO ops_playbook_runs (id, playbook_id, dry_run, result_json)
     VALUES (?, ?, ?, ?)`,
    [runId, req.params.id, dryRun ? 1 : 0, JSON.stringify(result)],
  );

  res.json({ status: 'ok', data: { run_id: runId, ...result } });
});

app.post('/run-close-routine', (req, res) => {
  ensureTables();

  const period = req.body?.period;
  if (period !== 'weekly' && period !== 'monthly') {
    res.status(400).json({ status: 'error', reason: 'invalid-period' });
    return;
  }

  const db = getAccountDb();

  const pendingReview = db.first(
    `SELECT COUNT(*) as count FROM review_queue WHERE status = 'pending'`,
    [],
  ) as { count: number } | undefined;

  const expiring = db.first(
    `SELECT COUNT(*) as count FROM contracts
     WHERE tombstone = 0
       AND cancellation_deadline IS NOT NULL
       AND cancellation_deadline <= date('now', '+30 days')
       AND status NOT IN ('cancelled')`,
    [],
  ) as { count: number } | undefined;

  const summary = {
    period,
    generated_at: new Date().toISOString(),
    exception_count: (pendingReview?.count ?? 0) + (expiring?.count ?? 0),
    exceptions: [
      { type: 'review_queue', count: pendingReview?.count ?? 0 },
      { type: 'expiring_contracts', count: expiring?.count ?? 0 },
    ],
  };

  const runId = uuidv4();
  db.mutate(
    `INSERT INTO ops_close_runs (id, period, summary_json)
     VALUES (?, ?, ?)`,
    [runId, period, JSON.stringify(summary)],
  );

  res.json({ status: 'ok', data: { run_id: runId, ...summary } });
});

app.post('/apply-batch-policy', (req, res) => {
  ensureTables();

  const { ids, status, resolved_action } = req.body ?? {};

  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ status: 'error', reason: 'ids-required' });
    return;
  }

  if (!['accepted', 'rejected', 'dismissed', 'snoozed'].includes(status)) {
    res.status(400).json({ status: 'error', reason: 'invalid-status' });
    return;
  }

  const db = getAccountDb();
  const placeholders = ids.map(() => '?').join(',');

  db.mutate(
    `UPDATE review_queue SET
       status = ?,
       resolved_action = ?,
       resolved_at = CASE WHEN ? IN ('accepted','rejected','dismissed') THEN datetime('now') ELSE NULL END,
       updated_at = datetime('now')
     WHERE id IN (${placeholders}) AND status = 'pending'`,
    [status, resolved_action ?? 'batch-policy', status, ...ids],
  );

  res.json({
    status: 'ok',
    data: {
      updated: ids.length,
      status,
    },
  });
});

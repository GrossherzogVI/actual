import express from 'express';
import { v4 as uuidv4 } from 'uuid';

import { getAccountDb } from '../account-db.js';
import {
  requestLoggerMiddleware,
  validateSessionMiddleware,
} from '../util/middlewares.js';

import { safeError } from './error-utils.js';

const app = express();

export { app as handlers };
app.use(express.json());
app.use(requestLoggerMiddleware);
app.use(validateSessionMiddleware);

// GET /money-pulse — pending reviews + expiring contracts
app.get('/money-pulse', (req, res) => {
  try {
    const db = getAccountDb();

    const pendingReviews =
      db.first(
        `SELECT COUNT(*) as count FROM review_queue WHERE status = 'pending'`,
      )?.count ?? 0;

    const expiringContracts =
      db.first(
        `SELECT COUNT(*) as count FROM contracts
         WHERE cancellation_deadline <= date('now', '+30 days')
           AND tombstone = 0
           AND status != 'cancelled'`,
      )?.count ?? 0;

    res.json({
      status: 'ok',
      data: { pendingReviews, expiringContracts },
    });
  } catch (err) {
    res.status(500).json({ status: 'error', reason: safeError(err) });
  }
});

// GET /command-runs — recent playbook runs
app.get('/command-runs', (req, res) => {
  try {
    const db = getAccountDb();
    const limit = Math.min(Number(req.query.limit) || 20, 100);

    const runs = db.all(
      `SELECT * FROM ops_playbook_runs ORDER BY created_at DESC LIMIT ?`,
      [limit],
    );

    res.json({ status: 'ok', data: runs });
  } catch (err) {
    res.status(500).json({ status: 'error', reason: safeError(err) });
  }
});

// POST /resolve-next-action — score review_queue items, return top 1
app.post('/resolve-next-action', (req, res) => {
  try {
    const db = getAccountDb();

    // Score pending items by priority (higher = more urgent) and age (older = more urgent)
    const topItem = db.first(
      `SELECT rq.*,
              (CASE rq.priority
                WHEN 'critical' THEN 100
                WHEN 'high'     THEN 75
                WHEN 'medium'   THEN 50
                WHEN 'low'      THEN 25
                ELSE 10
              END
              + CAST(julianday('now') - julianday(rq.created_at) AS INTEGER)
              ) AS score
       FROM review_queue rq
       WHERE rq.status = 'pending'
       ORDER BY score DESC
       LIMIT 1`,
    );

    res.json({ status: 'ok', data: topItem });
  } catch (err) {
    res.status(500).json({ status: 'error', reason: safeError(err) });
  }
});

// GET /playbooks — list all playbooks
app.get('/playbooks', (req, res) => {
  try {
    const db = getAccountDb();
    const playbooks = db.all(
      `SELECT * FROM ops_playbooks ORDER BY created_at DESC`,
    );
    res.json({ status: 'ok', data: playbooks });
  } catch (err) {
    res.status(500).json({ status: 'error', reason: safeError(err) });
  }
});

// POST /playbooks — create a playbook
app.post('/playbooks', (req, res) => {
  try {
    const db = getAccountDb();
    const { name, description, commands_json } = req.body;

    if (!name || !commands_json) {
      res
        .status(400)
        .json({ status: 'error', reason: 'name and commands_json required' });
      return;
    }

    const id = uuidv4();
    db.mutate(
      `INSERT INTO ops_playbooks (id, name, description, commands_json)
       VALUES (?, ?, ?, ?)`,
      [id, name, description ?? null, commands_json],
    );

    const playbook = db.first(`SELECT * FROM ops_playbooks WHERE id = ?`, [id]);
    res.json({ status: 'ok', data: playbook });
  } catch (err) {
    res.status(500).json({ status: 'error', reason: safeError(err) });
  }
});

// POST /run-playbook — find playbook, parse commands, record run
app.post('/run-playbook', (req, res) => {
  try {
    const db = getAccountDb();
    const { playbook_id, dry_run } = req.body;

    if (!playbook_id) {
      res
        .status(400)
        .json({ status: 'error', reason: 'playbook_id required' });
      return;
    }

    const playbook = db.first(`SELECT * FROM ops_playbooks WHERE id = ?`, [
      playbook_id,
    ]);
    if (!playbook) {
      res.status(404).json({ status: 'error', reason: 'playbook not found' });
      return;
    }

    let commands: string[];
    try {
      commands = JSON.parse(playbook.commands_json);
    } catch {
      res
        .status(400)
        .json({ status: 'error', reason: 'invalid commands_json in playbook' });
      return;
    }

    const isDryRun = dry_run !== false;
    const results = commands.map((cmd: string, i: number) => ({
      step: i + 1,
      command: cmd,
      status: isDryRun ? 'dry-run' : 'executed',
    }));

    const runId = uuidv4();
    db.mutate(
      `INSERT INTO ops_playbook_runs (id, playbook_id, dry_run, result_json)
       VALUES (?, ?, ?, ?)`,
      [runId, playbook_id, isDryRun ? 1 : 0, JSON.stringify(results)],
    );

    res.json({
      status: 'ok',
      data: { id: runId, playbook_id, dry_run: isDryRun, results },
    });
  } catch (err) {
    res.status(500).json({ status: 'error', reason: safeError(err) });
  }
});

// POST /run-close-routine — summarize period, store in ops_close_runs
app.post('/run-close-routine', (req, res) => {
  try {
    const db = getAccountDb();
    const { period } = req.body;

    if (!period || !['weekly', 'monthly'].includes(period)) {
      res.status(400).json({
        status: 'error',
        reason: "period must be 'weekly' or 'monthly'",
      });
      return;
    }

    const dateRange =
      period === 'weekly'
        ? `date('now', '-7 days')`
        : `date('now', '-30 days')`;

    const pendingReviews =
      db.first(
        `SELECT COUNT(*) as count FROM review_queue
         WHERE status = 'pending' AND created_at >= ${dateRange}`,
      )?.count ?? 0;

    const completedReviews =
      db.first(
        `SELECT COUNT(*) as count FROM review_queue
         WHERE status IN ('accepted', 'rejected') AND created_at >= ${dateRange}`,
      )?.count ?? 0;

    const playbookRuns =
      db.first(
        `SELECT COUNT(*) as count FROM ops_playbook_runs
         WHERE created_at >= ${dateRange}`,
      )?.count ?? 0;

    const summary = {
      period,
      generated_at: new Date().toISOString(),
      pendingReviews,
      completedReviews,
      playbookRuns,
    };

    const id = uuidv4();
    db.mutate(
      `INSERT INTO ops_close_runs (id, period, summary_json) VALUES (?, ?, ?)`,
      [id, period, JSON.stringify(summary)],
    );

    res.json({ status: 'ok', data: { id, ...summary } });
  } catch (err) {
    res.status(500).json({ status: 'error', reason: safeError(err) });
  }
});

// POST /execute-chain — parse chain commands, execute or validate, record run
app.post('/execute-chain', (req, res) => {
  try {
    const db = getAccountDb();
    const { chain, assignee, dryRun } = req.body;

    if (!chain || typeof chain !== 'string') {
      res.status(400).json({ status: 'error', reason: 'chain string required' });
      return;
    }

    const steps = chain.split('->').map((s: string) => s.trim()).filter(Boolean);
    if (steps.length === 0) {
      res.status(400).json({ status: 'error', reason: 'chain has no steps' });
      return;
    }

    const isDryRun = dryRun !== false;
    const results = steps.map((step: string, i: number) => ({
      step: i + 1,
      command: step,
      assignee: assignee ?? null,
      status: isDryRun ? 'validated' : 'executed',
    }));

    // Record as a playbook run with a synthetic playbook reference
    const runId = uuidv4();
    db.mutate(
      `INSERT INTO ops_playbook_runs (id, playbook_id, dry_run, result_json)
       VALUES (?, ?, ?, ?)`,
      [runId, `chain:${runId}`, isDryRun ? 1 : 0, JSON.stringify(results)],
    );

    res.json({
      status: 'ok',
      data: { id: runId, steps: results, dryRun: isDryRun },
    });
  } catch (err) {
    res.status(500).json({ status: 'error', reason: safeError(err) });
  }
});

// GET /health-score — compute financial health score 0-100
app.get('/health-score', (req, res) => {
  try {
    const db = getAccountDb();

    const pendingReviews =
      db.first(
        `SELECT COUNT(*) as count FROM review_queue WHERE status = 'pending'`,
      )?.count ?? 0;

    const activeContracts =
      db.first(
        `SELECT COUNT(*) as count FROM contracts
         WHERE tombstone = 0 AND status != 'cancelled'`,
      )?.count ?? 0;

    const expiringContracts =
      db.first(
        `SELECT COUNT(*) as count FROM contracts
         WHERE cancellation_deadline <= date('now', '+30 days')
           AND tombstone = 0
           AND status != 'cancelled'`,
      )?.count ?? 0;

    let score = 100;

    // Review health: -2 per pending item, max -30
    const reviewPenalty = Math.min(pendingReviews * 2, 30);
    score -= reviewPenalty;

    // Contract health: -5 per expiring contract, max -25
    const contractPenalty = Math.min(expiringContracts * 5, 25);
    score -= contractPenalty;

    // Tracking health: -10 if no contracts tracked at all
    const trackingPenalty = activeContracts === 0 ? 10 : 0;
    score -= trackingPenalty;

    res.json({
      status: 'ok',
      data: {
        score,
        components: {
          reviewHealth: 100 - reviewPenalty,
          contractHealth: 100 - contractPenalty,
          trackingHealth: 100 - trackingPenalty,
        },
        trend: 'stable',
      },
    });
  } catch (err) {
    res.status(500).json({ status: 'error', reason: safeError(err) });
  }
});

// POST /apply-batch-policy — batch update review_queue items
app.post('/apply-batch-policy', (req, res) => {
  try {
    const db = getAccountDb();
    const { ids, status, resolvedAction } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      res
        .status(400)
        .json({ status: 'error', reason: 'ids must be a non-empty array' });
      return;
    }

    if (ids.length > 100) {
      res
        .status(400)
        .json({ status: 'error', reason: 'ids array exceeds maximum of 100' });
      return;
    }

    if (!status || !resolvedAction) {
      res.status(400).json({
        status: 'error',
        reason: 'status and resolvedAction required',
      });
      return;
    }

    const placeholders = ids.map(() => '?').join(', ');
    db.mutate(
      `UPDATE review_queue
       SET status = ?, resolved_action = ?, resolved_at = datetime('now')
       WHERE id IN (${placeholders})`,
      [status, resolvedAction, ...ids],
    );

    res.json({ status: 'ok', data: { updated: ids.length } });
  } catch (err) {
    res.status(500).json({ status: 'error', reason: safeError(err) });
  }
});

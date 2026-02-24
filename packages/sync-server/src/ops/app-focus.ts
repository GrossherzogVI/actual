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

// GET /adaptive-panel — ranked actions from review_queue + expiring contracts
app.get('/adaptive-panel', (req, res) => {
  try {
    const db = getAccountDb();

    // Pending review items scored by priority + age
    const reviewActions = db.all(
      `SELECT
         id,
         type AS title,
         'review' AS source,
         priority,
         created_at,
         (CASE priority
           WHEN 'critical' THEN 100
           WHEN 'high'     THEN 75
           WHEN 'medium'   THEN 50
           WHEN 'low'      THEN 25
           ELSE 10
         END
         + CAST(julianday('now') - julianday(created_at) AS INTEGER)
         ) AS score
       FROM review_queue
       WHERE status = 'pending'
       ORDER BY score DESC
       LIMIT 5`,
    );

    // Contracts with upcoming deadlines scored by proximity
    const contractActions = db.all(
      `SELECT
         id,
         name AS title,
         'contract' AS source,
         cancellation_deadline,
         (100 - CAST(julianday(cancellation_deadline) - julianday('now') AS INTEGER)) AS score
       FROM contracts
       WHERE cancellation_deadline <= date('now', '+30 days')
         AND tombstone = 0
         AND status != 'cancelled'
       ORDER BY score DESC
       LIMIT 5`,
    );

    // Merge and sort by score, take top 5
    type ScoredAction = {
      id: string;
      title: string;
      route: string;
      score: number;
      reason: string;
    };

    const actions: ScoredAction[] = [
      ...reviewActions.map(
        (r: { id: string; title: string; score: number; priority: string }) => ({
          id: r.id,
          title: r.title,
          route: `/review`,
          score: r.score,
          reason: `Review item (${r.priority} priority)`,
        }),
      ),
      ...contractActions.map(
        (c: {
          id: string;
          title: string;
          score: number;
          cancellation_deadline: string;
        }) => ({
          id: c.id,
          title: c.title,
          route: `/contracts/${c.id}`,
          score: c.score,
          reason: `Cancellation deadline: ${c.cancellation_deadline}`,
        }),
      ),
    ]
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    res.json({ status: 'ok', data: actions });
  } catch (err) {
    res.status(500).json({ status: 'error', reason: safeError(err, 'focus') });
  }
});

// POST /record-action-outcome — INSERT into ops_action_outcomes
app.post('/record-action-outcome', (req, res) => {
  try {
    const db = getAccountDb();
    const { action_id, outcome, notes } = req.body;

    if (!action_id || !outcome) {
      res
        .status(400)
        .json({ status: 'error', reason: 'action_id and outcome required' });
      return;
    }

    const id = uuidv4();
    db.mutate(
      `INSERT INTO ops_action_outcomes (id, action_id, outcome, notes)
       VALUES (?, ?, ?, ?)`,
      [id, action_id, outcome, notes ?? null],
    );

    res.json({ status: 'ok', data: { id, action_id, outcome, notes } });
  } catch (err) {
    res.status(500).json({ status: 'error', reason: safeError(err, 'focus') });
  }
});

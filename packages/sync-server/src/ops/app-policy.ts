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

// GET / — get current policy settings (default row)
app.get('/', (req, res) => {
  try {
    const db = getAccountDb();
    const policy = db.first(`SELECT * FROM policy_egress WHERE id = 'default'`);
    res.json({ status: 'ok', data: policy });
  } catch (err) {
    res.status(500).json({ status: 'error', reason: safeError(err, 'policy') });
  }
});

// PATCH / — update policy settings
app.patch('/', (req, res) => {
  try {
    const db = getAccountDb();

    const allowedFields = [
      'allow_cloud',
      'allowed_providers_json',
      'redaction_mode',
    ];

    const updates: string[] = [];
    const values: (string | number | null)[] = [];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(req.body[field]);
      }
    }

    if (updates.length === 0) {
      res.status(400).json({ status: 'error', reason: 'no fields to update' });
      return;
    }

    updates.push(`updated_at = datetime('now')`);
    values.push('default');

    db.mutate(
      `UPDATE policy_egress SET ${updates.join(', ')} WHERE id = ?`,
      values,
    );

    const policy = db.first(`SELECT * FROM policy_egress WHERE id = 'default'`);
    res.json({ status: 'ok', data: policy });
  } catch (err) {
    res.status(500).json({ status: 'error', reason: safeError(err, 'policy') });
  }
});

// GET /audit — list audit trail
app.get('/audit', (req, res) => {
  try {
    const db = getAccountDb();
    const limit = Math.min(Number(req.query.limit) || 50, 200);

    const entries = db.all(
      `SELECT * FROM policy_egress_audit ORDER BY created_at DESC LIMIT ?`,
      [limit],
    );
    res.json({ status: 'ok', data: entries });
  } catch (err) {
    res.status(500).json({ status: 'error', reason: safeError(err, 'policy') });
  }
});

// POST /audit — create audit entry
app.post('/audit', (req, res) => {
  try {
    const db = getAccountDb();
    const { event_type, provider, payload_json } = req.body;

    if (!event_type) {
      res
        .status(400)
        .json({ status: 'error', reason: 'event_type required' });
      return;
    }

    const id = uuidv4();
    db.mutate(
      `INSERT INTO policy_egress_audit (id, event_type, provider, payload_json)
       VALUES (?, ?, ?, ?)`,
      [id, event_type, provider ?? null, payload_json ?? null],
    );

    const entry = db.first(
      `SELECT * FROM policy_egress_audit WHERE id = ?`,
      [id],
    );
    res.json({ status: 'ok', data: entry });
  } catch (err) {
    res.status(500).json({ status: 'error', reason: safeError(err, 'policy') });
  }
});

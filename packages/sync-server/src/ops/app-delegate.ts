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

// GET /lanes — list all delegate lanes
app.get('/lanes', (req, res) => {
  try {
    const db = getAccountDb();
    const lanes = db.all(
      `SELECT * FROM delegate_lanes ORDER BY created_at DESC`,
    );
    res.json({ status: 'ok', data: lanes });
  } catch (err) {
    res.status(500).json({ status: 'error', reason: safeError(err, 'delegate') });
  }
});

// POST /lanes — create a delegate lane
app.post('/lanes', (req, res) => {
  try {
    const db = getAccountDb();
    const { title, assignee, assigned_by, status, payload_json } = req.body;

    if (!title) {
      res.status(400).json({ status: 'error', reason: 'title required' });
      return;
    }

    const id = uuidv4();
    db.mutate(
      `INSERT INTO delegate_lanes (id, title, assignee, assigned_by, status, payload_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        id,
        title,
        assignee ?? null,
        assigned_by ?? null,
        status ?? 'assigned',
        payload_json ?? null,
      ],
    );

    const lane = db.first(`SELECT * FROM delegate_lanes WHERE id = ?`, [id]);
    res.json({ status: 'ok', data: lane });
  } catch (err) {
    res.status(500).json({ status: 'error', reason: safeError(err, 'delegate') });
  }
});

// PATCH /lanes/:id — update lane fields
app.patch('/lanes/:id', (req, res) => {
  try {
    const db = getAccountDb();
    const { id } = req.params;

    const existing = db.first(`SELECT * FROM delegate_lanes WHERE id = ?`, [
      id,
    ]);
    if (!existing) {
      res.status(404).json({ status: 'error', reason: 'lane not found' });
      return;
    }

    const allowedFields = [
      'title',
      'status',
      'assignee',
      'assigned_by',
      'payload_json',
      'accepted_at',
      'completed_at',
      'rejected_at',
    ];

    const updates: string[] = [];
    const values: (string | null)[] = [];

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
    values.push(id);

    db.mutate(
      `UPDATE delegate_lanes SET ${updates.join(', ')} WHERE id = ?`,
      values,
    );

    const lane = db.first(`SELECT * FROM delegate_lanes WHERE id = ?`, [id]);
    res.json({ status: 'ok', data: lane });
  } catch (err) {
    res.status(500).json({ status: 'error', reason: safeError(err, 'delegate') });
  }
});

// DELETE /lanes/:id — delete a lane
app.delete('/lanes/:id', (req, res) => {
  try {
    const db = getAccountDb();
    const { id } = req.params;

    const existing = db.first(`SELECT * FROM delegate_lanes WHERE id = ?`, [
      id,
    ]);
    if (!existing) {
      res.status(404).json({ status: 'error', reason: 'lane not found' });
      return;
    }

    db.mutate(`DELETE FROM delegate_lanes WHERE id = ?`, [id]);
    res.json({ status: 'ok', data: {} });
  } catch (err) {
    res.status(500).json({ status: 'error', reason: safeError(err, 'delegate') });
  }
});

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

// GET /branches — list scenario branches
app.get('/branches', (req, res) => {
  try {
    const db = getAccountDb();
    const branches = db.all(
      `SELECT * FROM scenario_branches ORDER BY created_at DESC`,
    );
    res.json({ status: 'ok', data: branches });
  } catch (err) {
    res.status(500).json({ status: 'error', reason: safeError(err, 'scenario') });
  }
});

// POST /branches — create a scenario branch
app.post('/branches', (req, res) => {
  try {
    const db = getAccountDb();
    const { name, base_date, notes } = req.body;

    if (!name) {
      res.status(400).json({ status: 'error', reason: 'name required' });
      return;
    }

    const id = uuidv4();
    db.mutate(
      `INSERT INTO scenario_branches (id, name, base_date, notes)
       VALUES (?, ?, ?, ?)`,
      [id, name, base_date ?? null, notes ?? null],
    );

    const branch = db.first(`SELECT * FROM scenario_branches WHERE id = ?`, [
      id,
    ]);
    res.json({ status: 'ok', data: branch });
  } catch (err) {
    res.status(500).json({ status: 'error', reason: safeError(err, 'scenario') });
  }
});

// GET /branches/:id/mutations — list mutations for a branch
app.get('/branches/:id/mutations', (req, res) => {
  try {
    const db = getAccountDb();
    const { id } = req.params;

    const branch = db.first(`SELECT id FROM scenario_branches WHERE id = ?`, [
      id,
    ]);
    if (!branch) {
      res.status(404).json({ status: 'error', reason: 'branch not found' });
      return;
    }

    const mutations = db.all(
      `SELECT * FROM scenario_mutations WHERE branch_id = ? ORDER BY created_at ASC`,
      [id],
    );
    res.json({ status: 'ok', data: mutations });
  } catch (err) {
    res.status(500).json({ status: 'error', reason: safeError(err, 'scenario') });
  }
});

// POST /branches/:id/mutations — create a mutation
app.post('/branches/:id/mutations', (req, res) => {
  try {
    const db = getAccountDb();
    const { id: branchId } = req.params;
    const { kind, payload_json } = req.body;

    const branch = db.first(`SELECT id FROM scenario_branches WHERE id = ?`, [
      branchId,
    ]);
    if (!branch) {
      res.status(404).json({ status: 'error', reason: 'branch not found' });
      return;
    }

    if (!kind || !payload_json) {
      res
        .status(400)
        .json({ status: 'error', reason: 'kind and payload_json required' });
      return;
    }

    const id = uuidv4();
    db.mutate(
      `INSERT INTO scenario_mutations (id, branch_id, kind, payload_json)
       VALUES (?, ?, ?, ?)`,
      [id, branchId, kind, payload_json],
    );

    const mutation = db.first(
      `SELECT * FROM scenario_mutations WHERE id = ?`,
      [id],
    );
    res.json({ status: 'ok', data: mutation });
  } catch (err) {
    res.status(500).json({ status: 'error', reason: safeError(err, 'scenario') });
  }
});

// DELETE /branches/:id — delete branch + cascade delete mutations
app.delete('/branches/:id', (req, res) => {
  try {
    const db = getAccountDb();
    const { id } = req.params;

    const branch = db.first(`SELECT id FROM scenario_branches WHERE id = ?`, [
      id,
    ]);
    if (!branch) {
      res.status(404).json({ status: 'error', reason: 'branch not found' });
      return;
    }

    db.transaction(() => {
      db.mutate(`DELETE FROM scenario_mutations WHERE branch_id = ?`, [id]);
      db.mutate(`DELETE FROM scenario_branches WHERE id = ?`, [id]);
    });

    res.json({ status: 'ok', data: {} });
  } catch (err) {
    res.status(500).json({ status: 'error', reason: safeError(err, 'scenario') });
  }
});

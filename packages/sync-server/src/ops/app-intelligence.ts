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

// GET /corrections — list all corrections
app.get('/corrections', (req, res) => {
  try {
    const db = getAccountDb();
    const limit = Math.min(Number(req.query.limit) || 50, 200);

    const corrections = db.all(
      `SELECT * FROM intelligence_corrections ORDER BY created_at DESC LIMIT ?`,
      [limit],
    );
    res.json({ status: 'ok', data: corrections });
  } catch (err) {
    res.status(500).json({ status: 'error', reason: String(err) });
  }
});

// POST /corrections — create a correction entry
app.post('/corrections', (req, res) => {
  try {
    const db = getAccountDb();
    const { input_json, correct_output_json } = req.body;

    if (!input_json || !correct_output_json) {
      res.status(400).json({
        status: 'error',
        reason: 'input_json and correct_output_json required',
      });
      return;
    }

    const id = uuidv4();
    db.mutate(
      `INSERT INTO intelligence_corrections (id, input_json, correct_output_json)
       VALUES (?, ?, ?)`,
      [id, input_json, correct_output_json],
    );

    const correction = db.first(
      `SELECT * FROM intelligence_corrections WHERE id = ?`,
      [id],
    );
    res.json({ status: 'ok', data: correction });
  } catch (err) {
    res.status(500).json({ status: 'error', reason: String(err) });
  }
});

// GET /stats — count corrections by type (parsed from input_json)
app.get('/stats', (req, res) => {
  try {
    const db = getAccountDb();

    const total =
      db.first(`SELECT COUNT(*) as count FROM intelligence_corrections`)
        ?.count ?? 0;

    // Group by the "type" field inside input_json if present
    const corrections = db.all(
      `SELECT input_json FROM intelligence_corrections`,
    );

    const byType: Record<string, number> = {};
    for (const row of corrections) {
      try {
        const parsed = JSON.parse(row.input_json);
        const type = parsed.type ?? 'unknown';
        byType[type] = (byType[type] ?? 0) + 1;
      } catch {
        byType['unparseable'] = (byType['unparseable'] ?? 0) + 1;
      }
    }

    res.json({ status: 'ok', data: { total, byType } });
  } catch (err) {
    res.status(500).json({ status: 'error', reason: String(err) });
  }
});

// POST /classify-feedback — record classification feedback
app.post('/classify-feedback', (req, res) => {
  try {
    const db = getAccountDb();
    const { input_json, correct_output_json } = req.body;

    if (!input_json || !correct_output_json) {
      res.status(400).json({
        status: 'error',
        reason: 'input_json and correct_output_json required',
      });
      return;
    }

    const id = uuidv4();
    db.mutate(
      `INSERT INTO intelligence_corrections (id, input_json, correct_output_json)
       VALUES (?, ?, ?)`,
      [id, input_json, correct_output_json],
    );

    res.json({ status: 'ok', data: { id } });
  } catch (err) {
    res.status(500).json({ status: 'error', reason: String(err) });
  }
});

// DELETE /corrections/:id — delete a correction
app.delete('/corrections/:id', (req, res) => {
  try {
    const db = getAccountDb();
    const { id } = req.params;

    const existing = db.first(
      `SELECT id FROM intelligence_corrections WHERE id = ?`,
      [id],
    );
    if (!existing) {
      res
        .status(404)
        .json({ status: 'error', reason: 'correction not found' });
      return;
    }

    db.mutate(`DELETE FROM intelligence_corrections WHERE id = ?`, [id]);
    res.json({ status: 'ok', data: {} });
  } catch (err) {
    res.status(500).json({ status: 'error', reason: String(err) });
  }
});

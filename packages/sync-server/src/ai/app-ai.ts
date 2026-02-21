import express from 'express';
import { v4 as uuidv4 } from 'uuid';

import { getAccountDb } from '../account-db.js';
import {
  requestLoggerMiddleware,
  validateSessionMiddleware,
} from '../util/middlewares.js';

import { classifyBatch, classifyTransaction } from './classifier.js';
import { isOllamaEnabled } from './ollama-client.js';

const app = express();

export { app as handlers };
app.use(express.json());
app.use(requestLoggerMiddleware);
app.use(validateSessionMiddleware);

function logAudit(fileId: string, action: string, details: unknown) {
  const db = getAccountDb();
  db.mutate(
    `INSERT INTO ai_audit_log (file_id, action, details, created_at)
     VALUES (?, ?, ?, datetime('now'))`,
    [fileId, action, JSON.stringify(details)],
  );
}

function upsertRuleSuggestion(
  fileId: string,
  payeePattern: string,
  matchField: string,
  matchOp: string,
  categoryId: string,
) {
  const db = getAccountDb();
  const existing = db.first(
    `SELECT * FROM ai_rule_suggestions
     WHERE file_id = ? AND payee_pattern = ? AND match_field = ? AND match_op = ? AND category = ?`,
    [fileId, payeePattern, matchField, matchOp, categoryId],
  );

  if (existing) {
    db.mutate(
      `UPDATE ai_rule_suggestions SET hit_count = hit_count + 1 WHERE id = ?`,
      [existing.id],
    );
    return existing.id;
  }

  const id = uuidv4();
  db.mutate(
    `INSERT INTO ai_rule_suggestions (id, file_id, payee_pattern, match_field, match_op, category, hit_count, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, 'pending', datetime('now'))`,
    [id, fileId, payeePattern, matchField, matchOp, categoryId],
  );
  return id;
}

/** POST /classify — classify a single transaction */
app.post('/classify', async (req, res) => {
  if (!isOllamaEnabled()) {
    res.status(503).json({ status: 'error', reason: 'ai-not-enabled' });
    return;
  }

  const { transaction, categories, fileId } = req.body || {};

  if (!transaction || !categories || !fileId) {
    res.status(400).json({ status: 'error', reason: 'missing-fields' });
    return;
  }

  try {
    const result = await classifyTransaction(transaction, categories);

    const db = getAccountDb();
    const id = uuidv4();
    const status =
      result.confidence > 0.9
        ? 'auto_applied'
        : result.confidence >= 0.7
          ? 'pending'
          : 'pending';

    db.mutate(
      `INSERT OR REPLACE INTO ai_classifications (id, file_id, transaction_id, proposed_category, confidence, reasoning, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        id,
        fileId,
        result.transactionId,
        result.categoryId,
        result.confidence,
        result.reasoning,
        status,
      ],
    );

    logAudit(fileId, 'classify', {
      transactionId: result.transactionId,
      categoryId: result.categoryId,
      confidence: result.confidence,
      status,
    });

    if (result.ruleSuggestion) {
      upsertRuleSuggestion(
        fileId,
        result.ruleSuggestion.payeePattern,
        result.ruleSuggestion.matchField,
        result.ruleSuggestion.matchOp,
        result.categoryId,
      );
    }

    res.json({ status: 'ok', data: result });
  } catch (err) {
    res
      .status(500)
      .json({ status: 'error', reason: (err as Error).message });
  }
});

/** POST /classify-batch — classify multiple transactions */
app.post('/classify-batch', async (req, res) => {
  if (!isOllamaEnabled()) {
    res.status(503).json({ status: 'error', reason: 'ai-not-enabled' });
    return;
  }

  const { transactions, categories, fileId } = req.body || {};

  if (!transactions?.length || !categories || !fileId) {
    res.status(400).json({ status: 'error', reason: 'missing-fields' });
    return;
  }

  try {
    const results = await classifyBatch(transactions, categories, fileId);

    const db = getAccountDb();
    let autoApplied = 0;
    let pendingReview = 0;
    let skipped = 0;

    for (const result of results) {
      let status: string;
      if (result.confidence > 0.9) {
        status = 'auto_applied';
        autoApplied++;
      } else if (result.confidence >= 0.7) {
        status = 'pending';
        pendingReview++;
      } else {
        status = 'pending';
        skipped++;
        logAudit(fileId, 'classify-skipped', {
          transactionId: result.transactionId,
          confidence: result.confidence,
        });
        continue;
      }

      const id = uuidv4();
      db.mutate(
        `INSERT OR REPLACE INTO ai_classifications (id, file_id, transaction_id, proposed_category, confidence, reasoning, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [
          id,
          fileId,
          result.transactionId,
          result.categoryId,
          result.confidence,
          result.reasoning,
          status,
        ],
      );

      if (result.ruleSuggestion) {
        upsertRuleSuggestion(
          fileId,
          result.ruleSuggestion.payeePattern,
          result.ruleSuggestion.matchField,
          result.ruleSuggestion.matchOp,
          result.categoryId,
        );
      }
    }

    logAudit(fileId, 'classify-batch', {
      total: results.length,
      autoApplied,
      pendingReview,
      skipped,
    });

    res.json({
      status: 'ok',
      data: {
        results,
        autoApplied,
        pendingReview,
        skipped,
      },
    });
  } catch (err) {
    res
      .status(500)
      .json({ status: 'error', reason: (err as Error).message });
  }
});

/** GET /queue — list pending classifications */
app.get('/queue', (req, res) => {
  const { fileId, limit } = req.query;

  if (!fileId) {
    res.status(400).json({ status: 'error', reason: 'file-id-required' });
    return;
  }

  const db = getAccountDb();
  const rows = db.all(
    `SELECT * FROM ai_classifications
     WHERE file_id = ? AND status = 'pending'
     ORDER BY created_at DESC
     LIMIT ?`,
    [fileId, parseInt(String(limit), 10) || 50],
  );

  res.json({ status: 'ok', data: rows });
});

/** POST /queue/:id/resolve — accept or reject a classification */
app.post('/queue/:id/resolve', (req, res) => {
  const { status: newStatus } = req.body || {};

  if (!newStatus || !['accepted', 'rejected'].includes(newStatus)) {
    res.status(400).json({ status: 'error', reason: 'invalid-status' });
    return;
  }

  const db = getAccountDb();
  const existing = db.first(
    'SELECT * FROM ai_classifications WHERE id = ?',
    [req.params.id],
  );

  if (!existing) {
    res.status(404).json({ status: 'error', reason: 'not-found' });
    return;
  }

  db.mutate(
    `UPDATE ai_classifications SET status = ?, resolved_at = datetime('now') WHERE id = ?`,
    [newStatus, req.params.id],
  );

  logAudit(existing.file_id, 'queue-resolve', {
    classificationId: req.params.id,
    previousStatus: existing.status,
    newStatus,
  });

  const updated = db.first(
    'SELECT * FROM ai_classifications WHERE id = ?',
    [req.params.id],
  );

  res.json({ status: 'ok', data: updated });
});

/** GET /rule-suggestions — list rule suggestions */
app.get('/rule-suggestions', (req, res) => {
  const { fileId, minHitCount } = req.query;

  if (!fileId) {
    res.status(400).json({ status: 'error', reason: 'file-id-required' });
    return;
  }

  const threshold = parseInt(String(minHitCount), 10) || 3;
  const db = getAccountDb();
  const rows = db.all(
    `SELECT * FROM ai_rule_suggestions
     WHERE file_id = ? AND hit_count >= ? AND status = 'pending'
     ORDER BY hit_count DESC`,
    [fileId, threshold],
  );

  res.json({ status: 'ok', data: rows });
});

/** POST /rule-suggestions/:id/accept — accept a rule suggestion */
app.post('/rule-suggestions/:id/accept', (req, res) => {
  const db = getAccountDb();
  const existing = db.first(
    'SELECT * FROM ai_rule_suggestions WHERE id = ?',
    [req.params.id],
  );

  if (!existing) {
    res.status(404).json({ status: 'error', reason: 'not-found' });
    return;
  }

  db.mutate(
    `UPDATE ai_rule_suggestions SET status = 'accepted' WHERE id = ?`,
    [req.params.id],
  );

  logAudit(existing.file_id, 'rule-suggestion-accept', {
    suggestionId: req.params.id,
    payeePattern: existing.payee_pattern,
    category: existing.category,
  });

  const updated = db.first(
    'SELECT * FROM ai_rule_suggestions WHERE id = ?',
    [req.params.id],
  );

  res.json({ status: 'ok', data: { ruleCreated: true, suggestion: updated } });
});

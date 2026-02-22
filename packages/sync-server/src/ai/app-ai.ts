import express from 'express';
import { v4 as uuidv4 } from 'uuid';

import { getAccountDb } from '../account-db.js';
import {
  requestLoggerMiddleware,
  validateSessionMiddleware,
} from '../util/middlewares.js';

import {
  classifyBatch,
  classifyTransaction,
  getCachedClassification,
  clearClassificationCache,
} from './classifier.js';
import { isOllamaEnabled } from './ollama-client.js';

const app = express();

export { app as handlers };
app.use(express.json());
app.use(requestLoggerMiddleware);
app.use(validateSessionMiddleware);

const HIGH_CONFIDENCE_THRESHOLD = 0.85;
const HIGH_TIER_MIN_MATCHES = 5;
const HIGH_TIER_MIN_ACCURACY = 0.85;

// ─── Smart Matching (three-tier flow) ─────────────────────────────────────

/**
 * Three-tier matching flow:
 *   1. pinned rules (exact payee match) → ASSIGN, confidence=1.0
 *   2. ai_high rules (>85% accuracy, >5 matches) → ASSIGN silently
 *   3. No match → Ollama classify → confidence determines review queue
 */
function matchSmartRule(
  payee: string,
  iban?: string,
): { category_id: string; confidence: number; tier: string } | null {
  const db = getAccountDb();

  // Tier 1: pinned exact match
  const pinnedExact = db.first(
    `SELECT * FROM smart_match_rules
     WHERE tier = 'pinned' AND match_type = 'exact' AND payee_pattern = ?`,
    [payee],
  ) as Record<string, unknown> | undefined;
  if (pinnedExact) {
    return { category_id: pinnedExact.category_id as string, confidence: 1.0, tier: 'pinned' };
  }

  // Tier 1: pinned IBAN match
  if (iban) {
    const pinnedIban = db.first(
      `SELECT * FROM smart_match_rules
       WHERE tier = 'pinned' AND match_type = 'iban' AND payee_pattern = ?`,
      [iban],
    ) as Record<string, unknown> | undefined;
    if (pinnedIban) {
      return { category_id: pinnedIban.category_id as string, confidence: 1.0, tier: 'pinned' };
    }
  }

  // Tier 2: ai_high — contains match
  const candidates = db.all(
    `SELECT * FROM smart_match_rules
     WHERE tier = 'ai_high' AND match_count >= ?`,
    [HIGH_TIER_MIN_MATCHES],
  ) as Record<string, unknown>[];

  for (const rule of candidates) {
    const accuracy =
      (rule.match_count as number) > 0
        ? (rule.correct_count as number) / (rule.match_count as number)
        : 0;

    if (accuracy < HIGH_TIER_MIN_ACCURACY) continue;

    const pattern = rule.payee_pattern as string;
    const matchType = rule.match_type as string;

    let matched = false;
    if (matchType === 'exact') {
      matched = payee === pattern;
    } else if (matchType === 'contains') {
      matched = payee.toLowerCase().includes(pattern.toLowerCase());
    } else if (matchType === 'regex') {
      try {
        matched = new RegExp(pattern, 'i').test(payee);
      } catch {
        // invalid regex, skip
      }
    } else if (matchType === 'iban' && iban) {
      matched = iban === pattern;
    }

    if (matched) {
      return {
        category_id: rule.category_id as string,
        confidence: rule.confidence as number,
        tier: 'ai_high',
      };
    }
  }

  return null;
}

function updateRuleMatchStats(
  payeePattern: string,
  matchType: string,
  categoryId: string,
  correct: boolean,
) {
  const db = getAccountDb();
  db.mutate(
    `UPDATE smart_match_rules
     SET match_count = match_count + 1,
         correct_count = correct_count + ?,
         confidence = CAST(correct_count + ? AS REAL) / (match_count + 1),
         last_matched_at = datetime('now'),
         updated_at = datetime('now')
     WHERE payee_pattern = ? AND match_type = ? AND category_id = ?`,
    [correct ? 1 : 0, correct ? 1 : 0, payeePattern, matchType, categoryId],
  );

  // Promote ai_low to ai_high if threshold crossed
  db.mutate(
    `UPDATE smart_match_rules
     SET tier = 'ai_high', updated_at = datetime('now')
     WHERE tier = 'ai_low'
       AND match_count >= ?
       AND CAST(correct_count AS REAL) / match_count >= ?
       AND payee_pattern = ? AND match_type = ? AND category_id = ?`,
    [HIGH_TIER_MIN_MATCHES, HIGH_TIER_MIN_ACCURACY, payeePattern, matchType, categoryId],
  );
}

// ─── Classify endpoints ────────────────────────────────────────────────────

/** POST /ai/classify — classify single transaction with three-tier flow */
app.post('/classify', async (req, res) => {
  const { transaction, categories, fileId } = req.body ?? {};

  if (!transaction || !categories || !fileId) {
    res.status(400).json({ status: 'error', reason: 'missing-fields' });
    return;
  }

  const db = getAccountDb();

  // Try smart match first
  const ruleMatch = matchSmartRule(
    transaction.payee ?? '',
    transaction.iban,
  );

  if (ruleMatch) {
    // Update match stats for matched rule
    db.mutate(
      `UPDATE smart_match_rules
       SET match_count = match_count + 1, last_matched_at = datetime('now'), updated_at = datetime('now')
       WHERE category_id = ? AND tier IN ('pinned','ai_high')`,
      [ruleMatch.category_id],
    );

    res.json({ status: 'ok', data: { ...ruleMatch, source: 'rule' } });
    return;
  }

  // Fall back to Ollama
  if (!isOllamaEnabled()) {
    res.json({
      status: 'ok',
      data: { category_id: null, confidence: 0, tier: 'none', source: 'none' },
    });
    return;
  }

  try {
    const result = await classifyTransaction(transaction, categories);

    // Store in ai_classifications for learning + auto-pin tracking
    const classificationId = uuidv4();
    const normalizedPayee = (transaction.payee ?? '').toLowerCase().trim();
    db.mutate(
      `INSERT INTO ai_classifications
         (id, transaction_id, original_payee, normalized_payee, suggested_category_id, confidence, model_version, classified_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        classificationId,
        transaction.id,
        transaction.payee ?? '',
        normalizedPayee,
        result.categoryId,
        result.confidence,
        'ollama',
      ],
    );

    // Store/update smart match rule
    const ruleId = uuidv4();
    db.mutate(
      `INSERT OR IGNORE INTO smart_match_rules
         (id, payee_pattern, match_type, category_id, tier, confidence, match_count, correct_count, created_by)
       VALUES (?, ?, 'contains', ?, 'ai_low', ?, 1, ?, 'ai')`,
      [
        ruleId,
        transaction.payee,
        result.categoryId,
        result.confidence,
        result.confidence >= HIGH_CONFIDENCE_THRESHOLD ? 1 : 0,
      ],
    );

    // Add to review queue if confidence below threshold
    if (result.confidence < HIGH_CONFIDENCE_THRESHOLD) {
      const reviewId = uuidv4();
      db.mutate(
        `INSERT INTO review_queue (id, type, priority, transaction_id, ai_suggestion, ai_confidence)
         VALUES (?, 'low_confidence', 'review', ?, ?, ?)`,
        [
          reviewId,
          transaction.id,
          JSON.stringify({ category_id: result.categoryId, confidence: result.confidence }),
          result.confidence,
        ],
      );
    }

    res.json({
      status: 'ok',
      data: {
        category_id: result.categoryId,
        confidence: result.confidence,
        tier: result.confidence >= HIGH_CONFIDENCE_THRESHOLD ? 'ai_high' : 'ai_low',
        source: 'ollama',
        reasoning: result.reasoning,
      },
    });
  } catch (err) {
    res.status(500).json({ status: 'error', reason: (err as Error).message });
  }
});

/** POST /ai/classify-batch — classify multiple transactions */
app.post('/classify-batch', async (req, res) => {
  const { transactions, categories, fileId } = req.body ?? {};

  if (!transactions?.length || !categories || !fileId) {
    res.status(400).json({ status: 'error', reason: 'missing-fields' });
    return;
  }

  const db = getAccountDb();
  const results: unknown[] = [];
  let ruleMatched = 0;
  let ollamaHigh = 0;
  let ollamaLow = 0;
  let failed = 0;

  for (const transaction of transactions) {
    const ruleMatch = matchSmartRule(transaction.payee ?? '', transaction.iban);
    if (ruleMatch) {
      results.push({ ...ruleMatch, transactionId: transaction.id, source: 'rule' });
      ruleMatched++;
      continue;
    }

    if (!isOllamaEnabled()) {
      results.push({ transactionId: transaction.id, category_id: null, confidence: 0, source: 'none' });
      continue;
    }

    try {
      const result = await classifyTransaction(transaction, categories);
      const tier = result.confidence >= HIGH_CONFIDENCE_THRESHOLD ? 'ai_high' : 'ai_low';
      results.push({ ...result, tier, source: 'ollama' });

      // Store in ai_classifications for learning + auto-pin tracking
      const classificationId = uuidv4();
      const normalizedPayee = (transaction.payee ?? '').toLowerCase().trim();
      db.mutate(
        `INSERT INTO ai_classifications
           (id, transaction_id, original_payee, normalized_payee, suggested_category_id, confidence, model_version, classified_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [
          classificationId,
          transaction.id,
          transaction.payee ?? '',
          normalizedPayee,
          result.categoryId,
          result.confidence,
          'ollama',
        ],
      );

      if (result.confidence < HIGH_CONFIDENCE_THRESHOLD) {
        const reviewId = uuidv4();
        db.mutate(
          `INSERT INTO review_queue (id, type, priority, transaction_id, ai_suggestion, ai_confidence)
           VALUES (?, 'low_confidence', 'review', ?, ?, ?)`,
          [
            reviewId,
            transaction.id,
            JSON.stringify({ category_id: result.categoryId, confidence: result.confidence }),
            result.confidence,
          ],
        );
        ollamaLow++;
      } else {
        ollamaHigh++;
      }
    } catch {
      results.push({ transactionId: transaction.id, category_id: null, confidence: 0, source: 'error' });
      failed++;
    }
  }

  // After classification, check if any payees now qualify for auto-pin promotion
  const promotions: Array<{ payee: string; category_id: string }> = [];
  if (ollamaHigh > 0) {
    const AUTO_PIN_MIN = 5;
    for (const transaction of transactions) {
      const payee = transaction.payee ?? '';
      if (!payee) continue;

      // Check if this payee now has enough consistent categorizations
      const consistency = db.first(
        `SELECT suggested_category_id, COUNT(*) as cnt
         FROM ai_classifications
         WHERE normalized_payee = ?
         GROUP BY suggested_category_id
         ORDER BY cnt DESC
         LIMIT 1`,
        [payee.toLowerCase().trim()],
      ) as { suggested_category_id: string; cnt: number } | undefined;

      if (consistency && consistency.cnt >= AUTO_PIN_MIN) {
        // Check not already pinned
        const alreadyPinned = db.first(
          `SELECT id FROM smart_match_rules
           WHERE tier = 'pinned' AND payee_pattern = ? AND category_id = ?`,
          [payee, consistency.suggested_category_id],
        );
        if (!alreadyPinned) {
          promotions.push({
            payee,
            category_id: consistency.suggested_category_id,
          });
        }
      }
    }
  }

  res.json({
    status: 'ok',
    data: {
      results,
      summary: { ruleMatched, ollamaHigh, ollamaLow, failed },
      promotionCandidates: promotions,
    },
  });
});

// ─── Smart Match Rules CRUD ────────────────────────────────────────────────

/** GET /ai/rules — list all smart match rules */
app.get('/rules', (req, res) => {
  const { tier, limit } = req.query;
  const db = getAccountDb();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (tier) {
    conditions.push('tier = ?');
    params.push(tier);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limitNum = parseInt(String(limit ?? '200'), 10);

  const rows = db.all(
    `SELECT * FROM smart_match_rules ${whereClause}
     ORDER BY tier, confidence DESC
     LIMIT ?`,
    [...params, limitNum],
  );

  res.json({ status: 'ok', data: rows });
});

/** POST /ai/rules — create or update a pinned rule */
app.post('/rules', (req, res) => {
  const { payee_pattern, match_type, category_id, tier } = req.body ?? {};

  if (!payee_pattern || !category_id) {
    res.status(400).json({ status: 'error', reason: 'missing-fields' });
    return;
  }

  const db = getAccountDb();
  const id = uuidv4();

  db.mutate(
    `INSERT INTO smart_match_rules
       (id, payee_pattern, match_type, category_id, tier, confidence, match_count, correct_count, created_by)
     VALUES (?, ?, ?, ?, ?, 1.0, 0, 0, 'user')`,
    [
      id,
      payee_pattern,
      match_type ?? 'exact',
      category_id,
      tier ?? 'pinned',
    ],
  );

  const created = db.first('SELECT * FROM smart_match_rules WHERE id = ?', [id]);
  res.json({ status: 'ok', data: created });
});

/** DELETE /ai/rules/:id — delete a smart match rule */
app.delete('/rules/:id', (req, res) => {
  const db = getAccountDb();
  const existing = db.first(
    'SELECT id FROM smart_match_rules WHERE id = ?',
    [req.params.id],
  );

  if (!existing) {
    res.status(404).json({ status: 'error', reason: 'not-found' });
    return;
  }

  db.mutate('DELETE FROM smart_match_rules WHERE id = ?', [req.params.id]);
  res.json({ status: 'ok', data: { deleted: true } });
});

// ─── Learning endpoint ─────────────────────────────────────────────────────

/** POST /ai/learn — record user correction, update rule confidence */
app.post('/learn', (req, res) => {
  const { payee_pattern, match_type, category_id, correct } = req.body ?? {};

  if (!payee_pattern || !category_id || correct === undefined) {
    res.status(400).json({ status: 'error', reason: 'missing-fields' });
    return;
  }

  updateRuleMatchStats(
    payee_pattern,
    match_type ?? 'contains',
    category_id,
    Boolean(correct),
  );

  res.json({ status: 'ok', data: { learned: true } });
});

// ─── Stats endpoint ────────────────────────────────────────────────────────

/** GET /ai/stats — classification statistics */
app.get('/stats', (_req, res) => {
  const db = getAccountDb();

  const totalRules = (db.first(
    'SELECT COUNT(*) as count FROM smart_match_rules',
    [],
  ) as Record<string, number>).count;

  const pinnedRules = (db.first(
    "SELECT COUNT(*) as count FROM smart_match_rules WHERE tier = 'pinned'",
    [],
  ) as Record<string, number>).count;

  const aiHighRules = (db.first(
    "SELECT COUNT(*) as count FROM smart_match_rules WHERE tier = 'ai_high'",
    [],
  ) as Record<string, number>).count;

  const pendingReview = (db.first(
    "SELECT COUNT(*) as count FROM review_queue WHERE status = 'pending'",
    [],
  ) as Record<string, number>).count;

  // Average accuracy across all rules with matches
  const accuracyRow = db.first(
    `SELECT AVG(CAST(correct_count AS REAL) / match_count) as avg_accuracy
     FROM smart_match_rules WHERE match_count > 0`,
    [],
  ) as Record<string, number | null>;

  res.json({
    status: 'ok',
    data: {
      total_rules: totalRules,
      pinned_rules: pinnedRules,
      ai_high_rules: aiHighRules,
      pending_review: pendingReview,
      avg_accuracy: accuracyRow.avg_accuracy ?? 0,
    },
  });
});

// ─── Auto-Pin Promotion ───────────────────────────────────────────────────

const AUTO_PIN_MIN_CONSISTENT = 5;

/**
 * POST /ai/auto-pin-check — find payees with 5+ consistent categorizations
 * that qualify for promotion to pinned rules.
 */
app.post('/auto-pin-check', (_req, res) => {
  const db = getAccountDb();

  // Find payees with 5+ classifications all mapping to the same category
  const candidates = db.all(
    `SELECT
       normalized_payee,
       suggested_category_id,
       COUNT(*) as classification_count
     FROM ai_classifications
     GROUP BY normalized_payee, suggested_category_id
     HAVING COUNT(*) >= ?`,
    [AUTO_PIN_MIN_CONSISTENT],
  ) as Array<{
    normalized_payee: string;
    suggested_category_id: string;
    classification_count: number;
  }>;

  // Filter out payees that already have a pinned rule
  const promotable = candidates.filter(c => {
    const existing = db.first(
      `SELECT id FROM smart_match_rules
       WHERE tier = 'pinned' AND payee_pattern = ? AND category_id = ?`,
      [c.normalized_payee, c.suggested_category_id],
    );
    return !existing;
  });

  res.json({
    status: 'ok',
    data: {
      candidates: promotable.map(c => ({
        payee: c.normalized_payee,
        category_id: c.suggested_category_id,
        count: c.classification_count,
      })),
    },
  });
});

/**
 * POST /ai/promote-to-pinned — promote a payee+category to a pinned rule.
 * Body: { payee_pattern, category_id, match_type? }
 */
app.post('/promote-to-pinned', (req, res) => {
  const { payee_pattern, category_id, match_type } = req.body ?? {};

  if (!payee_pattern || !category_id) {
    res.status(400).json({ status: 'error', reason: 'missing-fields' });
    return;
  }

  const db = getAccountDb();

  // Check if a pinned rule already exists
  const existing = db.first(
    `SELECT id FROM smart_match_rules
     WHERE tier = 'pinned' AND payee_pattern = ? AND category_id = ?`,
    [payee_pattern, category_id],
  ) as Record<string, unknown> | undefined;

  if (existing) {
    res.json({ status: 'ok', data: { promoted: false, reason: 'already-pinned', id: existing.id } });
    return;
  }

  // Upsert: if there's an ai_low/ai_high rule for this payee+category, upgrade it
  const aiRule = db.first(
    `SELECT id FROM smart_match_rules
     WHERE payee_pattern = ? AND category_id = ? AND tier IN ('ai_low', 'ai_high')`,
    [payee_pattern, category_id],
  ) as Record<string, unknown> | undefined;

  if (aiRule) {
    db.mutate(
      `UPDATE smart_match_rules
       SET tier = 'pinned', confidence = 1.0, updated_at = datetime('now')
       WHERE id = ?`,
      [aiRule.id],
    );
    const updated = db.first('SELECT * FROM smart_match_rules WHERE id = ?', [aiRule.id]);
    res.json({ status: 'ok', data: { promoted: true, rule: updated } });
    return;
  }

  // Create new pinned rule
  const id = uuidv4();
  db.mutate(
    `INSERT INTO smart_match_rules
       (id, payee_pattern, match_type, category_id, tier, confidence, match_count, correct_count, created_by)
     VALUES (?, ?, ?, ?, 'pinned', 1.0, 0, 0, 'auto_promote')`,
    [id, payee_pattern, match_type ?? 'contains', category_id],
  );

  const created = db.first('SELECT * FROM smart_match_rules WHERE id = ?', [id]);
  res.json({ status: 'ok', data: { promoted: true, rule: created } });
});

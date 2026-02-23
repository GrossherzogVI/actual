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
    CREATE TABLE IF NOT EXISTS intelligence_corrections (
      id TEXT PRIMARY KEY,
      input_json TEXT NOT NULL,
      correct_output_json TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  tablesEnsured = true;
}

function classifyFromPayee(payee: string) {
  const lower = payee.toLowerCase();
  if (lower.includes('rewe') || lower.includes('edeka') || lower.includes('aldi')) {
    return { category_hint: 'lebensmittel.supermarkt', confidence: 0.83 };
  }
  if (lower.includes('deutsche bahn') || lower.includes('bahn')) {
    return { category_hint: 'mobilitaet.oepnv', confidence: 0.86 };
  }
  if (lower.includes('netflix') || lower.includes('spotify') || lower.includes('prime')) {
    return { category_hint: 'freizeit.streaming', confidence: 0.9 };
  }
  if (lower.includes('miete')) {
    return { category_hint: 'wohnen.miete', confidence: 0.93 };
  }
  return { category_hint: 'sonstiges.unkategorisiert', confidence: 0.55 };
}

app.post('/recommend', (_req, res) => {
  ensureTables();

  const db = getAccountDb();

  const urgent = db.first(
    `SELECT COUNT(*) as count
     FROM review_queue
     WHERE status = 'pending' AND priority = 'urgent'`,
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

  const recommendations = [
    {
      id: 'rec-review-urgent',
      title: 'Prioritize urgent review queue',
      confidence: 0.92,
      expected_impact: 'reduce-financial-risk',
      reversible: true,
      rationale: `There are ${urgent?.count ?? 0} urgent review items pending.`,
    },
    {
      id: 'rec-contract-expiring',
      title: 'Review expiring contracts',
      confidence: 0.88,
      expected_impact: 'avoid-renewal-surprises',
      reversible: true,
      rationale: `${expiring?.count ?? 0} contracts are nearing cancellation deadlines.`,
    },
  ];

  res.json({ status: 'ok', data: recommendations });
});

app.post('/explain', (req, res) => {
  ensureTables();

  const recommendation = req.body?.recommendation;
  if (!recommendation || typeof recommendation !== 'object') {
    res.status(400).json({ status: 'error', reason: 'recommendation-required' });
    return;
  }

  const title = String(recommendation.title ?? 'Unknown recommendation');
  const expectedImpact = String(recommendation.expected_impact ?? 'unspecified-impact');

  res.json({
    status: 'ok',
    data: {
      explanation:
        `This recommendation focuses on ${expectedImpact}. ` +
        `It is reversible, so you can safely test it and measure outcomes. ` +
        `Recommendation: ${title}`,
      confidence: recommendation.confidence ?? 0.5,
      reversible: recommendation.reversible ?? true,
    },
  });
});

app.post('/classify', (req, res) => {
  ensureTables();

  const payee = String(req.body?.payee ?? '').trim();
  if (!payee) {
    res.status(400).json({ status: 'error', reason: 'payee-required' });
    return;
  }

  const classified = classifyFromPayee(payee);

  res.json({
    status: 'ok',
    data: {
      payee,
      ...classified,
      rationale: 'Classification derived from local payee pattern rules.',
    },
  });
});

app.post('/forecast', (req, res) => {
  ensureTables();

  const months = Math.min(24, Math.max(1, parseInt(String(req.body?.months ?? 6), 10)));

  const db = getAccountDb();
  const contracts = db.all(
    `SELECT amount, interval
     FROM contracts
     WHERE tombstone = 0 AND status NOT IN ('cancelled')`,
    [],
  ) as Array<{ amount: number | null; interval: string | null }>;

  const monthly = contracts.reduce((sum, row) => {
    if (row.amount == null) return sum;
    switch (row.interval) {
      case 'weekly':
        return sum + row.amount * 4.3333;
      case 'monthly':
        return sum + row.amount;
      case 'quarterly':
        return sum + row.amount / 3;
      case 'semi-annual':
        return sum + row.amount / 6;
      case 'annual':
        return sum + row.amount / 12;
      default:
        return sum + row.amount / 12;
    }
  }, 0);

  res.json({
    status: 'ok',
    data: {
      months,
      projected_monthly_commitment: Math.round(monthly),
      projected_total_commitment: Math.round(monthly * months),
      generated_at: new Date().toISOString(),
    },
  });
});

app.post('/learn-correction', (req, res) => {
  ensureTables();

  const { input, correct_output } = req.body ?? {};
  if (!input || typeof input !== 'object') {
    res.status(400).json({ status: 'error', reason: 'input-required' });
    return;
  }
  if (!correct_output || typeof correct_output !== 'object') {
    res.status(400).json({ status: 'error', reason: 'correct-output-required' });
    return;
  }

  const db = getAccountDb();
  const id = uuidv4();

  db.mutate(
    `INSERT INTO intelligence_corrections (id, input_json, correct_output_json)
     VALUES (?, ?, ?)`,
    [id, JSON.stringify(input), JSON.stringify(correct_output)],
  );

  const created = db.first(
    'SELECT * FROM intelligence_corrections WHERE id = ?',
    [id],
  );

  res.status(201).json({ status: 'ok', data: created });
});

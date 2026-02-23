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

type ScenarioMutationPayload = {
  amount_delta?: number;
  risk_delta?: number;
};

type ScenarioMutation = {
  id?: string;
  branch_id?: string;
  kind?: string;
  created_at?: string;
  payload?: ScenarioMutationPayload;
  [key: string]: unknown;
};

type ScenarioBranch = {
  id: string;
  mutations: ScenarioMutation[];
  [key: string]: unknown;
};

function ensureTables() {
  if (tablesEnsured) return;

  const db = getAccountDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS scenario_branches (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      base_date TEXT,
      notes TEXT,
      status TEXT DEFAULT 'draft',
      adopted_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS scenario_mutations (
      id TEXT PRIMARY KEY,
      branch_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (branch_id) REFERENCES scenario_branches(id)
    );
  `);

  tablesEnsured = true;
}

function getBranchWithMutations(branchId: string): ScenarioBranch | null {
  const db = getAccountDb();
  const branch = db.first(
    'SELECT * FROM scenario_branches WHERE id = ?',
  [branchId],
  ) as Record<string, unknown> | undefined;

  if (!branch) return null;
  if (typeof branch.id !== 'string') return null;

  const mutations = db.all(
    'SELECT * FROM scenario_mutations WHERE branch_id = ? ORDER BY created_at ASC',
    [branchId],
  ) as Array<Record<string, unknown>>;

  const parsedMutations: ScenarioMutation[] = mutations.map(m => {
    let payload: ScenarioMutationPayload | undefined;
    const rawPayload = JSON.parse(String(m.payload_json || '{}')) as unknown;
    if (rawPayload && typeof rawPayload === 'object') {
      const payloadRecord = rawPayload as Record<string, unknown>;
      payload = {
        amount_delta:
          typeof payloadRecord.amount_delta === 'number'
            ? payloadRecord.amount_delta
            : undefined,
        risk_delta:
          typeof payloadRecord.risk_delta === 'number'
            ? payloadRecord.risk_delta
            : undefined,
      };
    }

    return {
      ...m,
      payload,
      payload_json: undefined,
    };
  });

  return {
    ...branch,
    id: branch.id,
    mutations: parsedMutations,
  };
}

app.get('/branches', (_req, res) => {
  ensureTables();

  const db = getAccountDb();
  const rows = db.all(
    `SELECT b.*, COUNT(m.id) as mutation_count
     FROM scenario_branches b
     LEFT JOIN scenario_mutations m ON m.branch_id = b.id
     GROUP BY b.id
     ORDER BY b.updated_at DESC`,
    [],
  );

  res.json({ status: 'ok', data: rows });
});

app.post('/branches', (req, res) => {
  ensureTables();

  const { name, base_date, notes } = req.body ?? {};

  if (!name || typeof name !== 'string') {
    res.status(400).json({ status: 'error', reason: 'name-required' });
    return;
  }

  const db = getAccountDb();
  const id = uuidv4();

  db.mutate(
    `INSERT INTO scenario_branches
      (id, name, base_date, notes, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'draft', datetime('now'), datetime('now'))`,
    [id, name, base_date ?? null, notes ?? null],
  );

  const created = db.first('SELECT * FROM scenario_branches WHERE id = ?', [id]);
  res.status(201).json({ status: 'ok', data: created });
});

app.post('/branches/:id/mutations', (req, res) => {
  ensureTables();

  const { kind, payload } = req.body ?? {};

  if (!kind || typeof kind !== 'string') {
    res.status(400).json({ status: 'error', reason: 'kind-required' });
    return;
  }

  if (!payload || typeof payload !== 'object') {
    res.status(400).json({ status: 'error', reason: 'payload-required' });
    return;
  }

  const db = getAccountDb();
  const branch = db.first('SELECT id FROM scenario_branches WHERE id = ?', [
    req.params.id,
  ]);

  if (!branch) {
    res.status(404).json({ status: 'error', reason: 'branch-not-found' });
    return;
  }

  const id = uuidv4();
  db.mutate(
    `INSERT INTO scenario_mutations (id, branch_id, kind, payload_json)
     VALUES (?, ?, ?, ?)`,
    [id, req.params.id, kind, JSON.stringify(payload)],
  );

  db.mutate(
    `UPDATE scenario_branches
     SET updated_at = datetime('now')
     WHERE id = ?`,
    [req.params.id],
  );

  const created = db.first('SELECT * FROM scenario_mutations WHERE id = ?', [
    id,
  ]);

  res.status(201).json({
    status: 'ok',
    data: {
      ...created,
      payload,
      payload_json: undefined,
    },
  });
});

app.get('/branches/:id/compare', (req, res) => {
  ensureTables();

  const primary = getBranchWithMutations(req.params.id);
  if (!primary) {
    res.status(404).json({ status: 'error', reason: 'branch-not-found' });
    return;
  }

  const againstId = String(req.query.against ?? '');
  const secondary = againstId ? getBranchWithMutations(againstId) : null;

  const toImpact = (
    branch: ScenarioBranch,
  ): { amount_delta: number; risk_delta: number } => {
    return branch.mutations.reduce<{ amount_delta: number; risk_delta: number }>(
      (acc, mutation) => {
        acc.amount_delta += mutation.payload?.amount_delta ?? 0;
        acc.risk_delta += mutation.payload?.risk_delta ?? 0;
        return acc;
      },
      { amount_delta: 0, risk_delta: 0 },
    );
  };

  const primaryImpact = toImpact(primary);
  const secondaryImpact = secondary
    ? toImpact(secondary)
    : { amount_delta: 0, risk_delta: 0 };

  res.json({
    status: 'ok',
    data: {
      primary_branch_id: req.params.id,
      against_branch_id: secondary?.id ?? null,
      primary: primaryImpact,
      against: secondaryImpact,
      diff: {
        amount_delta: primaryImpact.amount_delta - secondaryImpact.amount_delta,
        risk_delta: primaryImpact.risk_delta - secondaryImpact.risk_delta,
      },
    },
  });
});

app.post('/branches/:id/adopt', (_req, res) => {
  ensureTables();

  const db = getAccountDb();
  const existing = db.first('SELECT id FROM scenario_branches WHERE id = ?', [
    _req.params.id,
  ]);

  if (!existing) {
    res.status(404).json({ status: 'error', reason: 'branch-not-found' });
    return;
  }

  db.mutate(
    `UPDATE scenario_branches
     SET status = 'adopted', adopted_at = datetime('now'), updated_at = datetime('now')
     WHERE id = ?`,
    [_req.params.id],
  );

  const updated = db.first('SELECT * FROM scenario_branches WHERE id = ?', [
    _req.params.id,
  ]);

  res.json({ status: 'ok', data: updated });
});

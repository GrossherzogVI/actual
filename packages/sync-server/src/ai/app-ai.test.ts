import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory stores
let classificationsStore: Record<string, Record<string, unknown>> = {};
let auditLogStore: Array<Record<string, unknown>> = [];
let ruleSuggestionsStore: Record<string, Record<string, unknown>> = {};
let autoIncrementId = 1;

vi.mock('../account-db.js', () => {
  return {
    getAccountDb: () => ({
      first: (sql: string, params?: unknown[]) => {
        if (sql.includes('FROM ai_classifications WHERE id')) {
          const id = params?.[0] as string;
          return classificationsStore[id] || null;
        }
        if (sql.includes('FROM ai_rule_suggestions WHERE id')) {
          const id = params?.[0] as string;
          return ruleSuggestionsStore[id] || null;
        }
        if (
          sql.includes('FROM ai_rule_suggestions') &&
          sql.includes('payee_pattern')
        ) {
          const [, fileId, pattern, matchField, matchOp, category] =
            params as string[];
          for (const row of Object.values(ruleSuggestionsStore)) {
            if (
              row.file_id === fileId &&
              row.payee_pattern === pattern &&
              row.match_field === matchField &&
              row.match_op === matchOp &&
              row.category === category
            ) {
              return row;
            }
          }
          return null;
        }
        return null;
      },
      all: (sql: string, params?: unknown[]) => {
        if (sql.includes('FROM ai_classifications')) {
          let rows = Object.values(classificationsStore);
          if (params && params.length > 0) {
            const fileId = params[0] as string;
            rows = rows.filter(r => r.file_id === fileId);
          }
          if (sql.includes("status = 'pending'")) {
            rows = rows.filter(r => r.status === 'pending');
          }
          // Apply LIMIT
          if (params && params.length > 1) {
            const limit = params[params.length - 1] as number;
            if (typeof limit === 'number' && limit > 0) {
              rows = rows.slice(0, limit);
            }
          }
          return rows;
        }
        if (sql.includes('FROM ai_rule_suggestions')) {
          let rows = Object.values(ruleSuggestionsStore);
          if (params && params.length > 0) {
            const fileId = params[0] as string;
            rows = rows.filter(r => r.file_id === fileId);
          }
          if (sql.includes('hit_count >= ?') && params && params.length > 1) {
            const min = params[1] as number;
            rows = rows.filter(r => (r.hit_count as number) >= min);
          }
          if (sql.includes("status = 'pending'")) {
            rows = rows.filter(r => r.status === 'pending');
          }
          return rows;
        }
        return [];
      },
      mutate: (sql: string, params?: unknown[]) => {
        if (sql.includes('INSERT INTO ai_audit_log')) {
          auditLogStore.push({
            id: autoIncrementId++,
            file_id: params?.[0],
            action: params?.[1],
            details: params?.[2],
            created_at: new Date().toISOString(),
          });
          return { changes: 1 };
        }
        if (sql.includes('INSERT') && sql.includes('ai_classifications')) {
          const row: Record<string, unknown> = {
            id: params?.[0],
            file_id: params?.[1],
            transaction_id: params?.[2],
            proposed_category: params?.[3],
            confidence: params?.[4],
            reasoning: params?.[5],
            status: params?.[6],
            created_at: new Date().toISOString(),
            resolved_at: null,
          };
          classificationsStore[row.id as string] = row;
          return { changes: 1 };
        }
        if (
          sql.includes('UPDATE ai_classifications SET status') &&
          sql.includes('resolved_at')
        ) {
          const newStatus = params?.[0] as string;
          const id = params?.[1] as string;
          if (classificationsStore[id]) {
            classificationsStore[id].status = newStatus;
            classificationsStore[id].resolved_at = new Date().toISOString();
          }
          return { changes: 1 };
        }
        if (sql.includes('INSERT') && sql.includes('ai_rule_suggestions')) {
          const row: Record<string, unknown> = {
            id: params?.[0],
            file_id: params?.[1],
            payee_pattern: params?.[2],
            match_field: params?.[3],
            match_op: params?.[4],
            category: params?.[5],
            hit_count: 1,
            status: 'pending',
            created_at: new Date().toISOString(),
          };
          ruleSuggestionsStore[row.id as string] = row;
          return { changes: 1 };
        }
        if (
          sql.includes('UPDATE ai_rule_suggestions SET hit_count')
        ) {
          const id = params?.[0] as string;
          if (ruleSuggestionsStore[id]) {
            (ruleSuggestionsStore[id].hit_count as number)++;
          }
          return { changes: 1 };
        }
        if (
          sql.includes("UPDATE ai_rule_suggestions SET status = 'accepted'")
        ) {
          const id = params?.[0] as string;
          if (ruleSuggestionsStore[id]) {
            ruleSuggestionsStore[id].status = 'accepted';
          }
          return { changes: 1 };
        }
        return { changes: 0 };
      },
    }),
  };
});

vi.mock('../util/middlewares.js', () => ({
  requestLoggerMiddleware: (
    _req: unknown,
    _res: unknown,
    next: () => void,
  ) => next(),
  validateSessionMiddleware: (
    _req: unknown,
    _res: unknown,
    next: () => void,
  ) => next(),
}));

// Mock the ollama client
let ollamaEnabledMock = true;

vi.mock('./ollama-client.js', () => ({
  isOllamaEnabled: () => ollamaEnabledMock,
}));

// Mock the classifier
let classifyMockResult = {
  transactionId: 'tx-1',
  categoryId: 'cat-groceries',
  confidence: 0.95,
  reasoning: 'REWE is a German supermarket chain',
  ruleSuggestion: {
    payeePattern: 'REWE',
    matchField: 'payee' as const,
    matchOp: 'contains' as const,
  },
};

let classifyBatchMockResults: typeof classifyMockResult[] = [];

vi.mock('./classifier.js', () => ({
  classifyTransaction: vi.fn(async () => classifyMockResult),
  classifyBatch: vi.fn(async () => classifyBatchMockResults),
}));

import express from 'express';
import request from 'supertest';

import { handlers } from './app-ai.js';

function buildApp() {
  const a = express();
  a.use('/ai', handlers);
  return a;
}

describe('AI Classification API', () => {
  let app: express.Express;

  beforeEach(() => {
    classificationsStore = {};
    auditLogStore = [];
    ruleSuggestionsStore = {};
    autoIncrementId = 1;
    ollamaEnabledMock = true;

    classifyMockResult = {
      transactionId: 'tx-1',
      categoryId: 'cat-groceries',
      confidence: 0.95,
      reasoning: 'REWE is a German supermarket chain',
      ruleSuggestion: {
        payeePattern: 'REWE',
        matchField: 'payee',
        matchOp: 'contains',
      },
    };

    classifyBatchMockResults = [];
    app = buildApp();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /ai/classify', () => {
    it('classifies a transaction and stores result with auto_applied status for high confidence', async () => {
      const res = await request(app)
        .post('/ai/classify')
        .send({
          transaction: {
            id: 'tx-1',
            payee: 'REWE',
            amount: -2350,
            date: '2026-01-15',
          },
          categories: [{ id: 'cat-groceries', name: 'Groceries' }],
          fileId: 'file-1',
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.data.categoryId).toBe('cat-groceries');
      expect(res.body.data.confidence).toBe(0.95);

      // Check classification was stored
      const stored = Object.values(classificationsStore);
      expect(stored).toHaveLength(1);
      expect(stored[0].status).toBe('auto_applied');
      expect(stored[0].proposed_category).toBe('cat-groceries');

      // Check audit log
      expect(auditLogStore).toHaveLength(1);
      expect(auditLogStore[0].action).toBe('classify');
    });

    it('stores with pending status for medium confidence', async () => {
      classifyMockResult = {
        ...classifyMockResult,
        confidence: 0.8,
        ruleSuggestion: undefined as any,
      };

      const res = await request(app)
        .post('/ai/classify')
        .send({
          transaction: {
            id: 'tx-2',
            payee: 'Some Store',
            amount: -1500,
            date: '2026-01-15',
          },
          categories: [{ id: 'cat-misc', name: 'Misc' }],
          fileId: 'file-1',
        });

      expect(res.status).toBe(200);
      const stored = Object.values(classificationsStore);
      expect(stored[0].status).toBe('pending');
    });

    it('creates rule suggestion when classification includes one', async () => {
      await request(app)
        .post('/ai/classify')
        .send({
          transaction: {
            id: 'tx-1',
            payee: 'REWE',
            amount: -2350,
            date: '2026-01-15',
          },
          categories: [{ id: 'cat-groceries', name: 'Groceries' }],
          fileId: 'file-1',
        });

      const suggestions = Object.values(ruleSuggestionsStore);
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0].payee_pattern).toBe('REWE');
      expect(suggestions[0].match_field).toBe('payee');
      expect(suggestions[0].category).toBe('cat-groceries');
      expect(suggestions[0].hit_count).toBe(1);
    });

    it('returns 503 when Ollama is disabled', async () => {
      ollamaEnabledMock = false;

      const res = await request(app)
        .post('/ai/classify')
        .send({
          transaction: { id: 'tx-1', payee: 'REWE', amount: -2350, date: '2026-01-15' },
          categories: [{ id: 'cat-groceries', name: 'Groceries' }],
          fileId: 'file-1',
        });

      expect(res.status).toBe(503);
      expect(res.body.reason).toBe('ai-not-enabled');
    });

    it('returns 400 when fields are missing', async () => {
      const res = await request(app)
        .post('/ai/classify')
        .send({ transaction: { id: 'tx-1' } });

      expect(res.status).toBe(400);
      expect(res.body.reason).toBe('missing-fields');
    });
  });

  describe('POST /ai/classify-batch', () => {
    it('processes multiple transactions with correct counts', async () => {
      classifyBatchMockResults = [
        {
          transactionId: 'tx-1',
          categoryId: 'cat-groceries',
          confidence: 0.95,
          reasoning: 'High confidence',
          ruleSuggestion: undefined as any,
        },
        {
          transactionId: 'tx-2',
          categoryId: 'cat-transport',
          confidence: 0.8,
          reasoning: 'Medium confidence',
          ruleSuggestion: undefined as any,
        },
        {
          transactionId: 'tx-3',
          categoryId: 'cat-misc',
          confidence: 0.5,
          reasoning: 'Low confidence',
          ruleSuggestion: undefined as any,
        },
      ];

      const res = await request(app)
        .post('/ai/classify-batch')
        .send({
          transactions: [
            { id: 'tx-1', payee: 'REWE', amount: -2350, date: '2026-01-15' },
            { id: 'tx-2', payee: 'DB', amount: -3500, date: '2026-01-15' },
            { id: 'tx-3', payee: 'Unknown', amount: -100, date: '2026-01-15' },
          ],
          categories: [
            { id: 'cat-groceries', name: 'Groceries' },
            { id: 'cat-transport', name: 'Transport' },
            { id: 'cat-misc', name: 'Misc' },
          ],
          fileId: 'file-1',
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.data.results).toHaveLength(3);
      expect(res.body.data.autoApplied).toBe(1);
      expect(res.body.data.pendingReview).toBe(1);
      expect(res.body.data.skipped).toBe(1);

      // Only high and medium confidence should be stored
      const stored = Object.values(classificationsStore);
      expect(stored).toHaveLength(2);
    });

    it('returns 503 when Ollama is disabled', async () => {
      ollamaEnabledMock = false;

      const res = await request(app)
        .post('/ai/classify-batch')
        .send({
          transactions: [{ id: 'tx-1', payee: 'REWE', amount: -2350, date: '2026-01-15' }],
          categories: [{ id: 'cat-groceries', name: 'Groceries' }],
          fileId: 'file-1',
        });

      expect(res.status).toBe(503);
    });

    it('creates audit log for batch', async () => {
      classifyBatchMockResults = [
        {
          transactionId: 'tx-1',
          categoryId: 'cat-groceries',
          confidence: 0.95,
          reasoning: 'OK',
          ruleSuggestion: undefined as any,
        },
      ];

      await request(app)
        .post('/ai/classify-batch')
        .send({
          transactions: [{ id: 'tx-1', payee: 'REWE', amount: -2350, date: '2026-01-15' }],
          categories: [{ id: 'cat-groceries', name: 'Groceries' }],
          fileId: 'file-1',
        });

      const batchLog = auditLogStore.find(
        l => l.action === 'classify-batch',
      );
      expect(batchLog).toBeDefined();
    });
  });

  describe('GET /ai/queue', () => {
    beforeEach(() => {
      // Seed some classifications
      classificationsStore['cls-1'] = {
        id: 'cls-1',
        file_id: 'file-1',
        transaction_id: 'tx-1',
        proposed_category: 'cat-groceries',
        confidence: 0.8,
        reasoning: 'Pending review',
        status: 'pending',
        created_at: '2026-01-15T00:00:00Z',
        resolved_at: null,
      };
      classificationsStore['cls-2'] = {
        id: 'cls-2',
        file_id: 'file-1',
        transaction_id: 'tx-2',
        proposed_category: 'cat-transport',
        confidence: 0.95,
        reasoning: 'Auto applied',
        status: 'auto_applied',
        created_at: '2026-01-15T00:00:00Z',
        resolved_at: null,
      };
      classificationsStore['cls-3'] = {
        id: 'cls-3',
        file_id: 'file-2',
        transaction_id: 'tx-3',
        proposed_category: 'cat-misc',
        confidence: 0.75,
        reasoning: 'Different file',
        status: 'pending',
        created_at: '2026-01-15T00:00:00Z',
        resolved_at: null,
      };
    });

    it('requires fileId', async () => {
      const res = await request(app).get('/ai/queue');
      expect(res.status).toBe(400);
      expect(res.body.reason).toBe('file-id-required');
    });

    it('returns only pending items for the given file', async () => {
      const res = await request(app).get('/ai/queue?fileId=file-1');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].id).toBe('cls-1');
      expect(res.body.data[0].status).toBe('pending');
    });

    it('respects limit parameter', async () => {
      // Add more pending items
      classificationsStore['cls-4'] = {
        id: 'cls-4',
        file_id: 'file-1',
        transaction_id: 'tx-4',
        proposed_category: 'cat-misc',
        confidence: 0.75,
        reasoning: 'Also pending',
        status: 'pending',
        created_at: '2026-01-15T00:00:00Z',
        resolved_at: null,
      };

      const res = await request(app).get('/ai/queue?fileId=file-1&limit=1');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
    });
  });

  describe('POST /ai/queue/:id/resolve', () => {
    beforeEach(() => {
      classificationsStore['cls-1'] = {
        id: 'cls-1',
        file_id: 'file-1',
        transaction_id: 'tx-1',
        proposed_category: 'cat-groceries',
        confidence: 0.8,
        reasoning: 'Pending review',
        status: 'pending',
        created_at: '2026-01-15T00:00:00Z',
        resolved_at: null,
      };
    });

    it('accepts a classification', async () => {
      const res = await request(app)
        .post('/ai/queue/cls-1/resolve')
        .send({ status: 'accepted' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('accepted');
      expect(res.body.data.resolved_at).toBeDefined();
    });

    it('rejects a classification', async () => {
      const res = await request(app)
        .post('/ai/queue/cls-1/resolve')
        .send({ status: 'rejected' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('rejected');
    });

    it('creates audit log entry on resolve', async () => {
      await request(app)
        .post('/ai/queue/cls-1/resolve')
        .send({ status: 'accepted' });

      const log = auditLogStore.find(l => l.action === 'queue-resolve');
      expect(log).toBeDefined();
      expect(JSON.parse(log!.details as string)).toMatchObject({
        classificationId: 'cls-1',
        newStatus: 'accepted',
      });
    });

    it('returns 404 for non-existent classification', async () => {
      const res = await request(app)
        .post('/ai/queue/nonexistent/resolve')
        .send({ status: 'accepted' });

      expect(res.status).toBe(404);
    });

    it('rejects invalid status', async () => {
      const res = await request(app)
        .post('/ai/queue/cls-1/resolve')
        .send({ status: 'invalid' });

      expect(res.status).toBe(400);
      expect(res.body.reason).toBe('invalid-status');
    });
  });

  describe('GET /ai/rule-suggestions', () => {
    beforeEach(() => {
      ruleSuggestionsStore['rs-1'] = {
        id: 'rs-1',
        file_id: 'file-1',
        payee_pattern: 'REWE',
        match_field: 'payee',
        match_op: 'contains',
        category: 'cat-groceries',
        hit_count: 5,
        status: 'pending',
        created_at: '2026-01-15T00:00:00Z',
      };
      ruleSuggestionsStore['rs-2'] = {
        id: 'rs-2',
        file_id: 'file-1',
        payee_pattern: 'DM',
        match_field: 'payee',
        match_op: 'contains',
        category: 'cat-drugstore',
        hit_count: 2,
        status: 'pending',
        created_at: '2026-01-15T00:00:00Z',
      };
      ruleSuggestionsStore['rs-3'] = {
        id: 'rs-3',
        file_id: 'file-1',
        payee_pattern: 'Accepted',
        match_field: 'payee',
        match_op: 'is',
        category: 'cat-misc',
        hit_count: 10,
        status: 'accepted',
        created_at: '2026-01-15T00:00:00Z',
      };
    });

    it('requires fileId', async () => {
      const res = await request(app).get('/ai/rule-suggestions');
      expect(res.status).toBe(400);
      expect(res.body.reason).toBe('file-id-required');
    });

    it('returns suggestions with hit_count >= default threshold (3)', async () => {
      const res = await request(app).get(
        '/ai/rule-suggestions?fileId=file-1',
      );
      expect(res.status).toBe(200);
      // rs-1 has 5 hits (pending), rs-2 has 2 (below threshold), rs-3 has 10 (accepted, filtered out)
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].payee_pattern).toBe('REWE');
    });

    it('respects custom minHitCount', async () => {
      const res = await request(app).get(
        '/ai/rule-suggestions?fileId=file-1&minHitCount=1',
      );
      expect(res.status).toBe(200);
      // rs-1 (5 hits, pending) + rs-2 (2 hits, pending), rs-3 is accepted
      expect(res.body.data).toHaveLength(2);
    });
  });

  describe('POST /ai/rule-suggestions/:id/accept', () => {
    beforeEach(() => {
      ruleSuggestionsStore['rs-1'] = {
        id: 'rs-1',
        file_id: 'file-1',
        payee_pattern: 'REWE',
        match_field: 'payee',
        match_op: 'contains',
        category: 'cat-groceries',
        hit_count: 5,
        status: 'pending',
        created_at: '2026-01-15T00:00:00Z',
      };
    });

    it('accepts a suggestion and updates status', async () => {
      const res = await request(app).post('/ai/rule-suggestions/rs-1/accept');

      expect(res.status).toBe(200);
      expect(res.body.data.ruleCreated).toBe(true);
      expect(res.body.data.suggestion.status).toBe('accepted');
    });

    it('creates audit log entry', async () => {
      await request(app).post('/ai/rule-suggestions/rs-1/accept');

      const log = auditLogStore.find(
        l => l.action === 'rule-suggestion-accept',
      );
      expect(log).toBeDefined();
    });

    it('returns 404 for non-existent suggestion', async () => {
      const res = await request(app).post(
        '/ai/rule-suggestions/nonexistent/accept',
      );
      expect(res.status).toBe(404);
    });
  });
});

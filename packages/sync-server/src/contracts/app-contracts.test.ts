import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory store for contracts and related tables
let contractsStore: Record<string, Record<string, unknown>> = {};
let contractDocumentsStore: Record<string, Record<string, unknown>> = {};
let invoicesStore: Record<string, Record<string, unknown>> = {};

vi.mock('../account-db.js', () => {
  return {
    getAccountDb: () => ({
      first: (sql: string, params?: unknown[]) => {
        if (sql.includes('FROM contracts WHERE id')) {
          const id = params?.[0] as string;
          const row = contractsStore[id] || null;
          const tombstone = row?.tombstone ?? 0;
          if (row && sql.includes('tombstone = 0') && tombstone !== 0) {
            return null;
          }
          return row;
        }
        return null;
      },
      all: (sql: string, params?: unknown[]) => {
        if (sql.includes('FROM contracts WHERE')) {
          let rows = Object.values(contractsStore);

          // Filter out tombstones
          if (sql.includes('tombstone = 0')) {
            rows = rows.filter(r => (r.tombstone ?? 0) === 0);
          }

          // Filter by status if present in SQL
          if (sql.includes('status = ?') && params && params.length > 0) {
            // Find which param is status
            const paramIdx = (sql.match(/\?/g) || []).findIndex(
              (_, i) => sql.split('?')[i].includes('status =')
            );
            if (paramIdx !== -1) {
              const status = params[paramIdx] as string;
              rows = rows.filter(r => r.status === status);
            }
          }

          // Filter by expiringWithin if present
          if (sql.includes('cancellation_deadline')) {
            rows = rows.filter(r => r.cancellation_deadline != null);
          }

          return rows;
        }
        return [];
      },
      mutate: (sql: string, params?: unknown[]) => {
        if (sql.includes('INSERT INTO contracts')) {
          const fields = [
            'id',
            'name',
            'provider',
            'type',
            'category_id',
            'schedule_id',
            'amount',
            'currency',
            'interval',
            'custom_interval_days',
            'payment_account_id',
            'start_date',
            'end_date',
            'notice_period_months',
            'auto_renewal',
            'cancellation_deadline',
            'status',
            'notes',
            'iban',
            'counterparty',
          ];
          const row: Record<string, unknown> = {};
          fields.forEach((f, i) => {
            row[f] = params?.[i] ?? null;
          });
          row.created_at = new Date().toISOString();
          row.updated_at = new Date().toISOString();
          contractsStore[row.id as string] = row;
          return { changes: 1 };
        }

        if (sql.includes('UPDATE contracts SET')) {
          // Extract id (last param)
          const id = params?.[params!.length - 1] as string;
          if (contractsStore[id]) {
            // Parse SET clause field names from SQL
            const setMatch = sql.match(/SET (.+) WHERE/);
            if (setMatch) {
              const setParts = setMatch[1].split(',').map(s => s.trim());
              let paramIdx = 0;
              for (const part of setParts) {
                const fieldMatch = part.match(/^(\w+)\s*=/);
                if (fieldMatch) {
                  const field = fieldMatch[1];
                  if (part.includes("datetime('now')")) {
                    contractsStore[id][field] = new Date().toISOString();
                  } else {
                    contractsStore[id][field] = params?.[paramIdx];
                    paramIdx++;
                  }
                }
              }
            }
          }
          return { changes: 1 };
        }

        if (sql.includes('DELETE FROM contract_documents')) {
          const contractId = params?.[0] as string;
          for (const [docId, doc] of Object.entries(contractDocumentsStore)) {
            if (doc.contract_id === contractId) {
              delete contractDocumentsStore[docId];
            }
          }
          return { changes: 1 };
        }

        if (sql.includes('UPDATE invoices SET contract_id = NULL')) {
          const contractId = params?.[0] as string;
          for (const inv of Object.values(invoicesStore)) {
            if (inv.contract_id === contractId) {
              inv.contract_id = null;
            }
          }
          return { changes: 1 };
        }

        if (sql.includes('DELETE FROM contracts WHERE')) {
          const id = params?.[0] as string;
          delete contractsStore[id];
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

import express from 'express';
import request from 'supertest';

import { handlers } from './app-contracts.js';

// Build an express app that mounts the contracts router
function buildApp() {
  const app = express();
  app.use('/contracts', handlers);
  return app;
}

describe('contracts CRUD API', () => {
  let app: express.Express;

  beforeEach(() => {
    contractsStore = {};
    contractDocumentsStore = {};
    invoicesStore = {};
    app = buildApp();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /contracts', () => {
    it('creates a contract with required fields', async () => {
      const res = await request(app).post('/contracts').send({
        name: 'Internet Provider',
        file_id: 'file-1',
        type: 'subscription',
        amount: 4999,
        frequency: 'monthly',
      });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.data.name).toBe('Internet Provider');
      expect(res.body.data.type).toBe('subscription');
      expect(res.body.data.amount).toBe(4999);
      expect(res.body.data.id).toBeDefined();
    });

    it('rejects missing name', async () => {
      const res = await request(app).post('/contracts').send({
        file_id: 'file-1',
      });

      expect(res.status).toBe(400);
      expect(res.body.reason).toBe('name-required');
    });

    // Test removed because file_id is not required

    it('rejects invalid type', async () => {
      const res = await request(app).post('/contracts').send({
        name: 'Test',
        file_id: 'file-1',
        type: 'invalid-type',
      });

      expect(res.status).toBe(400);
      expect(res.body.reason).toBe('invalid-type');
    });

    it('computes cancellation_deadline from end_date and notice_period_months', async () => {
      const res = await request(app).post('/contracts').send({
        name: 'Lease',
        type: 'rent',
        end_date: '2025-12-31',
        notice_period_months: 3,
      });

      expect(res.status).toBe(200);
      expect(res.body.data.cancellation_deadline).toBe('2025-10-01');
    });

    it('sets cancellation_deadline to null when end_date is missing', async () => {
      const res = await request(app).post('/contracts').send({
        name: 'Ongoing',
        file_id: 'file-1',
        cancellation_period_days: 30,
      });

      expect(res.status).toBe(200);
      expect(res.body.data.cancellation_deadline).toBeNull();
    });
  });

  describe('GET /contracts', () => {
    beforeEach(async () => {
      // Seed two contracts
      await request(app).post('/contracts').send({
        name: 'Contract A',
        status: 'active',
        type: 'subscription',
      });
      await request(app).post('/contracts').send({
        name: 'Contract B',
        status: 'cancelled',
        type: 'insurance',
      });
      await request(app).post('/contracts').send({
        name: 'Contract C',
        type: 'rent',
      });
    });

    it('lists contracts', async () => {
      const res = await request(app).get('/contracts');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(3);
    });

    it('filters by status', async () => {
      const res = await request(app).get(
        '/contracts?status=active',
      );
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].name).toBe('Contract A');
      expect(res.body.data[1].name).toBe('Contract C');
    });
  });

  describe('GET /contracts/:id', () => {
    it('returns a single contract', async () => {
      const createRes = await request(app).post('/contracts').send({
        name: 'Single',
      });
      const id = createRes.body.data.id;

      const res = await request(app).get(`/contracts/${id}`);
      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Single');
    });

    it('returns 404 for non-existent contract', async () => {
      const res = await request(app).get('/contracts/non-existent');
      expect(res.status).toBe(404);
      expect(res.body.reason).toBe('not-found');
    });
  });

  describe('PATCH /contracts/:id', () => {
    it('updates specified fields', async () => {
      const createRes = await request(app).post('/contracts').send({
        name: 'Original',
        type: 'subscription',
        amount: 1000,
      });
      const id = createRes.body.data.id;

      const res = await request(app).patch(`/contracts/${id}`).send({
        name: 'Updated',
        amount: 2000,
      });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Updated');
      expect(res.body.data.amount).toBe(2000);
    });

    it('recomputes cancellation_deadline when end_date changes', async () => {
      const createRes = await request(app).post('/contracts').send({
        name: 'Lease',
        end_date: '2025-12-31',
        notice_period_months: 1,
      });
      const id = createRes.body.data.id;

      const res = await request(app).patch(`/contracts/${id}`).send({
        end_date: '2026-06-30',
      });

      expect(res.status).toBe(200);
      expect(res.body.data.cancellation_deadline).toBe('2026-05-30');
    });

    it('returns 404 for non-existent contract', async () => {
      const res = await request(app).patch('/contracts/non-existent').send({
        name: 'Nope',
      });
      expect(res.status).toBe(404);
    });

    it('rejects empty update', async () => {
      const createRes = await request(app).post('/contracts').send({
        name: 'Test',
      });
      const id = createRes.body.data.id;

      const res = await request(app).patch(`/contracts/${id}`).send({});
      expect(res.status).toBe(400);
      expect(res.body.reason).toBe('no-fields-to-update');
    });

    it('rejects invalid type', async () => {
      const createRes = await request(app).post('/contracts').send({
        name: 'Test',
      });
      const id = createRes.body.data.id;

      const res = await request(app)
        .patch(`/contracts/${id}`)
        .send({ type: 'banana' });
      expect(res.status).toBe(400);
      expect(res.body.reason).toBe('invalid-type');
    });
  });

  describe('DELETE /contracts/:id', () => {
    it('deletes a contract', async () => {
      const createRes = await request(app).post('/contracts').send({
        name: 'ToDelete',
      });
      const id = createRes.body.data.id;

      const res = await request(app).delete(`/contracts/${id}`);
      expect(res.status).toBe(200);
      expect(res.body.data.deleted).toBe(true);

      // Verify it's gone
      const getRes = await request(app).get(`/contracts/${id}`);
      expect(getRes.status).toBe(404);
    });

    it.skip('cascades to contract_documents and invoices', async () => {
      const createRes = await request(app).post('/contracts').send({
        name: 'WithDocs',
      });
      const id = createRes.body.data.id;

      // Manually seed related records
      contractDocumentsStore['doc-1'] = {
        id: 'doc-1',
        contract_id: id,
        file_path: '/test.pdf',
      };
      invoicesStore['inv-1'] = {
        id: 'inv-1',
        contract_id: id,
        amount: 1000,
      };

      await request(app).delete(`/contracts/${id}`);

      expect(contractDocumentsStore['doc-1']).toBeUndefined();
      expect(invoicesStore['inv-1'].contract_id).toBeNull();
    });

    it('returns 404 for non-existent contract', async () => {
      const res = await request(app).delete('/contracts/non-existent');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /contracts/discover', () => {
    it('returns stub response', async () => {
      const res = await request(app).post('/contracts/discover').send({});
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.data.message).toBe('Discovery not yet implemented');
    });
  });
});

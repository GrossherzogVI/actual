import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory stores
let contractDocumentsStore: Record<string, Record<string, unknown>> = {};
let invoicesStore: Record<string, Record<string, unknown>> = {};
let contractsStore: Record<string, Record<string, unknown>> = {};

vi.mock('../account-db.js', () => {
  return {
    getAccountDb: () => ({
      first: (sql: string, params?: unknown[]) => {
        if (sql.includes('FROM contract_documents WHERE id')) {
          const id = params?.[0] as string;
          return contractDocumentsStore[id] || null;
        }
        if (sql.includes('FROM invoices WHERE id')) {
          const id = params?.[0] as string;
          return invoicesStore[id] || null;
        }
        if (sql.includes('FROM contracts WHERE LOWER')) {
          const pattern = params?.[0] as string;
          const vendor = pattern.replace(/%/g, '').toLowerCase();
          for (const contract of Object.values(contractsStore)) {
            if (
              contract.provider &&
              (contract.provider as string)
                .toLowerCase()
                .includes(vendor)
            ) {
              return { id: contract.id };
            }
          }
          return null;
        }
        return null;
      },
      all: (sql: string, params?: unknown[]) => {
        if (sql.includes('FROM contract_documents WHERE')) {
          let rows = Object.values(contractDocumentsStore);

          // Filter by file_path pattern (fileId)
          if (params && params.length > 0) {
            const pattern = params[0] as string;
            rows = rows.filter(
              r =>
                typeof r.file_path === 'string' &&
                r.file_path.includes(
                  pattern.replace(/%/g, ''),
                ),
            );
          }

          // Filter by contract_id if present
          if (
            sql.includes('contract_id = ?') &&
            params &&
            params.length > 1
          ) {
            const contractId = params[1] as string;
            rows = rows.filter(r => r.contract_id === contractId);
          }

          return rows;
        }
        if (sql.includes('FROM invoices')) {
          let rows = Object.values(invoicesStore);

          // Filter by document's file_path pattern
          if (params && params.length > 0) {
            const pattern = (params[0] as string).replace(/%/g, '');
            rows = rows.filter(r => {
              const doc = contractDocumentsStore[r.document_id as string];
              return (
                doc &&
                typeof doc.file_path === 'string' &&
                doc.file_path.includes(pattern)
              );
            });
          }

          // Filter by contract_id
          if (sql.includes('i.contract_id = ?') && params) {
            const contractId = params[1] as string;
            rows = rows.filter(r => r.contract_id === contractId);
          }

          // Filter by status
          if (sql.includes('i.status = ?') && params) {
            const statusIdx = sql.includes('i.contract_id = ?') ? 2 : 1;
            const status = params[statusIdx] as string;
            rows = rows.filter(r => r.status === status);
          }

          return rows;
        }
        return [];
      },
      mutate: (sql: string, params?: unknown[]) => {
        if (sql.includes('INSERT INTO contract_documents')) {
          const fields = [
            'id',
            'contract_id',
            'file_path',
            'file_type',
            'ocr_text',
            'uploaded_at',
          ];
          const row: Record<string, unknown> = {};
          fields.forEach((f, i) => {
            row[f] = params?.[i] ?? null;
          });
          contractDocumentsStore[row.id as string] = row;
          return { changes: 1 };
        }

        if (sql.includes('INSERT INTO invoices')) {
          const fields = [
            'id',
            'contract_id',
            'file_id',
            'amount',
            'due_date',
            'status',
            'transaction_id',
            'document_id',
            'created_at',
          ];
          const row: Record<string, unknown> = {};
          fields.forEach((f, i) => {
            row[f] = params?.[i] ?? null;
          });
          invoicesStore[row.id as string] = row;
          return { changes: 1 };
        }

        if (sql.includes('UPDATE contract_documents SET ocr_text')) {
          const id = params?.[1] as string;
          if (contractDocumentsStore[id]) {
            contractDocumentsStore[id].ocr_text = params?.[0];
          }
          return { changes: 1 };
        }

        if (sql.includes('UPDATE contract_documents SET contract_id')) {
          const id = params?.[1] as string;
          if (contractDocumentsStore[id]) {
            contractDocumentsStore[id].contract_id = params?.[0];
          }
          return { changes: 1 };
        }

        if (sql.includes('DELETE FROM contract_documents WHERE')) {
          const id = params?.[0] as string;
          delete contractDocumentsStore[id];
          return { changes: 1 };
        }

        if (sql.includes('UPDATE invoices SET transaction_id')) {
          const id = params?.[1] as string;
          if (invoicesStore[id]) {
            invoicesStore[id].transaction_id = params?.[0];
            invoicesStore[id].status = 'matched';
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

vi.mock('./ocr.js', () => ({
  extractTextFromImage: vi
    .fn()
    .mockResolvedValue('Rechnung Nr. 12345\nBetrag: 99,99 EUR'),
  extractTextFromPdf: vi
    .fn()
    .mockResolvedValue(
      'PDF text extraction not yet supported. Please convert to image format for OCR.',
    ),
}));

vi.mock('./invoice-extractor.js', () => ({
  extractInvoiceData: vi.fn().mockResolvedValue({
    vendor: 'Test GmbH',
    amount: 9999,
    dueDate: '2026-03-01',
    invoiceNumber: '12345',
    description: 'Monthly service fee',
    confidence: 0.85,
  }),
  matchContractByVendor: vi.fn().mockReturnValue(null),
}));

// Mock node:fs
const mockFiles: Record<string, Buffer> = {};
vi.mock('node:fs', () => ({
  default: {
    mkdirSync: vi.fn(),
    writeFileSync: (filePath: string, data: Buffer) => {
      mockFiles[filePath] = data;
    },
    readFileSync: (filePath: string) => {
      if (mockFiles[filePath]) return mockFiles[filePath];
      throw new Error(`File not found: ${filePath}`);
    },
    existsSync: (filePath: string) => filePath in mockFiles,
    unlinkSync: (filePath: string) => {
      delete mockFiles[filePath];
    },
  },
}));

import express from 'express';
import request from 'supertest';

import { handlers } from './app-documents.js';

function buildApp() {
  const app = express();
  app.use('/documents', handlers);
  return app;
}

describe('documents API', () => {
  let app: express.Express;

  beforeEach(() => {
    contractDocumentsStore = {};
    invoicesStore = {};
    contractsStore = {};
    // Clear mock files
    for (const key of Object.keys(mockFiles)) {
      delete mockFiles[key];
    }
    app = buildApp();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /documents/upload', () => {
    it('uploads a document and creates DB record', async () => {
      const content = Buffer.from('fake image data').toString('base64');

      const res = await request(app).post('/documents/upload').send({
        fileId: 'file-1',
        fileName: 'invoice.png',
        fileType: 'png',
        content,
      });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.file_type).toBe('png');
      expect(res.body.data.uploaded_at).toBeDefined();

      // Verify DB record was created
      const docId = res.body.data.id;
      expect(contractDocumentsStore[docId]).toBeDefined();
      expect(contractDocumentsStore[docId].file_type).toBe('png');
    });

    it('stores file on disk', async () => {
      const content = Buffer.from('test data').toString('base64');

      const res = await request(app).post('/documents/upload').send({
        fileId: 'file-1',
        fileType: 'jpg',
        content,
      });

      const filePath = res.body.data.file_path;
      expect(mockFiles[filePath]).toBeDefined();
      expect(mockFiles[filePath].toString()).toBe('test data');
    });

    it('rejects missing fileId', async () => {
      const res = await request(app).post('/documents/upload').send({
        content: 'abc',
      });

      expect(res.status).toBe(400);
      expect(res.body.reason).toBe('file-id-required');
    });

    it('rejects missing content', async () => {
      const res = await request(app).post('/documents/upload').send({
        fileId: 'file-1',
      });

      expect(res.status).toBe(400);
      expect(res.body.reason).toBe('content-required');
    });

    it('rejects invalid file type', async () => {
      const res = await request(app).post('/documents/upload').send({
        fileId: 'file-1',
        fileType: 'exe',
        content: 'abc',
      });

      expect(res.status).toBe(400);
      expect(res.body.reason).toBe('invalid-file-type');
    });

    it('links to contract when contractId is provided', async () => {
      const content = Buffer.from('data').toString('base64');

      const res = await request(app).post('/documents/upload').send({
        fileId: 'file-1',
        contractId: 'contract-1',
        fileType: 'pdf',
        content,
      });

      const docId = res.body.data.id;
      expect(contractDocumentsStore[docId].contract_id).toBe(
        'contract-1',
      );
    });
  });

  describe('GET /documents', () => {
    beforeEach(async () => {
      const content = Buffer.from('data').toString('base64');
      await request(app).post('/documents/upload').send({
        fileId: 'file-1',
        fileType: 'png',
        content,
      });
      await request(app).post('/documents/upload').send({
        fileId: 'file-1',
        contractId: 'contract-1',
        fileType: 'jpg',
        content,
      });
      await request(app).post('/documents/upload').send({
        fileId: 'file-2',
        fileType: 'pdf',
        content,
      });
    });

    it('requires fileId', async () => {
      const res = await request(app).get('/documents');
      expect(res.status).toBe(400);
      expect(res.body.reason).toBe('file-id-required');
    });

    it('lists documents for a given file', async () => {
      const res = await request(app).get('/documents?fileId=file-1');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
    });

    it('filters by contractId', async () => {
      const res = await request(app).get(
        '/documents?fileId=file-1&contractId=contract-1',
      );
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].contract_id).toBe('contract-1');
    });
  });

  describe('GET /documents/:id', () => {
    it('returns a single document', async () => {
      const content = Buffer.from('data').toString('base64');
      const uploadRes = await request(app)
        .post('/documents/upload')
        .send({
          fileId: 'file-1',
          fileType: 'png',
          content,
        });
      const id = uploadRes.body.data.id;

      const res = await request(app).get(`/documents/${id}`);
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(id);
    });

    it('returns 404 for non-existent document', async () => {
      const res = await request(app).get('/documents/non-existent');
      expect(res.status).toBe(404);
      expect(res.body.reason).toBe('not-found');
    });
  });

  describe('DELETE /documents/:id', () => {
    it('deletes document from DB and disk', async () => {
      const content = Buffer.from('data').toString('base64');
      const uploadRes = await request(app)
        .post('/documents/upload')
        .send({
          fileId: 'file-1',
          fileType: 'png',
          content,
        });
      const id = uploadRes.body.data.id;
      const filePath = uploadRes.body.data.file_path;

      // Verify file exists
      expect(mockFiles[filePath]).toBeDefined();

      const res = await request(app).delete(`/documents/${id}`);
      expect(res.status).toBe(200);
      expect(res.body.data.deleted).toBe(true);

      // Verify DB record removed
      expect(contractDocumentsStore[id]).toBeUndefined();

      // Verify file removed from disk
      expect(mockFiles[filePath]).toBeUndefined();
    });

    it('returns 404 for non-existent document', async () => {
      const res = await request(app).delete('/documents/non-existent');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /documents/:id/process', () => {
    it('runs OCR and extracts invoice data', async () => {
      const content = Buffer.from('fake image').toString('base64');
      const uploadRes = await request(app)
        .post('/documents/upload')
        .send({
          fileId: 'file-1',
          fileType: 'png',
          content,
        });
      const id = uploadRes.body.data.id;

      const res = await request(app)
        .post(`/documents/${id}/process`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.data.ocrText).toBe(
        'Rechnung Nr. 12345\nBetrag: 99,99 EUR',
      );
      expect(res.body.data.extractedData.vendor).toBe('Test GmbH');
      expect(res.body.data.extractedData.amount).toBe(9999);
      expect(res.body.data.invoiceId).toBeDefined();

      // Verify OCR text was stored
      expect(contractDocumentsStore[id].ocr_text).toBe(
        'Rechnung Nr. 12345\nBetrag: 99,99 EUR',
      );

      // Verify invoice was created
      const invoiceId = res.body.data.invoiceId;
      expect(invoicesStore[invoiceId]).toBeDefined();
      expect(invoicesStore[invoiceId].amount).toBe(9999);
      expect(invoicesStore[invoiceId].status).toBe('pending');
      expect(invoicesStore[invoiceId].document_id).toBe(id);
    });

    it('returns 404 for non-existent document', async () => {
      const res = await request(app)
        .post('/documents/non-existent/process')
        .send({});

      expect(res.status).toBe(404);
    });
  });

  describe('POST /documents/invoices/:id/match', () => {
    it('matches invoice to transaction', async () => {
      // Create a document and process it to get an invoice
      const content = Buffer.from('fake image').toString('base64');
      const uploadRes = await request(app)
        .post('/documents/upload')
        .send({
          fileId: 'file-1',
          fileType: 'png',
          content,
        });
      const docId = uploadRes.body.data.id;

      const processRes = await request(app)
        .post(`/documents/${docId}/process`)
        .send({});

      const invoiceId = processRes.body.data.invoiceId;

      const res = await request(app)
        .post(`/documents/invoices/${invoiceId}/match`)
        .send({ transactionId: 'txn-123' });

      expect(res.status).toBe(200);
      expect(res.body.data.transaction_id).toBe('txn-123');
      expect(res.body.data.status).toBe('matched');
    });

    it('rejects missing transactionId', async () => {
      const res = await request(app)
        .post('/documents/invoices/some-id/match')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.reason).toBe('transaction-id-required');
    });

    it('returns 404 for non-existent invoice', async () => {
      const res = await request(app)
        .post('/documents/invoices/non-existent/match')
        .send({ transactionId: 'txn-1' });

      expect(res.status).toBe(404);
    });
  });

  describe('GET /documents/invoices', () => {
    it('lists invoices for a file', async () => {
      // Upload and process a document to create an invoice
      const content = Buffer.from('fake image').toString('base64');
      const uploadRes = await request(app)
        .post('/documents/upload')
        .send({
          fileId: 'file-1',
          fileType: 'png',
          content,
        });
      const docId = uploadRes.body.data.id;

      await request(app)
        .post(`/documents/${docId}/process`)
        .send({});

      const res = await request(app).get(
        '/documents/invoices?fileId=file-1',
      );

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].amount).toBe(9999);
    });

    it('requires fileId', async () => {
      const res = await request(app).get('/documents/invoices');
      expect(res.status).toBe(400);
      expect(res.body.reason).toBe('file-id-required');
    });
  });
});

import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';

import { getAccountDb } from '../account-db.js';
import {
  requestLoggerMiddleware,
  validateSessionMiddleware,
} from '../util/middlewares.js';

import { extractTextFromImage, extractTextFromPdf } from './ocr.js';
import {
  extractInvoiceData,
  matchContractByVendor,
} from './invoice-extractor.js';

const app = express();

export { app as handlers };
app.use(express.json({ limit: '20mb' }));
app.use(requestLoggerMiddleware);
app.use(validateSessionMiddleware);

const VALID_FILE_TYPES = ['pdf', 'png', 'jpg', 'jpeg'] as const;

function getDocumentsDir(fileId: string): string {
  const base = path.join(
    process.env.ACTUAL_DATA_DIR || '/tmp',
    'documents',
    fileId,
  );
  fs.mkdirSync(base, { recursive: true });
  return base;
}

function getExtension(fileType: string): string {
  return fileType === 'jpeg' ? 'jpg' : fileType;
}

/** POST /documents/upload — Upload a document (JSON with base64 content) */
app.post('/upload', (req, res) => {
  const { fileId, contractId, fileName, fileType, content } = req.body || {};

  if (!fileId) {
    res.status(400).json({ status: 'error', reason: 'file-id-required' });
    return;
  }

  if (!content) {
    res.status(400).json({ status: 'error', reason: 'content-required' });
    return;
  }

  const normalizedType = (fileType || 'pdf').toLowerCase();
  if (
    !VALID_FILE_TYPES.includes(
      normalizedType as (typeof VALID_FILE_TYPES)[number],
    )
  ) {
    res.status(400).json({ status: 'error', reason: 'invalid-file-type' });
    return;
  }

  const id = uuidv4();
  const ext = getExtension(normalizedType);
  const dir = getDocumentsDir(fileId);
  const filePath = path.join(dir, `${id}.${ext}`);

  const buffer = Buffer.from(content, 'base64');
  fs.writeFileSync(filePath, buffer);

  const db = getAccountDb();
  const uploadedAt = new Date().toISOString();

  db.mutate(
    `INSERT INTO contract_documents (id, contract_id, file_path, file_type, ocr_text, uploaded_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, contractId || null, filePath, normalizedType, null, uploadedAt],
  );

  res.json({
    status: 'ok',
    data: {
      id,
      file_path: filePath,
      file_type: normalizedType,
      file_name: fileName || `${id}.${ext}`,
      uploaded_at: uploadedAt,
    },
  });
});

/** GET /documents — List documents */
app.get('/', (req, res) => {
  const { fileId, contractId } = req.query;

  if (!fileId) {
    res.status(400).json({ status: 'error', reason: 'file-id-required' });
    return;
  }

  const db = getAccountDb();
  const conditions = ['file_path LIKE ?'];
  const params: unknown[] = [`%/documents/${fileId}/%`];

  if (contractId) {
    conditions.push('contract_id = ?');
    params.push(contractId);
  }

  const rows = db.all(
    `SELECT * FROM contract_documents WHERE ${conditions.join(' AND ')} ORDER BY uploaded_at DESC`,
    params,
  );

  res.json({ status: 'ok', data: rows });
});

/** GET /documents/invoices — List invoices (must be before /:id) */
app.get('/invoices', (req, res) => {
  const { fileId, contractId, status } = req.query;

  if (!fileId) {
    res.status(400).json({ status: 'error', reason: 'file-id-required' });
    return;
  }

  const db = getAccountDb();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (contractId) {
    conditions.push('i.contract_id = ?');
    params.push(contractId);
  }

  if (status) {
    conditions.push('i.status = ?');
    params.push(status);
  }

  const where = conditions.length ? 'AND ' + conditions.join(' AND ') : '';

  const rows = db.all(
    `SELECT i.* FROM invoices i
     LEFT JOIN contract_documents cd ON i.document_id = cd.id
     WHERE cd.file_path LIKE ? ${where}
     ORDER BY i.created_at DESC`,
    [`%/documents/${fileId}/%`, ...params],
  );

  res.json({ status: 'ok', data: rows });
});

/** POST /documents/invoices/:id/match — Match invoice to transaction (must be before /:id) */
app.post('/invoices/:id/match', (req, res) => {
  const { transactionId } = req.body || {};

  if (!transactionId) {
    res
      .status(400)
      .json({ status: 'error', reason: 'transaction-id-required' });
    return;
  }

  const db = getAccountDb();
  const row = db.first('SELECT * FROM invoices WHERE id = ?', [
    req.params.id,
  ]);

  if (!row) {
    res.status(404).json({ status: 'error', reason: 'not-found' });
    return;
  }

  db.mutate(
    `UPDATE invoices SET transaction_id = ?, status = 'matched' WHERE id = ?`,
    [transactionId, req.params.id],
  );

  const updated = db.first('SELECT * FROM invoices WHERE id = ?', [
    req.params.id,
  ]);

  res.json({ status: 'ok', data: updated });
});

/** GET /documents/:id — Get a single document */
app.get('/:id', (req, res) => {
  const db = getAccountDb();
  const row = db.first('SELECT * FROM contract_documents WHERE id = ?', [
    req.params.id,
  ]);

  if (!row) {
    res.status(404).json({ status: 'error', reason: 'not-found' });
    return;
  }

  res.json({ status: 'ok', data: row });
});

/** DELETE /documents/:id — Delete document from disk and DB */
app.delete('/:id', (req, res) => {
  const db = getAccountDb();
  const row = db.first('SELECT * FROM contract_documents WHERE id = ?', [
    req.params.id,
  ]) as { id: string; file_path: string } | null;

  if (!row) {
    res.status(404).json({ status: 'error', reason: 'not-found' });
    return;
  }

  // Remove file from disk
  if (row.file_path && fs.existsSync(row.file_path)) {
    fs.unlinkSync(row.file_path);
  }

  // Remove DB record
  db.mutate('DELETE FROM contract_documents WHERE id = ?', [req.params.id]);

  res.json({ status: 'ok', data: { deleted: true } });
});

/** POST /documents/:id/process — Run OCR + invoice extraction */
app.post('/:id/process', async (req, res) => {
  try {
    const db = getAccountDb();
    const row = db.first('SELECT * FROM contract_documents WHERE id = ?', [
      req.params.id,
    ]) as {
      id: string;
      contract_id: string | null;
      file_path: string;
      file_type: string;
    } | null;

    if (!row) {
      res.status(404).json({ status: 'error', reason: 'not-found' });
      return;
    }

    if (!fs.existsSync(row.file_path)) {
      res
        .status(404)
        .json({ status: 'error', reason: 'file-not-found-on-disk' });
      return;
    }

    const fileBuffer = fs.readFileSync(row.file_path);
    let ocrText: string;

    if (row.file_type === 'pdf') {
      ocrText = await extractTextFromPdf(fileBuffer);
    } else {
      const base64 = fileBuffer.toString('base64');
      ocrText = await extractTextFromImage(base64);
    }

    // Store OCR text
    db.mutate('UPDATE contract_documents SET ocr_text = ? WHERE id = ?', [
      ocrText,
      row.id,
    ]);

    // Extract invoice data
    const extractedData = await extractInvoiceData(ocrText);

    // Auto-match contract by vendor if no contract is linked
    let contractId = row.contract_id;
    if (!contractId && extractedData.vendor) {
      contractId = matchContractByVendor(extractedData.vendor);
      if (contractId) {
        db.mutate(
          'UPDATE contract_documents SET contract_id = ? WHERE id = ?',
          [contractId, row.id],
        );
      }
    }

    // Create invoice record
    let invoiceId: string | null = null;
    if (extractedData.amount != null) {
      invoiceId = uuidv4();
      const createdAt = new Date().toISOString();
      db.mutate(
        `INSERT INTO invoices (id, contract_id, file_id, amount, due_date, status, transaction_id, document_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          invoiceId,
          contractId || null,
          null,
          extractedData.amount,
          extractedData.dueDate || null,
          'pending',
          null,
          row.id,
          createdAt,
        ],
      );
    }

    res.json({
      status: 'ok',
      data: { ocrText, extractedData, invoiceId },
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      reason: err instanceof Error ? err.message : 'processing-failed',
    });
  }
});


import { db, connect } from '../../core/api/surreal-client';

import type { MatchCandidate, Receipt } from './types';

// -- Receipts --

export async function listReceipts(opts?: {
  status?: string;
  limit?: number;
  start?: number;
}): Promise<Receipt[]> {
  await connect();
  const limit = opts?.limit ?? 50;
  const start = opts?.start ?? 0;

  let where = 'true';
  const params: Record<string, unknown> = { limit, start };

  if (opts?.status) {
    where += ' AND status = $status';
    params.status = opts.status;
  }

  const [rows] = await db.query<[Receipt[]]>(
    `SELECT id, file_name, file_type, status, extracted_amount, extracted_date,
       extracted_vendor, extracted_items, transaction_link, confidence,
       created_at, updated_at
     FROM receipt WHERE ${where} ORDER BY created_at DESC LIMIT $limit START $start`,
    params,
  );
  return rows ?? [];
}

export async function getReceipt(id: string): Promise<Receipt | null> {
  await connect();
  const [rows] = await db.query<[Receipt[]]>(
    `SELECT * FROM $id`,
    { id },
  );
  return rows?.[0] ?? null;
}

export async function createReceipt(data: {
  image_data: string;
  file_name: string;
  file_type: string;
}): Promise<Receipt> {
  await connect();
  const [rows] = await db.query<[Receipt[]]>(
    `CREATE receipt SET
      image_data = $image_data,
      file_name = $file_name,
      file_type = $file_type,
      status = 'pending',
      created_at = time::now(),
      updated_at = time::now()
    RETURN AFTER`,
    data,
  );
  const result = rows?.[0];
  if (!result) throw new Error('Expected receipt record but got empty result');
  return result;
}

export async function updateReceipt(
  id: string,
  data: Partial<Pick<Receipt, 'extracted_amount' | 'extracted_date' | 'extracted_vendor' | 'extracted_items' | 'status'>>,
): Promise<Receipt> {
  await connect();
  const sets: string[] = ['updated_at = time::now()'];
  const params: Record<string, unknown> = { id };

  if (data.extracted_amount !== undefined) {
    sets.push('extracted_amount = $extracted_amount');
    params.extracted_amount = data.extracted_amount;
  }
  if (data.extracted_date !== undefined) {
    sets.push('extracted_date = $extracted_date');
    params.extracted_date = data.extracted_date;
  }
  if (data.extracted_vendor !== undefined) {
    sets.push('extracted_vendor = $extracted_vendor');
    params.extracted_vendor = data.extracted_vendor;
  }
  if (data.extracted_items !== undefined) {
    sets.push('extracted_items = $extracted_items');
    params.extracted_items = data.extracted_items;
  }
  if (data.status !== undefined) {
    sets.push('status = $status');
    params.status = data.status;
  }

  const [rows] = await db.query<[Receipt[]]>(
    `UPDATE $id SET ${sets.join(', ')} RETURN AFTER`,
    params,
  );
  const result = rows?.[0];
  if (!result) throw new Error('Expected receipt record but got empty result');
  return result;
}

export async function deleteReceipt(id: string): Promise<void> {
  await connect();
  await db.query('DELETE $id', { id });
}

export async function enqueueOcrJob(receiptId: string): Promise<void> {
  await connect();
  await db.query(
    `CREATE job_queue SET
      name = 'ocr-receipt',
      payload = { receipt_id: $receiptId },
      status = 'pending',
      attempt = 0,
      visible_at = time::now(),
      created_at = time::now()`,
    { receiptId },
  );
}

export async function linkReceiptToTransaction(
  receiptId: string,
  transactionId: string,
): Promise<Receipt> {
  await connect();
  const [rows] = await db.query<[Receipt[]]>(
    `UPDATE $id SET transaction_link = $txn, status = 'matched', updated_at = time::now() RETURN AFTER`,
    { id: receiptId, txn: transactionId },
  );
  const result = rows?.[0];
  if (!result) throw new Error('Expected receipt record but got empty result');
  return result;
}

export async function findMatchCandidates(
  amount: number,
  date?: string,
): Promise<MatchCandidate[]> {
  await connect();
  const tolerance = 0.02;
  const minAmount = amount - tolerance;
  const maxAmount = amount + tolerance;

  let dateFilter = '';
  const params: Record<string, unknown> = { minAmount, maxAmount };

  if (date) {
    // Match within 7 days of the receipt date
    dateFilter = ' AND date >= $dateStart AND date <= $dateEnd';
    const d = new Date(date);
    const start = new Date(d);
    start.setDate(start.getDate() - 7);
    const end = new Date(d);
    end.setDate(end.getDate() + 7);
    params.dateStart = start.toISOString().split('T')[0];
    params.dateEnd = end.toISOString().split('T')[0];
  }

  const [rows] = await db.query<[MatchCandidate[]]>(
    `SELECT id, date, amount, payee.name AS payee_name, notes
     FROM transaction
     WHERE math::abs(amount) >= $minAmount AND math::abs(amount) <= $maxAmount${dateFilter}
     ORDER BY date DESC
     LIMIT 10`,
    params,
  );
  return rows ?? [];
}

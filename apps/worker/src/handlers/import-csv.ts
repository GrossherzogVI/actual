import type Surreal from 'surrealdb';

import type { ParsedRow, WorkerConfig } from '../types';

function nowIso(): string {
  return new Date().toISOString();
}

/** Check if a transaction with the same date+amount+payee already exists (±1 day). */
async function isDuplicate(
  db: Surreal,
  row: ParsedRow,
  accountId: string,
): Promise<boolean> {
  const [results] = await db.query<[{ count: number }[]]>(
    `SELECT count() AS count FROM transaction
     WHERE account = $account
       AND amount = $amount
       AND payee.name = $payee
       AND date >= $dateMin
       AND date <= $dateMax
     GROUP ALL`,
    {
      account: accountId,
      amount: row.amount,
      payee: row.payee,
      // ±1 day window to catch off-by-one-day banking differences
      dateMin: row.date + 'T00:00:00Z',
      dateMax: row.date + 'T23:59:59Z',
    },
  );
  return (results?.[0]?.count ?? 0) > 0;
}

/** Find or create a payee record by name. Returns the record ID. */
async function upsertPayee(db: Surreal, name: string, iban?: string): Promise<string> {
  const [existing] = await db.query<[{ id: string }[]]>(
    `SELECT id FROM payee WHERE name = $name LIMIT 1`,
    { name },
  );

  if (existing?.[0]?.id) {
    // Update IBAN if we now know it
    if (iban) {
      await db.query(
        `UPDATE $id SET iban = $iban`,
        { id: existing[0].id, iban },
      );
    }
    return existing[0].id;
  }

  const [created] = await db.query<[{ id: string }[]]>(
    `CREATE payee SET name = $name, iban = $iban, created_at = time::now() RETURN id`,
    { name, iban: iban ?? null },
  );
  const record = created?.[0];
  if (!record?.id) throw new Error('Failed to create payee: no record returned');
  return record.id;
}

/** Enqueue a classify-transaction job for AI categorization. */
async function enqueueClassify(db: Surreal, transactionId: string): Promise<void> {
  await db.query(
    `CREATE job_queue SET
      name = 'classify-transaction',
      payload = { transaction_id: $txn },
      status = 'pending',
      attempt = 0,
      visible_at = time::now(),
      created_at = time::now()`,
    { txn: transactionId },
  );
}

export async function handleImportCsv(
  db: Surreal,
  _config: WorkerConfig,
  payload: Record<string, unknown>,
): Promise<void> {
  const batchId = String(payload.batch_id ?? '');
  const accountId = String(payload.account_id ?? '');
  const rows = (payload.rows as ParsedRow[] | undefined) ?? [];

  if (!batchId || !accountId) {
    throw new Error('import-csv: missing batch_id or account_id');
  }
  if (rows.length === 0) {
    await db.query(
      `UPDATE $id SET status = 'completed', completed_at = time::now(),
       processed_count = 0, duplicate_count = 0, error_count = 0`,
      { id: batchId },
    );
    return;
  }

  console.log(
    `[${nowIso()}][import-csv] batch=${batchId} account=${accountId} rows=${rows.length}`,
  );

  // Update batch to 'processing'
  await db.query(
    `UPDATE $id SET status = 'processing', started_at = time::now()`,
    { id: batchId },
  );

  let processed = 0;
  let duplicates = 0;
  let errors = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;

    try {
      // 1. Duplicate check
      const dup = await isDuplicate(db, row, accountId);
      if (dup) {
        duplicates++;
        continue;
      }

      // 2. Find or create payee
      const payeeId = await upsertPayee(db, row.payee, row.iban);

      // 3. Create transaction
      const [created] = await db.query<[{ id: string }[]]>(
        `CREATE transaction SET
          account    = $account,
          payee      = $payee,
          amount     = $amount,
          date       = <datetime>$date,
          notes      = $notes,
          reference  = $reference,
          imported   = true,
          import_batch = $batch,
          cleared    = false,
          reconciled = false,
          ai_classified = false,
          created_at = time::now(),
          updated_at = time::now()
        RETURN id`,
        {
          account: accountId,
          payee: payeeId,
          amount: row.amount,
          date: row.date + 'T00:00:00Z',
          notes: row.notes || null,
          reference: row.reference || null,
          batch: batchId,
        },
      );

      const txnId = created?.[0]?.id;
      if (!txnId) throw new Error('Transaction insert returned no id');

      // 4. Enqueue AI classification
      await enqueueClassify(db, txnId);

      processed++;
    } catch (err) {
      errors++;
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[${nowIso()}][import-csv] row ${i + 1}/${rows.length} error: ${message}`,
      );

      // Store per-row error on batch for debugging
      await db.query(
        `UPDATE $id SET row_errors = array::append(row_errors ?? [], $e)`,
        { id: batchId, e: { row: i + 1, payee: row.payee, date: row.date, error: message } },
      );
    }

    // Progress heartbeat every 50 rows
    if ((i + 1) % 50 === 0 || i === rows.length - 1) {
      await db.query(
        `UPDATE $id SET processed_count = $p, duplicate_count = $d, error_count = $e`,
        { id: batchId, p: processed, d: duplicates, e: errors },
      );
      console.log(
        `[${nowIso()}][import-csv] batch=${batchId} progress=${i + 1}/${rows.length} ` +
        `processed=${processed} duplicates=${duplicates} errors=${errors}`,
      );
    }
  }

  // Final status update
  const status = errors > 0 && processed === 0 ? 'failed' : 'completed';
  await db.query(
    `UPDATE $id SET
      status = $status,
      completed_at = time::now(),
      processed_count = $p,
      duplicate_count = $d,
      error_count = $e`,
    { id: batchId, status, p: processed, d: duplicates, e: errors },
  );

  console.log(
    `[${nowIso()}][import-csv] batch=${batchId} done status=${status} ` +
    `processed=${processed} duplicates=${duplicates} errors=${errors}`,
  );
}

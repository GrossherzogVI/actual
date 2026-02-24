import { connect, db } from '../../core/api/surreal-client';
import type { SepaPayment, SepaBatch, SepaPaymentDraft } from './types';

export async function listSepaPayments(): Promise<SepaPayment[]> {
  await connect();
  const result = await db.query<[SepaPayment[]]>(
    'SELECT * FROM sepa_payment ORDER BY created_at DESC',
  );
  return result[0] ?? [];
}

export async function createSepaPayment(draft: SepaPaymentDraft): Promise<SepaPayment> {
  await connect();
  const result = await db.query<[SepaPayment[]]>(
    `CREATE sepa_payment CONTENT {
      payee_name: $payee_name,
      iban: $iban,
      bic: $bic,
      amount: $amount,
      reference: $reference,
      execution_date: $execution_date,
      status: $status,
      contract: $contract,
      created_at: time::now()
    }`,
    draft,
  );
  const record = result[0]?.[0];
  if (!record) throw new Error('Failed to create SEPA payment: no record returned');
  return record;
}

export async function createSepaBatch(
  paymentIds: string[],
  xmlData: string,
  totalAmount: number,
): Promise<SepaBatch> {
  await connect();
  const name = `SEPA ${new Date().toLocaleDateString('de-DE')}`;

  const batch = await db.query<[SepaBatch[]]>(
    `CREATE sepa_batch CONTENT {
      name: $name,
      total_amount: $total_amount,
      payment_count: $count,
      xml_data: $xml_data,
      status: 'exported',
      created_at: time::now()
    }`,
    { name, total_amount: totalAmount, count: paymentIds.length, xml_data: xmlData },
  );

  const batchRecord = batch[0]?.[0];
  if (!batchRecord) throw new Error('Failed to create SEPA batch: no record returned');

  // Update all payments to reference this batch
  if (paymentIds.length > 0) {
    await db.query(
      `UPDATE sepa_payment SET batch_id = $batch_id, status = 'exported' WHERE id IN $ids`,
      { batch_id: batchRecord.id, ids: paymentIds },
    );
  }

  return batchRecord;
}

export async function deleteSepaPayment(id: string): Promise<void> {
  await connect();
  await db.query('DELETE $id', { id });
}

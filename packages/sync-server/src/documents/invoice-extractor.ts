import { isOllamaEnabled, ollamaChat } from '../ai/ollama-client.js';
import { getAccountDb } from '../account-db.js';

export type ExtractedInvoiceData = {
  vendor: string | null;
  amount: number | null; // cents
  dueDate: string | null; // YYYY-MM-DD
  invoiceNumber: string | null;
  description: string | null;
  confidence: number; // 0-1
};

const SYSTEM_PROMPT = `You are a German invoice parser. Extract the following fields from the provided invoice text:
- vendor: The company or person who issued the invoice
- amount: The total amount in cents (e.g. 19.99 EUR = 1999)
- dueDate: The payment due date in YYYY-MM-DD format
- invoiceNumber: The invoice/receipt number
- description: A brief description of what the invoice is for
- confidence: Your confidence in the extraction accuracy from 0 to 1

Return a JSON object with these exact field names. Use null for fields you cannot determine.`;

export async function extractInvoiceData(
  ocrText: string,
): Promise<ExtractedInvoiceData> {
  if (!isOllamaEnabled()) {
    throw new Error('Ollama AI features are not enabled');
  }

  const response = await ollamaChat(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: ocrText },
    ],
    {
      temperature: 0.1,
      format: 'json',
    },
  );

  const parsed = JSON.parse(response);

  return {
    vendor: parsed.vendor ?? null,
    amount:
      parsed.amount != null ? Math.round(Number(parsed.amount)) : null,
    dueDate: parsed.dueDate ?? parsed.due_date ?? null,
    invoiceNumber:
      parsed.invoiceNumber ?? parsed.invoice_number ?? null,
    description: parsed.description ?? null,
    confidence:
      parsed.confidence != null
        ? Math.min(1, Math.max(0, Number(parsed.confidence)))
        : 0,
  };
}

export function matchContractByVendor(vendor: string): string | null {
  if (!vendor) return null;

  const db = getAccountDb();
  const row = db.first(
    `SELECT id FROM contracts WHERE LOWER(provider) LIKE LOWER(?) LIMIT 1`,
    [`%${vendor}%`],
  ) as { id: string } | null;

  return row?.id ?? null;
}

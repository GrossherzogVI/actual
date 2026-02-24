import type Surreal from 'surrealdb';
import { type Worker, createWorker } from 'tesseract.js';

import type { WorkerConfig } from '../types';

type ReceiptRecord = {
  id: string;
  image_data: string;
  file_name: string;
  file_type: string;
  status: string;
};

type ParsedExtraction = {
  amount: number | null;
  date: string | null;
  vendor: string | null;
  items: { name: string; price: number }[];
};

type TransactionCandidate = {
  id: string;
  date: string;
  amount: number;
  payee_name?: string;
};

// ── Tesseract OCR step ────────────────────────────────────────────────────

let persistentWorker: Worker | null = null;

async function getTesseractWorker(): Promise<Worker> {
  if (!persistentWorker) {
    persistentWorker = await createWorker('deu');
  }
  return persistentWorker;
}

/** Call this during graceful shutdown to clean up the Tesseract worker. */
export async function terminateOcrWorker(): Promise<void> {
  if (persistentWorker) {
    await persistentWorker.terminate();
    persistentWorker = null;
  }
}

async function extractTextFromImage(base64Data: string): Promise<string> {
  const worker = await getTesseractWorker();
  const imageBuffer = Buffer.from(base64Data, 'base64');
  const { data } = await worker.recognize(imageBuffer);
  return data.text;
}

// ── LLM extraction step ──────────────────────────────────────────────────

function buildExtractionPrompt(rawText: string): string {
  return `Du bist ein Beleg-Parser. Extrahiere aus dem folgenden OCR-Text:
- Betrag (Gesamtsumme in EUR)
- Datum (ISO format YYYY-MM-DD)
- Händler (Firmenname)
- Einzelposten (Liste der Positionen mit Preis)

OCR-Text:
${rawText}

Antworte NUR als valides JSON, keine Erklärungen:
{"amount": number, "date": "YYYY-MM-DD", "vendor": "string", "items": [{"name": "string", "price": number}]}

WICHTIG:
- Beträge als Dezimalzahlen mit Punkt (nicht Komma)
- Falls ein Feld nicht erkennbar ist, setze null
- Einzelposten nur auflisten wenn klar erkennbar
- Gib NUR das JSON zurück`;
}

function parseLlmResponse(raw: string): ParsedExtraction {
  try {
    // Strip markdown code fences if present
    const cleaned = raw.replace(/```json?\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
      amount: typeof parsed.amount === 'number'
        ? parsed.amount
        : parseFloat(String(parsed.amount ?? '').replace(',', '.')) || null,
      date: parsed.date ?? null,
      vendor: parsed.vendor ?? null,
      items: Array.isArray(parsed.items)
        ? parsed.items.map((item: { name?: string; price?: number }) => ({
            name: item.name ?? 'Unbekannt',
            price: item.price ?? 0,
          }))
        : [],
    };
  } catch {
    // Fallback: try extracting key-value pairs from plain text
    const result: ParsedExtraction = {
      amount: null,
      date: null,
      vendor: null,
      items: [],
    };

    const amountMatch = raw.match(/"?amount"?\s*:\s*([0-9]+[.,][0-9]{2})/);
    if (amountMatch) {
      result.amount = parseFloat(amountMatch[1].replace(',', '.'));
    }

    const dateMatch = raw.match(/"?date"?\s*:\s*"?(\d{4}-\d{2}-\d{2})"?/);
    if (dateMatch) {
      result.date = dateMatch[1];
    }

    const vendorMatch = raw.match(/"?vendor"?\s*:\s*"([^"]+)"/);
    if (vendorMatch) {
      result.vendor = vendorMatch[1].trim();
    }

    return result;
  }
}

// ── Main handler ─────────────────────────────────────────────────────────

export async function handleOcrReceipt(
  db: Surreal,
  config: WorkerConfig,
  payload: Record<string, unknown>,
): Promise<void> {
  const receiptId = String(payload.receipt_id ?? '');
  if (!receiptId) {
    console.error('[worker:ocr] missing receipt_id in payload');
    return;
  }

  // Fetch receipt record
  const [receipts] = await db.query<[ReceiptRecord[]]>(
    `SELECT * FROM $id`,
    { id: receiptId },
  );
  const receipt = receipts?.[0];
  if (!receipt) {
    console.error(`[worker:ocr] receipt not found: ${receiptId}`);
    return;
  }

  if (!receipt.image_data) {
    await db.query(
      `UPDATE $id SET status = 'failed', raw_ocr_response = 'Keine Bilddaten vorhanden', updated_at = time::now()`,
      { id: receiptId },
    );
    return;
  }

  // Mark as processing
  await db.query(
    `UPDATE $id SET status = 'processing', updated_at = time::now()`,
    { id: receiptId },
  );

  try {
    // Step 1: Tesseract OCR — image → raw text
    console.log(`[worker:ocr] step 1/2 — Tesseract OCR for ${receiptId}`);
    const rawText = await extractTextFromImage(receipt.image_data);

    if (!rawText.trim()) {
      await db.query(
        `UPDATE $id SET status = 'failed', raw_ocr_response = 'Tesseract konnte keinen Text erkennen', updated_at = time::now()`,
        { id: receiptId },
      );
      return;
    }

    // Step 2: Ollama mistral-small — raw text → structured fields
    console.log(`[worker:ocr] step 2/2 — LLM extraction for ${receiptId} (${rawText.length} chars)`);
    const prompt = buildExtractionPrompt(rawText);

    const response = await fetch(`${config.ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OLLAMA_MODEL || 'mistral-small',
        prompt,
        stream: false,
        options: { temperature: 0.1, num_predict: 500 },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama returned ${response.status}: ${await response.text()}`);
    }

    const result = await response.json() as { response: string };
    const llmResponse = result.response.trim();

    // Parse structured extraction
    const extraction = parseLlmResponse(llmResponse);

    // Compute confidence based on how many fields were extracted
    let fieldsFound = 0;
    if (extraction.amount != null) fieldsFound++;
    if (extraction.date != null) fieldsFound++;
    if (extraction.vendor != null) fieldsFound++;
    if (extraction.items.length > 0) fieldsFound++;
    const confidence = fieldsFound / 4;

    // Store both OCR text and LLM response for debugging
    const combinedRaw = `--- Tesseract OCR ---\n${rawText}\n\n--- LLM Extraction ---\n${llmResponse}`;

    // Map to receipt schema fields
    const extractedItems = extraction.items.map(item => ({
      name: item.name,
      amount: item.price,
    }));

    // Update receipt with extracted data
    await db.query(
      `UPDATE $id SET
        status = 'processed',
        extracted_amount = $amount,
        extracted_date = $date,
        extracted_vendor = $vendor,
        extracted_items = $items,
        confidence = $confidence,
        raw_ocr_response = $raw,
        updated_at = time::now()`,
      {
        id: receiptId,
        amount: extraction.amount,
        date: extraction.date,
        vendor: extraction.vendor,
        items: extractedItems,
        confidence,
        raw: combinedRaw,
      },
    );

    console.log(
      `[worker:ocr] processed ${receiptId} — vendor=${extraction.vendor ?? '?'} amount=${extraction.amount ?? '?'} confidence=${confidence}`,
    );

    // Auto-match if confidence is high enough
    if (confidence > 0.8 && extraction.amount != null) {
      await attemptAutoMatch(db, receiptId, extraction.amount, extraction.date);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[worker:ocr] failed for ${receiptId}: ${message}`);

    await db.query(
      `UPDATE $id SET status = 'failed', raw_ocr_response = $error, updated_at = time::now()`,
      { id: receiptId, error: message },
    );
  }
}

// ── Auto-match ───────────────────────────────────────────────────────────

async function attemptAutoMatch(
  db: Surreal,
  receiptId: string,
  amount: number,
  date: string | null,
): Promise<void> {
  const tolerance = 0.02;
  const absAmount = Math.abs(amount);

  let dateFilter = '';
  const params: Record<string, unknown> = {
    minAmount: absAmount - tolerance,
    maxAmount: absAmount + tolerance,
  };

  if (date) {
    dateFilter = ' AND date >= $dateStart AND date <= $dateEnd';
    const d = new Date(date);
    const start = new Date(d);
    start.setDate(start.getDate() - 7);
    const end = new Date(d);
    end.setDate(end.getDate() + 7);
    params.dateStart = start.toISOString().split('T')[0];
    params.dateEnd = end.toISOString().split('T')[0];
  }

  const [candidates] = await db.query<[TransactionCandidate[]]>(
    `SELECT id, date, amount, payee.name AS payee_name
     FROM transaction
     WHERE math::abs(amount) >= $minAmount AND math::abs(amount) <= $maxAmount${dateFilter}
     ORDER BY date DESC
     LIMIT 1`,
    params,
  );

  const match = candidates?.[0];
  if (match) {
    await db.query(
      `UPDATE $id SET transaction_link = $txn, status = 'matched', updated_at = time::now()`,
      { id: receiptId, txn: match.id },
    );
    console.log(
      `[worker:ocr] auto-matched ${receiptId} → ${match.id} (${match.payee_name ?? 'unknown'}, ${match.amount} EUR)`,
    );
  }
}

import express from 'express';

import {
  requestLoggerMiddleware,
  validateSessionMiddleware,
} from '../util/middlewares.js';

const app = express();

export { app as handlers };
app.use(express.json());
app.use(requestLoggerMiddleware);
app.use(validateSessionMiddleware);

// Supported German bank CSV formats with their column mappings
const BANK_FORMATS = [
  {
    id: 'dkb',
    name: 'DKB (Deutsche Kreditbank)',
    encoding: 'ISO-8859-1',
    delimiter: ';',
    skip_rows: 4,
    columns: {
      date: 'Buchungstag',
      payee: 'Gläubiger-ID',
      amount: 'Betrag (EUR)',
      iban: 'Gläubiger-ID',
      notes: 'Verwendungszweck',
    },
    date_format: 'DD.MM.YYYY',
  },
  {
    id: 'sparkasse',
    name: 'Sparkasse',
    encoding: 'ISO-8859-1',
    delimiter: ';',
    skip_rows: 1,
    columns: {
      date: 'Buchungstag',
      payee: 'Beguenstigter/Zahlungspflichtiger',
      amount: 'Betrag',
      iban: 'Kontonummer/IBAN',
      notes: 'Verwendungszweck',
    },
    date_format: 'DD.MM.YY',
  },
  {
    id: 'ing',
    name: 'ING-DiBa',
    encoding: 'ISO-8859-1',
    delimiter: ';',
    skip_rows: 13,
    columns: {
      date: 'Buchung',
      payee: 'Auftraggeber/Empfänger',
      amount: 'Betrag',
      iban: 'IBAN',
      notes: 'Verwendungszweck',
    },
    date_format: 'DD.MM.YYYY',
  },
  {
    id: 'commerzbank',
    name: 'Commerzbank',
    encoding: 'UTF-8',
    delimiter: ';',
    skip_rows: 4,
    columns: {
      date: 'Buchungstag',
      payee: 'Empfänger',
      amount: 'Betrag',
      iban: 'IBAN des Empfängers',
      notes: 'Verwendungszweck',
    },
    date_format: 'DD.MM.YYYY',
  },
  {
    id: 'n26',
    name: 'N26',
    encoding: 'UTF-8',
    delimiter: ',',
    skip_rows: 1,
    columns: {
      date: 'Date',
      payee: 'Payee',
      amount: 'Amount (EUR)',
      iban: '',
      notes: 'Payment reference',
    },
    date_format: 'YYYY-MM-DD',
  },
  {
    id: 'finanzguru',
    name: 'Finanzguru XLSX Export',
    encoding: 'UTF-8',
    delimiter: ',',
    skip_rows: 1,
    columns: {
      date: 'Datum',
      payee: 'Empfänger',
      amount: 'Betrag',
      iban: 'IBAN',
      notes: 'Verwendungszweck',
      category: 'Kategorie',
    },
    date_format: 'DD.MM.YYYY',
  },
];

// Detect bank format from CSV header line
function detectBankFormat(headers: string[]): (typeof BANK_FORMATS)[number] | null {
  // Try to match by looking for known column names
  for (const format of BANK_FORMATS) {
    if (format.id === 'finanzguru') continue; // XLSX only
    const dateCol = format.columns.date.toLowerCase();
    const payeeCol = format.columns.payee.toLowerCase();
    const headersLower = headers.map(h => h.toLowerCase().trim());
    if (
      headersLower.some(h => h.includes(dateCol)) &&
      headersLower.some(h => h.includes(payeeCol))
    ) {
      return format;
    }
  }
  return null;
}

// Detect recurring patterns in transaction list
function detectRecurringPatterns(
  transactions: Array<{ payee: string; amount: number; date: string }>,
): Array<{ payee: string; amount: number; likely_interval: string; occurrence_count: number }> {
  const payeeGroups: Record<string, { amounts: number[]; dates: string[] }> = {};

  for (const tx of transactions) {
    const key = tx.payee.toLowerCase().trim();
    if (!payeeGroups[key]) {
      payeeGroups[key] = { amounts: [], dates: [] };
    }
    payeeGroups[key].amounts.push(tx.amount);
    payeeGroups[key].dates.push(tx.date);
  }

  const patterns: Array<{
    payee: string;
    amount: number;
    likely_interval: string;
    occurrence_count: number;
  }> = [];

  for (const [, group] of Object.entries(payeeGroups)) {
    if (group.dates.length < 2) continue;

    // Check if amounts are consistent (all the same or close)
    const amounts = group.amounts;
    const minAmount = Math.min(...amounts);
    const maxAmount = Math.max(...amounts);
    if (Math.abs(maxAmount - minAmount) > Math.abs(minAmount) * 0.1) continue; // >10% variance

    // Estimate interval from date gaps
    const sortedDates = group.dates
      .map(d => new Date(d).getTime())
      .filter(t => !isNaN(t))
      .sort((a, b) => a - b);

    if (sortedDates.length < 2) continue;

    const gaps: number[] = [];
    for (let i = 1; i < sortedDates.length; i++) {
      gaps.push((sortedDates[i] - sortedDates[i - 1]) / (1000 * 60 * 60 * 24));
    }
    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;

    let likely_interval = 'unknown';
    if (avgGap >= 25 && avgGap <= 35) likely_interval = 'monthly';
    else if (avgGap >= 85 && avgGap <= 95) likely_interval = 'quarterly';
    else if (avgGap >= 170 && avgGap <= 190) likely_interval = 'semi-annual';
    else if (avgGap >= 350 && avgGap <= 380) likely_interval = 'annual';
    else if (avgGap >= 5 && avgGap <= 9) likely_interval = 'weekly';

    if (likely_interval === 'unknown') continue;

    // Find the original payee (not lowercased)
    const originalPayee = transactions.find(
      t => t.payee.toLowerCase().trim() === Object.keys(payeeGroups).find(k => k === Object.keys(payeeGroups).find(k2 => k2 === k)),
    )?.payee ?? '';

    patterns.push({
      payee: originalPayee || group.dates[0], // fallback
      amount: Math.round(amounts.reduce((a, b) => a + b, 0) / amounts.length),
      likely_interval,
      occurrence_count: group.dates.length,
    });
  }

  return patterns;
}

// ─── Routes ────────────────────────────────────────────────────────────────

/** GET /import/bank-formats — list supported German bank CSV formats */
app.get('/bank-formats', (_req, res) => {
  res.json({
    status: 'ok',
    data: BANK_FORMATS.map(f => ({
      id: f.id,
      name: f.name,
      encoding: f.encoding,
      delimiter: f.delimiter,
    })),
  });
});

/** POST /import/finanzguru — parse Finanzguru XLSX and return preview */
app.post('/finanzguru', (req, res) => {
  // Finanzguru XLSX parsing requires the xlsx library.
  // Returning a structured preview stub until xlsx is installed.
  // The frontend sends the file as base64 in req.body.file_base64
  const { file_base64 } = req.body ?? {};

  if (!file_base64) {
    res.status(400).json({ status: 'error', reason: 'file-required' });
    return;
  }

  // Stub: return preview metadata. Real implementation would:
  // 1. Decode base64 to buffer
  // 2. Parse with xlsx.read(buffer, { type: 'buffer' })
  // 3. Extract sheet data and map columns
  res.json({
    status: 'ok',
    data: {
      format: 'finanzguru',
      preview: [],
      total_rows: 0,
      columns_detected: ['Datum', 'Empfänger', 'Betrag', 'Kategorie', 'Verwendungszweck'],
      message: 'XLSX parsing not yet implemented — install xlsx package',
    },
  });
});

/** POST /import/finanzguru/commit — commit mapped Finanzguru data */
app.post('/finanzguru/commit', (req, res) => {
  const { transactions, category_map } = req.body ?? {};

  if (!Array.isArray(transactions)) {
    res.status(400).json({ status: 'error', reason: 'transactions-required' });
    return;
  }

  // Stub: real implementation would write to loot-core via handler bridge
  res.json({
    status: 'ok',
    data: {
      imported: 0,
      skipped: 0,
      message: 'Commit not yet implemented',
    },
  });
});

/** POST /import/csv — parse CSV, auto-detect bank format, return preview */
app.post('/csv', (req, res) => {
  const { csv_text, bank_format_id } = req.body ?? {};

  if (!csv_text) {
    res.status(400).json({ status: 'error', reason: 'csv-text-required' });
    return;
  }

  const lines = csv_text.split('\n').filter((l: string) => l.trim());
  if (lines.length < 2) {
    res.status(400).json({ status: 'error', reason: 'csv-too-short' });
    return;
  }

  // Auto-detect delimiter
  const firstLine = lines[0];
  const delimiter = firstLine.includes(';') ? ';' : ',';
  const headers = firstLine.split(delimiter).map((h: string) => h.trim().replace(/^"|"$/g, ''));

  // Detect or use provided bank format
  let detectedFormat = null;
  if (bank_format_id) {
    detectedFormat = BANK_FORMATS.find(f => f.id === bank_format_id) ?? null;
  }
  if (!detectedFormat) {
    detectedFormat = detectBankFormat(headers);
  }

  // Parse data rows (up to 5 for preview)
  const dataRows = lines.slice(1, 6).map((line: string) => {
    const values = line.split(delimiter).map((v: string) => v.trim().replace(/^"|"$/g, ''));
    const row: Record<string, string> = {};
    headers.forEach((header: string, i: number) => {
      row[header] = values[i] ?? '';
    });
    return row;
  });

  res.json({
    status: 'ok',
    data: {
      detected_format: detectedFormat
        ? { id: detectedFormat.id, name: detectedFormat.name }
        : null,
      headers,
      preview_rows: dataRows,
      total_rows: lines.length - 1,
    },
  });
});

/** POST /import/csv/commit — commit mapped CSV data */
app.post('/csv/commit', (req, res) => {
  const { transactions } = req.body ?? {};

  if (!Array.isArray(transactions)) {
    res.status(400).json({ status: 'error', reason: 'transactions-required' });
    return;
  }

  // Stub: real implementation writes to loot-core
  res.json({
    status: 'ok',
    data: {
      imported: 0,
      skipped: 0,
      message: 'Commit not yet implemented',
    },
  });
});

/** POST /import/detect-contracts — scan imported transactions for recurring patterns */
app.post('/detect-contracts', (req, res) => {
  const { transactions } = req.body ?? {};

  if (!Array.isArray(transactions)) {
    res.status(400).json({ status: 'error', reason: 'transactions-required' });
    return;
  }

  const patterns = detectRecurringPatterns(transactions);

  res.json({
    status: 'ok',
    data: {
      detected: patterns,
      count: patterns.length,
    },
  });
});

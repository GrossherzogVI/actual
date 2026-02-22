import { createHash } from 'crypto';

import express from 'express';

import {
  requestLoggerMiddleware,
  validateSessionMiddleware,
} from '../util/middlewares.js';

const app = express();

export { app as handlers };
app.use(express.json({ limit: '50mb' }));
app.use(requestLoggerMiddleware);
app.use(validateSessionMiddleware);

// ─── Types ──────────────────────────────────────────────────────────────────

interface ImportPreviewRow {
  date: string;
  payee: string;
  amount: number;
  notes: string | null;
  imported_id: string;
  account_id?: string;
  suggested_category_id?: string;
  confidence?: number;
}

interface ImportPreviewResult {
  rows: ImportPreviewRow[];
  total: number;
  detected_format: string | null;
  warnings: string[];
}

// ─── Supported German bank CSV formats with their column mappings ───────────

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
      date: 'Buchungstag',
      payee: 'Beguenstigter/Auftraggeber',
      amount: 'Betrag',
      iban: 'Referenzkonto',
      notes: 'Verwendungszweck',
      category: 'Analyse-Hauptkategorie',
    },
    date_format: 'DD.MM.YYYY',
  },
] as const;

type BankFormat = (typeof BANK_FORMATS)[number];

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Parse a German-style amount string to integer cents.
 * Handles: "1.234,56", "-1.234,56", "(1.234,56)", "1234,56", "1234.56", "-1234.56"
 */
function parseGermanAmount(str: string): number {
  if (!str || typeof str !== 'string') return 0;

  let s = str.trim();
  let negative = false;

  // Handle parentheses as negative: (1.234,56)
  if (s.startsWith('(') && s.endsWith(')')) {
    negative = true;
    s = s.slice(1, -1).trim();
  }

  // Handle leading minus
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1).trim();
  }

  // Handle trailing minus (some German banks)
  if (s.endsWith('-')) {
    negative = true;
    s = s.slice(0, -1).trim();
  }

  // Remove currency symbols and whitespace
  s = s.replace(/[€$\s]/g, '');

  // Determine format: German (1.234,56) vs English (1,234.56) vs plain (1234.56)
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');

  let cents: number;

  if (lastComma > lastDot) {
    // German format: dots are thousands separators, comma is decimal
    s = s.replace(/\./g, '').replace(',', '.');
    cents = Math.round(parseFloat(s) * 100);
  } else if (lastDot > lastComma) {
    // English/plain format: commas are thousands separators, dot is decimal
    s = s.replace(/,/g, '');
    cents = Math.round(parseFloat(s) * 100);
  } else if (lastComma !== -1 && lastDot === -1) {
    // Only comma present — treat as decimal separator
    s = s.replace(',', '.');
    cents = Math.round(parseFloat(s) * 100);
  } else {
    // No decimal separator — could be whole euros or already cents
    cents = Math.round(parseFloat(s) * 100);
  }

  if (isNaN(cents)) return 0;
  return negative ? -cents : cents;
}

/**
 * Parse a date string to YYYY-MM-DD.
 * Handles: DD.MM.YYYY, DD.MM.YY, YYYY-MM-DD, DD/MM/YYYY
 */
function parseGermanDate(str: string, _formatHint?: string): string {
  if (!str || typeof str !== 'string') return '';
  const s = str.trim();

  // Handle Excel serial date numbers (e.g., 43883 = 2020-02-22)
  if (/^\d{4,5}$/.test(s)) {
    const serial = parseInt(s);
    if (serial > 30000 && serial < 60000) {
      // Excel epoch is Jan 1, 1900 (with the Lotus 1-2-3 bug: day 0 = Jan 0, 1900)
      const excelEpoch = new Date(1899, 11, 30); // Dec 30, 1899
      const date = new Date(excelEpoch.getTime() + serial * 86400000);
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // DD.MM.YYYY or DD/MM/YYYY
  const matchFull = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (matchFull) {
    const [, day, month, year] = matchFull;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // DD.MM.YY
  const matchShort = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2})$/);
  if (matchShort) {
    const [, day, month, shortYear] = matchShort;
    const year = parseInt(shortYear) > 50 ? `19${shortYear}` : `20${shortYear}`;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // Fallback: try Date constructor
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return '';
}

/**
 * Generate a deterministic import ID for dedup.
 */
function generateImportedId(
  date: string,
  payee: string,
  amount: number,
  rowIndex: number,
): string {
  const input = `${date}|${payee}|${amount}|${rowIndex}`;
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

// Detect bank format from CSV header line
function detectBankFormat(headers: string[]): BankFormat | null {
  const headersLower = headers.map(h => h.toLowerCase().trim());
  for (const format of BANK_FORMATS) {
    if (format.id === 'finanzguru') continue; // XLSX only
    const dateCol = format.columns.date.toLowerCase();
    const payeeCol = format.columns.payee.toLowerCase();
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
): Array<{
  payee: string;
  amount: number;
  likely_interval: string;
  occurrence_count: number;
}> {
  const payeeGroups: Record<
    string,
    { amounts: number[]; dates: string[]; originalPayee: string }
  > = {};

  for (const tx of transactions) {
    const key = tx.payee.toLowerCase().trim();
    if (!payeeGroups[key]) {
      payeeGroups[key] = { amounts: [], dates: [], originalPayee: tx.payee };
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
    if (Math.abs(maxAmount - minAmount) > Math.abs(minAmount) * 0.1) continue;

    // Estimate interval from date gaps
    const sortedDates = group.dates
      .map(d => new Date(d).getTime())
      .filter(t => !isNaN(t))
      .sort((a, b) => a - b);

    if (sortedDates.length < 2) continue;

    const gaps: number[] = [];
    for (let i = 1; i < sortedDates.length; i++) {
      gaps.push(
        (sortedDates[i] - sortedDates[i - 1]) / (1000 * 60 * 60 * 24),
      );
    }
    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;

    let likely_interval = 'unknown';
    if (avgGap >= 25 && avgGap <= 35) likely_interval = 'monthly';
    else if (avgGap >= 85 && avgGap <= 95) likely_interval = 'quarterly';
    else if (avgGap >= 170 && avgGap <= 190) likely_interval = 'semi-annual';
    else if (avgGap >= 350 && avgGap <= 380) likely_interval = 'annual';
    else if (avgGap >= 5 && avgGap <= 9) likely_interval = 'weekly';

    if (likely_interval === 'unknown') continue;

    patterns.push({
      payee: group.originalPayee,
      amount: Math.round(
        amounts.reduce((a, b) => a + b, 0) / amounts.length,
      ),
      likely_interval,
      occurrence_count: group.dates.length,
    });
  }

  return patterns;
}

/**
 * Find the header row index in parsed CSV rows by looking for known column names.
 */
function findHeaderRow(
  rows: string[][],
  format: BankFormat | null,
): number {
  const targetCols = format
    ? [format.columns.date.toLowerCase(), format.columns.amount.toLowerCase()]
    : ['buchungstag', 'betrag', 'date', 'amount', 'buchung', 'datum'];

  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const rowLower = rows[i].map(c => c.toLowerCase().trim());
    const matches = targetCols.filter(col =>
      rowLower.some(cell => cell.includes(col)),
    );
    if (matches.length >= 2 || (format && matches.length >= 1)) {
      return i;
    }
  }
  return 0;
}

/**
 * Map a parsed CSV row (keyed by header) to an ImportPreviewRow using column mappings.
 */
function mapRowToPreview(
  row: Record<string, string>,
  format: BankFormat | null,
  headers: string[],
  rowIndex: number,
): ImportPreviewRow | null {
  let dateStr = '';
  let payeeStr = '';
  let amountStr = '';
  let notesStr = '';

  if (format) {
    // Use format column mapping — find the actual header that matches
    const findCol = (target: string) => {
      const targetLower = target.toLowerCase();
      const header = headers.find(h =>
        h.toLowerCase().trim().includes(targetLower),
      );
      return header ? (row[header] ?? '') : '';
    };

    dateStr = findCol(format.columns.date);
    payeeStr = findCol(format.columns.payee);
    amountStr = findCol(format.columns.amount);
    notesStr = findCol(format.columns.notes);
  } else {
    // Best-effort: try common column names
    const findByNames = (names: string[]) => {
      for (const name of names) {
        const header = headers.find(h =>
          h.toLowerCase().trim().includes(name.toLowerCase()),
        );
        if (header && row[header]) return row[header];
      }
      return '';
    };

    dateStr = findByNames([
      'Buchungstag',
      'Buchung',
      'Datum',
      'Date',
      'Valuta',
    ]);
    payeeStr = findByNames([
      'Empfänger',
      'Payee',
      'Auftraggeber',
      'Beguenstigter',
      'Name',
    ]);
    amountStr = findByNames(['Betrag', 'Amount', 'Umsatz']);
    notesStr = findByNames([
      'Verwendungszweck',
      'Payment reference',
      'Buchungstext',
      'Description',
    ]);
  }

  const date = parseGermanDate(
    dateStr,
    format?.date_format,
  );
  const amount = parseGermanAmount(amountStr);

  if (!date) return null;

  const payee = payeeStr.trim() || 'Unknown';
  const notes = notesStr.trim() || null;

  return {
    date,
    payee,
    amount,
    notes,
    imported_id: generateImportedId(date, payee, amount, rowIndex),
  };
}

// ─── Routes ─────────────────────────────────────────────────────────────────

/** GET /import/bank-formats — list supported German bank CSV formats */
app.get('/bank-formats', (_req, res) => {
  res.json({
    status: 'ok',
    data: [
      ...BANK_FORMATS.map(f => ({
        id: f.id,
        name: f.name,
        encoding: f.encoding,
        delimiter: f.delimiter,
      })),
      { id: 'mt940', name: 'MT940 (SWIFT)', encoding: 'UTF-8', delimiter: null },
      { id: 'camt053', name: 'CAMT.053 (ISO 20022)', encoding: 'UTF-8', delimiter: null },
    ],
  });
});

/** POST /import/csv — parse CSV file, auto-detect bank format, return preview */
app.post('/csv', async (req, res) => {
  try {
    const { fileData, bankFormat, delimiter, encoding } = req.body ?? {};

    if (!fileData) {
      res.status(400).json({ status: 'error', reason: 'file-data-required' });
      return;
    }

    const warnings: string[] = [];

    // 1. Decode base64 to Buffer
    const rawBuffer = Buffer.from(fileData, 'base64');

    // 2. Detect/convert encoding
    const iconv = await import('iconv-lite');
    let csvText: string;

    const targetEncoding = encoding || 'ISO-8859-1';
    if (
      targetEncoding.toLowerCase() === 'utf-8' ||
      targetEncoding.toLowerCase() === 'utf8'
    ) {
      csvText = rawBuffer.toString('utf-8');
      // Strip BOM if present
      if (csvText.charCodeAt(0) === 0xfeff) {
        csvText = csvText.slice(1);
      }
    } else {
      csvText = iconv.default.decode(rawBuffer, targetEncoding);
    }

    // 3. Parse with csv-parse/sync
    const { parse } = await import('csv-parse/sync');

    // Detect delimiter from first line if not provided
    const firstLine = csvText.split('\n')[0] ?? '';
    const effectiveDelimiter =
      delimiter || (firstLine.includes(';') ? ';' : ',');

    let allRows: string[][];
    try {
      allRows = parse(csvText, {
        delimiter: effectiveDelimiter,
        relax_column_count: true,
        relax_quotes: true,
        skip_empty_lines: true,
        trim: true,
      }) as string[][];
    } catch (parseError: unknown) {
      const msg =
        parseError instanceof Error ? parseError.message : 'Unknown parse error';
      res
        .status(400)
        .json({ status: 'error', reason: 'csv-parse-failed', detail: msg });
      return;
    }

    if (allRows.length < 2) {
      res.status(400).json({ status: 'error', reason: 'csv-too-short' });
      return;
    }

    // 4. Auto-detect bank format
    let detectedFormat: BankFormat | null = null;
    if (bankFormat) {
      detectedFormat =
        BANK_FORMATS.find(f => f.id === bankFormat) ?? null;
    }

    // Find header row
    const headerRowIdx = findHeaderRow(allRows, detectedFormat);
    const headers = allRows[headerRowIdx].map(h =>
      h.replace(/^"|"$/g, '').trim(),
    );

    if (!detectedFormat) {
      detectedFormat = detectBankFormat(headers);
    }

    if (detectedFormat) {
      warnings.push(`Auto-detected format: ${detectedFormat.name}`);
    } else {
      warnings.push(
        'Could not auto-detect bank format. Using best-effort column mapping.',
      );
    }

    // 5. Map data rows
    const dataRows = allRows.slice(headerRowIdx + 1);
    const rows: ImportPreviewRow[] = [];
    let skippedRows = 0;

    for (let i = 0; i < dataRows.length; i++) {
      const rawRow = dataRows[i];
      const row: Record<string, string> = {};
      headers.forEach((header, idx) => {
        row[header] = (rawRow[idx] ?? '').replace(/^"|"$/g, '').trim();
      });

      const mapped = mapRowToPreview(row, detectedFormat, headers, i);
      if (mapped) {
        rows.push(mapped);
      } else {
        skippedRows++;
      }
    }

    if (skippedRows > 0) {
      warnings.push(
        `Skipped ${skippedRows} rows due to missing or unparseable date.`,
      );
    }

    const result: ImportPreviewResult = {
      rows,
      total: rows.length,
      detected_format: detectedFormat?.name ?? null,
      warnings,
    };

    res.json({ status: 'ok', data: result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('CSV import error:', msg);
    res.status(500).json({ status: 'error', reason: 'internal', detail: msg });
  }
});

/** POST /import/finanzguru — parse Finanzguru XLSX and return preview */
app.post('/finanzguru', async (req, res) => {
  try {
    const { fileData, accountMapping } = req.body ?? {};

    if (!fileData) {
      res.status(400).json({ status: 'error', reason: 'file-data-required' });
      return;
    }

    const warnings: string[] = [];

    // 1. Decode base64 to buffer
    const buffer = Buffer.from(fileData, 'base64');

    // 2. Parse with xlsx (dynamically imported, may not have types installed)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let XLSX: any;
    try {
      // Use string variable to bypass TS module resolution
      const xlsxModule = 'xlsx';
      XLSX = await import(xlsxModule);
    } catch {
      res.status(500).json({
        status: 'error',
        reason: 'xlsx-not-installed',
        detail: 'The xlsx package is not installed. Run yarn install.',
      });
      return;
    }
    const workbook = XLSX.read(buffer, { type: 'buffer' });

    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      res
        .status(400)
        .json({ status: 'error', reason: 'no-sheets-found' });
      return;
    }

    const sheet = workbook.Sheets[sheetName];
    const jsonRows = XLSX.utils.sheet_to_json(sheet, {
      defval: '',
    }) as Record<string, unknown>[];

    if (jsonRows.length === 0) {
      res.status(400).json({ status: 'error', reason: 'xlsx-empty' });
      return;
    }

    // 3. Map Finanzguru columns
    const finanzguruFormat = BANK_FORMATS.find(f => f.id === 'finanzguru')!;
    const acctMap: Record<string, string> = accountMapping ?? {};

    const rows: ImportPreviewRow[] = [];
    let skippedRows = 0;

    for (let i = 0; i < jsonRows.length; i++) {
      const raw = jsonRows[i];

      const rawDate = raw[finanzguruFormat.columns.date];
      let dateStr: string;
      if (rawDate instanceof Date) {
        dateStr = rawDate.toISOString().slice(0, 10);
      } else if (typeof rawDate === 'number') {
        // Excel serial date
        dateStr = String(rawDate);
      } else {
        dateStr = String(rawDate ?? '');
      }
      const payeeStr = String(raw[finanzguruFormat.columns.payee] ?? '');
      const amountStr = String(raw[finanzguruFormat.columns.amount] ?? '');
      const notesStr = String(
        raw[finanzguruFormat.columns.notes] ?? '',
      );
      const ibanStr = String(raw[finanzguruFormat.columns.iban] ?? '');
      const categoryStr = String(
        raw[(finanzguruFormat.columns as Record<string, string>).category] ?? '',
      );

      const date = parseGermanDate(dateStr, finanzguruFormat.date_format);
      const amount = parseGermanAmount(amountStr);

      if (!date) {
        skippedRows++;
        continue;
      }

      const payee = payeeStr.trim() || 'Unknown';
      const notes = notesStr.trim() || null;

      const row: ImportPreviewRow = {
        date,
        payee,
        amount,
        notes,
        imported_id: generateImportedId(date, payee, amount, i),
      };

      if (categoryStr) {
        row.suggested_category_id = categoryStr;
      }

      // Map IBAN to account_id if mapping provided
      if (ibanStr && acctMap[ibanStr]) {
        row.account_id = acctMap[ibanStr];
      }

      rows.push(row);
    }

    if (skippedRows > 0) {
      warnings.push(
        `Skipped ${skippedRows} rows due to missing or unparseable date.`,
      );
    }

    const result: ImportPreviewResult = {
      rows,
      total: rows.length,
      detected_format: finanzguruFormat.name,
      warnings,
    };

    res.json({ status: 'ok', data: result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('Finanzguru import error:', msg);
    res.status(500).json({ status: 'error', reason: 'internal', detail: msg });
  }
});

// ─── MT940 Parser ────────────────────────────────────────────────────────────

/**
 * Parse an MT940 SWIFT statement file.
 * Format overview:
 *   :20:  Transaction reference (header)
 *   :25:  Account identification
 *   :28C: Statement number
 *   :60F: Opening balance
 *   :61:  Value date / amount / reference (one per transaction)
 *   :86:  Narrative / usage purpose (optional, follows :61:)
 *   :62F: Closing balance
 *
 * Each :61: line: YYMMDD[MMDD]<C|D>[N]<amount>,<decimal>N<ref>
 *   C = credit (positive), D = debit (negative)
 */
function parseMT940(text: string): ImportPreviewRow[] {
  const rows: ImportPreviewRow[] = [];

  // Split into transaction blocks — each starts at :61:
  const lines = text.split(/\r?\n/);

  let currentField = '';
  let currentValue = '';

  // Accumulate all field-value pairs in order
  const fields: Array<{ tag: string; value: string }> = [];

  for (const line of lines) {
    const tagMatch = line.match(/^:(\d{2}[A-Z]?):/);
    if (tagMatch) {
      if (currentField) {
        fields.push({ tag: currentField, value: currentValue.trim() });
      }
      currentField = tagMatch[1];
      currentValue = line.slice(tagMatch[0].length);
    } else if (currentField) {
      currentValue += '\n' + line;
    }
  }
  if (currentField) {
    fields.push({ tag: currentField, value: currentValue.trim() });
  }

  // Walk fields collecting :61: + optional :86: pairs
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    if (f.tag !== '61') continue;

    // :61: line: YYMMDD[MMDD]<C|D|RD|RC>[N]<amount,cents>N<ref>[//<counterref>]
    // Example: 2302150215D1500,00NTRFNONREF
    const m = f.value.match(
      /^(\d{6})(\d{4})?(C|D|RD|RC)N?(\d+),(\d{0,2})(.*)/,
    );
    if (!m) continue;

    const [, yymmdd, mmdd, direction, major, minor] = m;
    const yy = yymmdd.slice(0, 2);
    const mm = yymmdd.slice(2, 4);
    const dd = yymmdd.slice(4, 6);
    const year = parseInt(yy) > 50 ? `19${yy}` : `20${yy}`;
    const valueDate = mmdd
      ? `${year}-${mmdd.slice(0, 2)}-${mmdd.slice(2, 4)}`
      : `${year}-${mm}-${dd}`;

    const cents = parseInt(major) * 100 + parseInt((minor || '0').padEnd(2, '0').slice(0, 2));
    const isDebit = direction === 'D' || direction === 'RD';
    const amount = isDebit ? -cents : cents;

    // Narrative from optional :86: right after this :61:
    let notes: string | null = null;
    let payee = 'Unknown';

    const next = fields[i + 1];
    if (next && next.tag === '86') {
      const narrative = next.value;
      // Try to extract payee from subfield 32 (Auftraggeber/Empfänger)
      const payeeMatch = narrative.match(/\?32([^\?]+)/);
      const purposeMatch = narrative.match(/\?20([^\?]+)/);
      if (payeeMatch) payee = payeeMatch[1].trim();
      notes = purposeMatch ? purposeMatch[1].trim() : narrative.slice(0, 120);
      i++; // consume the :86:
    }

    rows.push({
      date: valueDate,
      payee,
      amount,
      notes,
      imported_id: generateImportedId(valueDate, payee, amount, rows.length),
    });
  }

  return rows;
}

// ─── CAMT.053 Parser ─────────────────────────────────────────────────────────

/**
 * Parse a CAMT.053 (ISO 20022 BankToCustomerStatement) XML file.
 * Structure: BkToCstmrStmt > Stmt > Ntry (one per booked entry)
 *   Each Ntry has:
 *     Amt       — amount with currency attribute
 *     CdtDbtInd — CRDT or DBIT
 *     BookgDt > Dt — booking date YYYY-MM-DD
 *     NtryDtls > TxDtls > RltdPties > Dbtr > Nm  — debtor name (payee for debits)
 *     NtryDtls > TxDtls > RltdPties > Cdtr > Nm  — creditor name (payee for credits)
 *     NtryDtls > TxDtls > RmtInf > Ustrd — unstructured remittance info (notes)
 */
function parseCAMT053(xmlText: string): ImportPreviewRow[] {
  const rows: ImportPreviewRow[] = [];

  // Minimal XML text parser — extract all <Ntry> blocks
  const ntryBlocks = xmlText.match(/<Ntry>([\s\S]*?)<\/Ntry>/g) ?? [];

  for (let idx = 0; idx < ntryBlocks.length; idx++) {
    const block = ntryBlocks[idx];

    const getText = (tag: string): string => {
      const m = block.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`));
      return m ? m[1].trim() : '';
    };

    // Booking date — prefer <BookgDt><Dt> over <ValDt><Dt>
    const bookingSection = block.match(/<BookgDt>([\s\S]*?)<\/BookgDt>/)?.[1] ?? '';
    const valueSection = block.match(/<ValDt>([\s\S]*?)<\/ValDt>/)?.[1] ?? '';
    const dateRaw =
      bookingSection.match(/<Dt>([^<]+)<\/Dt>/)?.[1]?.trim() ||
      valueSection.match(/<Dt>([^<]+)<\/Dt>/)?.[1]?.trim() ||
      '';
    const date = parseGermanDate(dateRaw);
    if (!date) continue;

    // Amount (already decimal EUR in CAMT)
    const amtRaw = getText('Amt');
    const amtNum = parseFloat(amtRaw.replace(',', '.'));
    if (isNaN(amtNum)) continue;
    const cents = Math.round(amtNum * 100);

    const cdtDbt = getText('CdtDbtInd');
    const isDebit = cdtDbt === 'DBIT';
    const amount = isDebit ? -cents : cents;

    // Payee: for debits = creditor; for credits = debtor
    const txDtls = block.match(/<TxDtls>([\s\S]*?)<\/TxDtls>/)?.[1] ?? '';
    const cdtrSection = txDtls.match(/<Cdtr>([\s\S]*?)<\/Cdtr>/)?.[1] ?? '';
    const dbtrSection = txDtls.match(/<Dbtr>([\s\S]*?)<\/Dbtr>/)?.[1] ?? '';
    const cdtrName = cdtrSection.match(/<Nm>([^<]+)<\/Nm>/)?.[1]?.trim() ?? '';
    const dbtrName = dbtrSection.match(/<Nm>([^<]+)<\/Nm>/)?.[1]?.trim() ?? '';
    const payee = (isDebit ? cdtrName : dbtrName) || 'Unknown';

    // Notes: unstructured remittance info
    const rmtInf = txDtls.match(/<RmtInf>([\s\S]*?)<\/RmtInf>/)?.[1] ?? '';
    const ustrd = rmtInf.match(/<Ustrd>([^<]+)<\/Ustrd>/)?.[1]?.trim() ?? null;
    const notes = ustrd || null;

    rows.push({
      date,
      payee,
      amount,
      notes,
      imported_id: generateImportedId(date, payee, amount, idx),
    });
  }

  return rows;
}

// ─── Updated detectBankFormat (extended for text markers) ────────────────────

/**
 * Detect if raw text content is MT940 or CAMT.053.
 * Returns 'mt940' | 'camt053' | null.
 */
function detectTextFormat(text: string): 'mt940' | 'camt053' | null {
  const firstLine = text.slice(0, 200);
  if (firstLine.includes(':20:') || firstLine.includes(':25:')) return 'mt940';
  if (
    text.includes('BkToCstmrStmt') ||
    text.includes('camt.053') ||
    text.includes('<Stmt>')
  )
    return 'camt053';
  return null;
}

/** POST /import/mt940 — parse MT940 SWIFT statement file */
app.post('/mt940', (req, res) => {
  try {
    const { fileData } = req.body ?? {};
    if (!fileData) {
      res.status(400).json({ status: 'error', reason: 'file-data-required' });
      return;
    }

    const buffer = Buffer.from(fileData, 'base64');
    // MT940 files are typically ISO-8859-1 or UTF-8
    let text = buffer.toString('utf-8');
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

    const rows = parseMT940(text);

    const result: ImportPreviewResult = {
      rows,
      total: rows.length,
      detected_format: 'MT940 (SWIFT)',
      warnings:
        rows.length === 0
          ? ['No transactions found. Verify this is a valid MT940 file.']
          : [],
    };

    res.json({ status: 'ok', data: result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('MT940 import error:', msg);
    res.status(500).json({ status: 'error', reason: 'internal', detail: msg });
  }
});

/** POST /import/camt053 — parse CAMT.053 XML bank statement */
app.post('/camt053', (req, res) => {
  try {
    const { fileData } = req.body ?? {};
    if (!fileData) {
      res.status(400).json({ status: 'error', reason: 'file-data-required' });
      return;
    }

    const buffer = Buffer.from(fileData, 'base64');
    let text = buffer.toString('utf-8');
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

    const rows = parseCAMT053(text);

    const result: ImportPreviewResult = {
      rows,
      total: rows.length,
      detected_format: 'CAMT.053 (ISO 20022)',
      warnings:
        rows.length === 0
          ? ['No transactions found. Verify this is a valid CAMT.053 XML file.']
          : [],
    };

    res.json({ status: 'ok', data: result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('CAMT.053 import error:', msg);
    res.status(500).json({ status: 'error', reason: 'internal', detail: msg });
  }
});

/** POST /import/detect-contracts — scan imported transactions for recurring patterns */
app.post('/detect-contracts', (req, res) => {
  const { transactions } = req.body ?? {};

  if (!Array.isArray(transactions)) {
    res
      .status(400)
      .json({ status: 'error', reason: 'transactions-required' });
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

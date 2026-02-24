import type { ColumnMapping, ParsedRow, ParserResult } from './types';

/**
 * Parses German number format: "1.234,56" → 1234.56
 * Also handles plain numbers and numbers with EUR suffix.
 */
function parseGermanAmount(text: string): number {
  const cleaned = text.replace(/[€\sEUR]/g, '').replace(/\./g, '').replace(',', '.');
  const value = parseFloat(cleaned);
  if (isNaN(value)) {
    throw new Error(`Betrag nicht lesbar: "${text}"`);
  }
  return value;
}

/**
 * Parses German date format: "24.02.2026" → "2026-02-24"
 * Also handles ISO dates passthrough.
 */
function parseGermanDate(text: string): string {
  const trimmed = text.trim();
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  const parts = trimmed.split('.');
  if (parts.length !== 3) return trimmed;
  const [day, month, year] = parts;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

/**
 * Splits a CSV line by the given delimiter, respecting quoted fields.
 */
function splitLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Attempts to detect the delimiter used in the CSV file.
 * Checks the first few non-empty lines and counts semicolons vs commas vs tabs.
 */
function detectDelimiter(lines: string[]): string {
  const sample = lines.filter(l => l.trim()).slice(0, 5).join('\n');
  const semicolons = (sample.match(/;/g) ?? []).length;
  const commas = (sample.match(/,/g) ?? []).length;
  const tabs = (sample.match(/\t/g) ?? []).length;

  if (semicolons >= commas && semicolons >= tabs) return ';';
  if (tabs >= commas) return '\t';
  return ',';
}

/**
 * Returns the column headers and a sample of data rows without parsing amounts.
 * Used to let the user pick which column maps to date, amount, payee, notes.
 */
export function detectColumns(
  text: string,
  delimiter?: string,
): { headers: string[]; sampleRows: string[][] } {
  const lines = text.split(/\r?\n/);
  const delim = delimiter ?? detectDelimiter(lines);

  const nonEmpty = lines.filter(l => l.trim());
  if (nonEmpty.length === 0) return { headers: [], sampleRows: [] };

  const headers = splitLine(nonEmpty[0], delim);
  const sampleRows = nonEmpty
    .slice(1, 6) // Up to 5 sample rows
    .map(line => splitLine(line, delim));

  return { headers, sampleRows };
}

/**
 * Generic fallback parser.
 *
 * Requires a ColumnMapping that the user has configured after inspecting
 * the output of detectColumns().
 */
export function parseGeneric(
  text: string,
  mapping: ColumnMapping,
  delimiter?: string,
): ParserResult {
  const lines = text.split(/\r?\n/);
  const delim = delimiter ?? detectDelimiter(lines);
  const errors: string[] = [];
  const rows: ParsedRow[] = [];

  const nonEmpty = lines.filter(l => l.trim());
  if (nonEmpty.length < 2) {
    return {
      rows: [],
      errors: ['Datei ist leer oder enthält nur eine Zeile.'],
      bankName: 'Unbekannt',
      encoding: 'utf-8',
    };
  }

  // Skip the header row (index 0)
  for (let i = 1; i < nonEmpty.length; i++) {
    const cols = splitLine(nonEmpty[i], delim);

    const rawDate = cols[mapping.date]?.trim() ?? '';
    const rawAmount = cols[mapping.amount]?.trim() ?? '';

    if (!rawDate || !rawAmount) continue;

    try {
      const date = parseGermanDate(rawDate);
      const amount = parseGermanAmount(rawAmount);
      const payee = cols[mapping.payee]?.trim() ?? '';
      const notes = cols[mapping.notes]?.trim() ?? '';
      const iban =
        mapping.iban !== undefined ? (cols[mapping.iban]?.trim() ?? undefined) : undefined;
      const reference =
        mapping.reference !== undefined
          ? (cols[mapping.reference]?.trim() ?? undefined)
          : undefined;

      rows.push({ date, amount, payee, notes, iban, reference });
    } catch (err) {
      errors.push(`Zeile ${i + 1}: ${String(err)}`);
    }
  }

  return { rows, errors, bankName: 'Unbekannt', encoding: 'utf-8' };
}

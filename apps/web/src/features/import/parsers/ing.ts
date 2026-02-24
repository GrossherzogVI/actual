import type { ParsedRow, ParserResult } from './types';

/**
 * Parses German number format: "1.234,56" → 1234.56
 */
function parseGermanAmount(text: string): number {
  const cleaned = text.replace(/[€\s]/g, '').replace(/\./g, '').replace(',', '.');
  const value = parseFloat(cleaned);
  if (isNaN(value)) {
    throw new Error(`Betrag nicht lesbar: "${text}"`);
  }
  return value;
}

/**
 * Parses German date format: "24.02.2026" → "2026-02-24"
 */
function parseGermanDate(text: string): string {
  const trimmed = text.trim();
  const parts = trimmed.split('.');
  if (parts.length !== 3) return trimmed;
  const [day, month, year] = parts;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

/**
 * Splits a semicolon-delimited CSV line, respecting quoted fields.
 */
function splitLine(line: string): string[] {
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
    } else if (ch === ';' && !inQuotes) {
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
 * ING-DiBa CSV parser.
 *
 * ING exports also contain metadata rows before the actual data. The header
 * row contains "Buchung" as the first column.
 *
 * Columns: Buchung; Valuta; Auftraggeber/Empfänger; Buchungstext;
 *          Verwendungszweck; Saldo; Währung; Betrag; Währung
 */
export function parseIng(text: string): ParserResult {
  const lines = text.split(/\r?\n/);
  const errors: string[] = [];
  const rows: ParsedRow[] = [];

  // Find the header row — ING uses "Buchung" as first column header
  let headerIndex = -1;
  let headers: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // ING header row starts with "Buchung;" or contains "Auftraggeber"
    if (line.trim().startsWith('Buchung;') || line.includes('Auftraggeber/Empf')) {
      headers = splitLine(line);
      headerIndex = i;
      break;
    }
  }

  if (headerIndex === -1) {
    return {
      rows: [],
      errors: ['ING-Format nicht erkannt: Kein Buchungs-Header gefunden.'],
      bankName: 'ING-DiBa',
      encoding: 'windows-1252',
    };
  }

  const colIndex = (names: string[]): number => {
    for (const name of names) {
      const idx = headers.findIndex(h => h.toLowerCase().includes(name.toLowerCase()));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const dateCol = colIndex(['Buchung']);
  // ING has two "Währung" columns; Betrag comes before the second Währung
  // Find "Betrag" directly
  const amountCol = colIndex(['Betrag']);
  const payeeCol = colIndex(['Auftraggeber', 'Empf\u00e4nger']);
  const notesCol = colIndex(['Verwendungszweck', 'Buchungstext']);

  if (dateCol === -1 || amountCol === -1) {
    return {
      rows: [],
      errors: ['ING-Format: Pflichtfelder (Datum, Betrag) nicht gefunden.'],
      bankName: 'ING-DiBa',
      encoding: 'windows-1252',
    };
  }

  // Parse data rows
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = splitLine(line);
    if (cols.length < Math.max(dateCol, amountCol) + 1) continue;

    const rawDate = cols[dateCol]?.trim() ?? '';
    const rawAmount = cols[amountCol]?.trim() ?? '';

    if (!rawDate || !rawAmount) continue;

    // Skip rows where date doesn't look like DD.MM.YYYY
    if (!/^\d{2}\.\d{2}\.\d{4}$/.test(rawDate)) continue;

    try {
      const date = parseGermanDate(rawDate);
      const amount = parseGermanAmount(rawAmount);
      const payee = payeeCol !== -1 ? (cols[payeeCol]?.trim() ?? '') : '';
      const notes = notesCol !== -1 ? (cols[notesCol]?.trim() ?? '') : '';

      rows.push({ date, amount, payee, notes });
    } catch (err) {
      errors.push(`Zeile ${i + 1}: ${String(err)}`);
    }
  }

  return { rows, errors, bankName: 'ING-DiBa', encoding: 'windows-1252' };
}

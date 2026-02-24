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
 * Sparkasse frequently wraps all fields in double quotes.
 */
function splitLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      // Handle escaped quotes ("")
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
 * Sparkasse CSV parser.
 *
 * Sparkasse exports vary slightly between regional banks, but share a common
 * structure. Fields are semicolon-separated and typically quoted.
 *
 * Known column names (may vary):
 *   Auftragskonto; Buchungstag; Valutadatum; Buchungstext; Verwendungszweck;
 *   Glaeubiger ID; Mandatsreferenz; Kundenreferenz (End-to-End);
 *   Sammlerreferenz; Lastschrift Ursprungsbetrag; Auslagenersatz Ruecklastschrift;
 *   Beguenstigter/Zahlungspflichtiger; Kontonummer/IBAN; BIC (SWIFT-Code);
 *   Betrag; Waehrung; Info
 */
export function parseSparkasse(text: string): ParserResult {
  const lines = text.split(/\r?\n/);
  const errors: string[] = [];
  const rows: ParsedRow[] = [];

  // Find the header row — Sparkasse uses "Buchungstag" in the header
  let headerIndex = -1;
  let headers: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('Buchungstag') || line.includes('Buchungsdatum')) {
      headers = splitLine(line);
      headerIndex = i;
      break;
    }
  }

  if (headerIndex === -1) {
    return {
      rows: [],
      errors: ['Sparkasse-Format nicht erkannt: Kein Buchungstag-Header gefunden.'],
      bankName: 'Sparkasse',
      encoding: 'windows-1252',
    };
  }

  const colIndex = (names: string[]): number => {
    for (const name of names) {
      const idx = headers.findIndex(h =>
        h.toLowerCase().replace(/[^a-z0-9äöü]/gi, '').includes(
          name.toLowerCase().replace(/[^a-z0-9äöü]/gi, ''),
        ),
      );
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const dateCol = colIndex(['Buchungstag', 'Buchungsdatum']);
  const amountCol = colIndex(['Betrag']);
  const payeeCol = colIndex([
    'Beguenstigter/Zahlungspflichtiger',
    'Begünstigter/Zahlungspflichtiger',
    'Beguenstigter',
    'Begünstigter',
    'Zahlungspflichtiger',
  ]);
  const notesCol = colIndex(['Verwendungszweck']);
  const ibanCol = colIndex(['Kontonummer/IBAN', 'Kontonummer', 'IBAN']);
  const buchungstextCol = colIndex(['Buchungstext']);

  if (dateCol === -1 || amountCol === -1) {
    return {
      rows: [],
      errors: ['Sparkasse-Format: Pflichtfelder (Datum, Betrag) nicht gefunden.'],
      bankName: 'Sparkasse',
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
      // Combine Verwendungszweck and Buchungstext for notes
      const vz = notesCol !== -1 ? (cols[notesCol]?.trim() ?? '') : '';
      const bt = buchungstextCol !== -1 ? (cols[buchungstextCol]?.trim() ?? '') : '';
      const notes = [vz, bt].filter(Boolean).join(' — ');
      const iban = ibanCol !== -1 ? (cols[ibanCol]?.trim() ?? undefined) : undefined;

      rows.push({ date, amount, payee, notes, iban });
    } catch (err) {
      errors.push(`Zeile ${i + 1}: ${String(err)}`);
    }
  }

  return { rows, errors, bankName: 'Sparkasse', encoding: 'windows-1252' };
}

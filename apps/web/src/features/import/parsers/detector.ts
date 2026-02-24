import type { BankFormat } from './types';

/**
 * Auto-detects the bank statement format from file content and filename.
 *
 * Returns the detected format or null if no match. Checks structured
 * formats (MT940, CAMT.053) first, then CSV heuristics by bank.
 */
export function detectBankFormat(
  content: string,
  fileName: string,
): BankFormat | null {
  const trimmed = content.trim();
  const lower = trimmed.toLowerCase();
  const fileNameLower = fileName.toLowerCase();

  // --- MT940: Tag-based SWIFT format ---
  // Starts with :20: or contains :60F: balance tag
  if (/^:20:/m.test(trimmed) || /:60F:/m.test(trimmed)) {
    return 'mt940';
  }

  // --- CAMT.053: XML with ISO 20022 namespace ---
  if (
    lower.includes('<document') &&
    (lower.includes('camt.053') || lower.includes('bktocstmrstmt'))
  ) {
    return 'camt053';
  }
  // Also detect by file extension + XML content
  if (
    (fileNameLower.endsWith('.xml') || fileNameLower.endsWith('.camt')) &&
    lower.includes('<document') &&
    lower.includes('stmt')
  ) {
    return 'camt053';
  }

  // --- CSV-based formats (check header row patterns) ---
  // Take the first ~20 lines for header detection
  const headerLines = trimmed.split(/\r?\n/).slice(0, 20).join('\n');

  // DKB: header contains "Buchungstag" or "Buchungsdatum" + semicolon-separated
  if (
    (headerLines.includes('Buchungstag') || headerLines.includes('Buchungsdatum')) &&
    headerLines.includes(';') &&
    (headerLines.includes('Wertstellung') || headerLines.includes('Betrag'))
  ) {
    return 'dkb';
  }

  // ING: header contains "Buchung" + "Valuta" + semicolon
  if (
    headerLines.includes('Buchung') &&
    headerLines.includes('Valuta') &&
    headerLines.includes(';')
  ) {
    return 'ing';
  }

  // Sparkasse: header contains "Auftragskonto" + semicolon
  if (headerLines.includes('Auftragskonto') && headerLines.includes(';')) {
    return 'sparkasse';
  }

  // Commerzbank: header contains "Buchungstag" + "Umsatzart"
  if (headerLines.includes('Buchungstag') && headerLines.includes('Umsatzart')) {
    return 'commerzbank';
  }

  // N26: header contains "Date" + "Payee" (English format) or "Datum" + comma-separated
  if (
    headerLines.includes('"Date"') &&
    headerLines.includes('"Payee"') &&
    headerLines.includes(',')
  ) {
    return 'n26';
  }

  // File extension hints
  if (fileNameLower.endsWith('.sta') || fileNameLower.endsWith('.mt940')) {
    return 'mt940';
  }

  return null;
}

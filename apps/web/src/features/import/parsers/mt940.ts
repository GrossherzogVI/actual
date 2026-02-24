import type { ParsedRow, ParserResult, StatementMetadata } from './types';

/**
 * Parses MT940 YYMMDD date to ISO format: "260224" -> "2026-02-24"
 */
function parseMt940Date(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length < 6) return trimmed;
  const yy = trimmed.slice(0, 2);
  const mm = trimmed.slice(2, 4);
  const dd = trimmed.slice(4, 6);
  // MT940 uses 2-digit year; assume 20xx for values 00-99
  const year = parseInt(yy, 10) >= 80 ? `19${yy}` : `20${yy}`;
  return `${year}-${mm}-${dd}`;
}

/**
 * Parses MT940 amount: "1234,56" -> 1234.56
 * MT940 uses comma as decimal separator, no thousands separator.
 */
function parseMt940Amount(text: string): number {
  const cleaned = text.replace(/\s/g, '').replace(',', '.');
  const value = parseFloat(cleaned);
  if (isNaN(value)) {
    throw new Error(`Betrag nicht lesbar: "${text}"`);
  }
  return value;
}

/**
 * Extracts an IBAN from a text block using a regex pattern.
 */
function extractIban(text: string): string | undefined {
  const match = text.match(/[A-Z]{2}\d{2}[A-Z0-9]{4,30}/);
  return match ? match[0] : undefined;
}

/**
 * Splits an MT940 file into individual statement blocks (each starts with :20:).
 */
function splitStatements(content: string): string[] {
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  // Split at :20: tags, keeping the tag with each block
  const blocks = normalized.split(/(?=^:20:)/m);
  return blocks.filter(b => b.includes(':20:'));
}

/**
 * Parses the :86: information block to extract payee and Verwendungszweck.
 * German banks use structured formats with ?20-?29 for Verwendungszweck,
 * ?32-?33 for payee name.
 */
function parse86Field(text: string): { payee: string; notes: string; iban?: string } {
  const lines = text.replace(/\n/g, '');

  // Try structured format with ?XX subfields
  if (lines.includes('?')) {
    const subfields = new Map<string, string>();
    const parts = lines.split('?');
    for (const part of parts) {
      if (part.length >= 2) {
        const code = part.slice(0, 2);
        const value = part.slice(2);
        if (/^\d{2}$/.test(code)) {
          const existing = subfields.get(code) ?? '';
          subfields.set(code, existing + value);
        }
      }
    }

    // ?32 + ?33 = payee name
    const payee = [subfields.get('32'), subfields.get('33')]
      .filter(Boolean)
      .join(' ')
      .trim();

    // ?20-?29 = Verwendungszweck
    const noteParts: string[] = [];
    for (let i = 20; i <= 29; i++) {
      const code = i.toString().padStart(2, '0');
      const val = subfields.get(code);
      if (val) noteParts.push(val);
    }
    const notes = noteParts.join(' ').trim();

    // ?38 = IBAN of counterparty
    const iban = subfields.get('38')?.trim() || extractIban(lines);

    return { payee, notes, iban };
  }

  // Unstructured format: first line is often the payee, rest is notes
  const iban = extractIban(lines);
  const trimmed = lines.trim();
  return { payee: trimmed.slice(0, 70), notes: trimmed, iban };
}

/**
 * Parses an MT940 balance tag (:60F:, :62F:) to extract the balance amount.
 * Format: C/D YYMMDD CURRENCY AMOUNT
 * Example: C260224EUR1234,56
 */
function parseBalanceTag(value: string): number | undefined {
  // Pattern: [C|D] YYMMDD CUR AMOUNT
  const match = value.match(/^([CD])(\d{6})([A-Z]{3})(\d+,\d*)/);
  if (!match) return undefined;
  const sign = match[1] === 'D' ? -1 : 1;
  const amount = parseMt940Amount(match[4]);
  return sign * amount;
}

/**
 * Parses an MT940 :25: account field to extract IBAN or account number.
 * Can be IBAN format (DE89370400440532013000) or BLZ/account (37040044/0532013000).
 */
function parseAccountField(value: string): string | undefined {
  const trimmed = value.trim();
  // Try IBAN first
  const iban = extractIban(trimmed);
  if (iban) return iban;
  // Return raw value
  return trimmed || undefined;
}

/**
 * MT940 (SWIFT) bank statement parser.
 *
 * Parses the MT940/MT942 format used by German banks for electronic
 * account statements. Handles multi-statement files.
 *
 * Tag reference:
 *   :20:  Transaction Reference
 *   :25:  Account Identification
 *   :28C: Statement/Sequence Number
 *   :60F: Opening Balance
 *   :61:  Statement Line (transaction)
 *   :86:  Transaction Information
 *   :62F: Closing Balance
 */
export function parseMt940(content: string): ParserResult {
  if (!content || !content.trim()) {
    return {
      rows: [],
      errors: ['Leere Datei.'],
      bankName: 'MT940',
      encoding: 'utf-8',
    };
  }

  const statements = splitStatements(content);
  if (statements.length === 0) {
    return {
      rows: [],
      errors: ['MT940-Format nicht erkannt: Kein :20:-Tag gefunden.'],
      bankName: 'MT940',
      encoding: 'utf-8',
    };
  }

  const rows: ParsedRow[] = [];
  const errors: string[] = [];
  let accountIban: string | undefined;
  let openingBalance: number | undefined;
  let closingBalance: number | undefined;
  let statementId: string | undefined;
  let statementDate: string | undefined;

  for (const block of statements) {
    const lines = block.split('\n');

    // Collect tag values (tags can span multiple lines until next tag)
    const tags: Array<{ tag: string; value: string }> = [];
    let currentTag = '';
    let currentValue = '';

    for (const line of lines) {
      const tagMatch = line.match(/^:(\d{2}[A-Z]?|NS):(.*)/);
      if (tagMatch) {
        if (currentTag) {
          tags.push({ tag: currentTag, value: currentValue });
        }
        currentTag = tagMatch[1];
        currentValue = tagMatch[2];
      } else if (currentTag) {
        // Continuation line
        currentValue += '\n' + line;
      }
    }
    if (currentTag) {
      tags.push({ tag: currentTag, value: currentValue });
    }

    // Process tags
    let pending61: string | null = null;

    for (const { tag, value } of tags) {
      switch (tag) {
        case '20': {
          if (!statementId) statementId = value.trim();
          break;
        }
        case '25': {
          if (!accountIban) accountIban = parseAccountField(value);
          break;
        }
        case '60F': {
          const bal = parseBalanceTag(value.trim());
          if (bal !== undefined && openingBalance === undefined) {
            openingBalance = bal;
          }
          break;
        }
        case '62F': {
          const bal = parseBalanceTag(value.trim());
          if (bal !== undefined) {
            closingBalance = bal;
          }
          break;
        }
        case '61': {
          // If there was a previous :61: without a :86:, flush it
          if (pending61) {
            try {
              const row = parse61Line(pending61, undefined);
              if (row) rows.push(row);
            } catch (err) {
              errors.push(`Transaktionszeile: ${String(err)}`);
            }
          }
          pending61 = value.trim();
          break;
        }
        case '86': {
          if (pending61) {
            try {
              const row = parse61Line(pending61, value);
              if (row) rows.push(row);
            } catch (err) {
              errors.push(`Transaktionszeile: ${String(err)}`);
            }
            pending61 = null;
          }
          break;
        }
      }
    }

    // Flush last pending :61: without :86:
    if (pending61) {
      try {
        const row = parse61Line(pending61, undefined);
        if (row) rows.push(row);
      } catch (err) {
        errors.push(`Transaktionszeile: ${String(err)}`);
      }
    }
  }

  // Extract statement date from closing balance or last transaction
  if (rows.length > 0) {
    statementDate = rows[rows.length - 1].date;
  }

  const metadata: StatementMetadata = {
    accountIban,
    openingBalance,
    closingBalance,
    statementDate,
    statementId,
  };

  return { rows, errors, bankName: 'MT940', encoding: 'utf-8', metadata };
}

/**
 * Parses an :61: statement line.
 *
 * Format: YYMMDD[MMDD] [C|D|RC|RD] [F|N|S] AMOUNT TTTCOD REFERENCE
 * Example: 2602240224D123,45NMSCNONREF
 *
 * The date part: YYMMDD for value date, optional MMDD for booking date.
 * C = Credit, D = Debit, RC = Reversal Credit, RD = Reversal Debit
 */
function parse61Line(line61: string, info86: string | undefined): ParsedRow | null {
  const text = line61.replace(/\n/g, '');

  // Extract value date (6 digits)
  const dateStr = text.slice(0, 6);
  if (!/^\d{6}$/.test(dateStr)) {
    throw new Error(`Ungültiges Datum in :61:-Zeile: "${dateStr}"`);
  }
  const date = parseMt940Date(dateStr);

  // After date, optional 4-digit booking date (MMDD), then C/D/RC/RD
  let pos = 6;
  // Skip optional booking date
  if (/^\d{4}[CDRcdr]/.test(text.slice(pos))) {
    pos += 4;
  }

  // Extract debit/credit indicator
  let sign = 1;
  if (text.slice(pos, pos + 2) === 'RD' || text.slice(pos, pos + 2) === 'RC') {
    sign = text.slice(pos, pos + 2) === 'RD' ? 1 : -1; // Reversal: opposite
    pos += 2;
  } else if (text[pos] === 'D' || text[pos] === 'd') {
    sign = -1;
    pos++;
  } else if (text[pos] === 'C' || text[pos] === 'c') {
    sign = 1;
    pos++;
  }

  // Optional third character for funds code (letter)
  if (/^[A-Za-z]/.test(text[pos]) && /\d/.test(text[pos + 1] ?? '')) {
    pos++;
  }

  // Extract amount: digits and comma, until next letter
  const amountMatch = text.slice(pos).match(/^(\d+,\d*)/);
  if (!amountMatch) {
    throw new Error(`Betrag nicht gefunden in :61:-Zeile: "${text}"`);
  }
  const amount = sign * parseMt940Amount(amountMatch[1]);
  pos += amountMatch[1].length;

  // Transaction type (1 letter) + code (3 letters) — e.g., NMSC
  // Skip these for now
  const typeMatch = text.slice(pos).match(/^[A-Z][A-Z0-9]{3}/);
  if (typeMatch) {
    pos += 4;
  }

  // Remaining text is reference
  const reference = text.slice(pos).trim();

  // Parse :86: field for payee/notes
  let payee = '';
  let notes = reference;
  let iban: string | undefined;

  if (info86) {
    const parsed = parse86Field(info86);
    payee = parsed.payee;
    notes = parsed.notes || reference;
    iban = parsed.iban;
  }

  return { date, amount, payee, notes, iban, reference };
}

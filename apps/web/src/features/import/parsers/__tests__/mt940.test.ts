import { describe, expect, it } from 'vitest';

import { parseMt940 } from '../mt940';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid MT940 block — one credit transaction. */
const SINGLE_CREDIT_BLOCK = `\
:20:STARTUMSE
:25:DE89370400440532013000
:28C:00001/001
:60F:C260224EUR1000,00
:61:260224C100,00NMSCNONREF
:86:?20Gehalt Februar?32Max Mustermann
:62F:C260224EUR1100,00
`;

/** Minimal valid MT940 block — one debit transaction. */
const SINGLE_DEBIT_BLOCK = `\
:20:STARTUMSE
:25:DE89370400440532013000
:28C:00001/001
:60F:C260224EUR500,00
:61:260224D50,00NMSCNONREF
:86:?20Einkauf REWE?32REWE Markt
:62F:C260224EUR450,00
`;

// ---------------------------------------------------------------------------
// Basic parsing
// ---------------------------------------------------------------------------
describe('parseMt940', () => {
  describe('empty and malformed input', () => {
    it('returns empty rows and an error for an empty string', () => {
      const result = parseMt940('');
      expect(result.rows).toHaveLength(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('returns empty rows and an error for whitespace-only input', () => {
      const result = parseMt940('   \n  ');
      expect(result.rows).toHaveLength(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('returns an error when the :20: tag is missing', () => {
      const result = parseMt940(':25:DE89370400440532013000\n:28C:00001/001\n');
      expect(result.rows).toHaveLength(0);
      expect(result.errors.some(e => e.includes(':20:'))).toBe(true);
    });

    it('always reports bankName as MT940 and encoding as utf-8', () => {
      const result = parseMt940('');
      expect(result.bankName).toBe('MT940');
      expect(result.encoding).toBe('utf-8');
    });
  });

  // -------------------------------------------------------------------------
  // Single transaction
  // -------------------------------------------------------------------------
  describe('single credit transaction', () => {
    it('returns exactly one row', () => {
      const result = parseMt940(SINGLE_CREDIT_BLOCK);
      expect(result.errors).toHaveLength(0);
      expect(result.rows).toHaveLength(1);
    });

    it('parses amount as positive for a credit (C)', () => {
      const { rows } = parseMt940(SINGLE_CREDIT_BLOCK);
      expect(rows[0].amount).toBe(100);
    });

    it('parses payee from ?32 subfield', () => {
      const { rows } = parseMt940(SINGLE_CREDIT_BLOCK);
      expect(rows[0].payee).toBe('Max Mustermann');
    });

    it('parses date as ISO "2026-02-24" from :61: value date 260224', () => {
      const { rows } = parseMt940(SINGLE_CREDIT_BLOCK);
      expect(rows[0].date).toBe('2026-02-24');
    });

    it('parses notes from ?20 subfield', () => {
      const { rows } = parseMt940(SINGLE_CREDIT_BLOCK);
      expect(rows[0].notes).toBe('Gehalt Februar');
    });
  });

  describe('single debit transaction', () => {
    it('parses amount as negative for a debit (D)', () => {
      const { rows } = parseMt940(SINGLE_DEBIT_BLOCK);
      expect(rows[0].amount).toBe(-50);
    });

    it('parses payee from ?32 subfield for a debit', () => {
      const { rows } = parseMt940(SINGLE_DEBIT_BLOCK);
      expect(rows[0].payee).toBe('REWE Markt');
    });
  });

  // -------------------------------------------------------------------------
  // Multiple transactions
  // -------------------------------------------------------------------------
  describe('multiple transactions in one statement', () => {
    const MULTI_BLOCK = `\
:20:STARTUMSE
:25:DE89370400440532013000
:28C:00001/001
:60F:C260224EUR2000,00
:61:260224C500,00NMSCREF001
:86:?20Gehalt?32Arbeitgeber GmbH
:61:260224D200,00NMSCREF002
:86:?20Miete?32Vermieter KG
:61:260224D75,00NMSCREF003
:86:?20Strom?32Stadtwerke
:62F:C260224EUR2225,00
`;

    it('returns three rows for three :61: blocks', () => {
      const { rows, errors } = parseMt940(MULTI_BLOCK);
      expect(errors).toHaveLength(0);
      expect(rows).toHaveLength(3);
    });

    it('parses first transaction as credit', () => {
      const { rows } = parseMt940(MULTI_BLOCK);
      expect(rows[0].amount).toBe(500);
      expect(rows[0].payee).toBe('Arbeitgeber GmbH');
    });

    it('parses second transaction as debit', () => {
      const { rows } = parseMt940(MULTI_BLOCK);
      expect(rows[1].amount).toBe(-200);
      expect(rows[1].payee).toBe('Vermieter KG');
    });

    it('parses third transaction as debit', () => {
      const { rows } = parseMt940(MULTI_BLOCK);
      expect(rows[2].amount).toBe(-75);
      expect(rows[2].payee).toBe('Stadtwerke');
    });
  });

  // -------------------------------------------------------------------------
  // Multi-statement files (two :20: blocks)
  // -------------------------------------------------------------------------
  describe('multi-statement file', () => {
    const TWO_STATEMENTS = `\
:20:STMT001
:25:DE89370400440532013000
:28C:00001/001
:60F:C260224EUR1000,00
:61:260224C100,00NMSCREF1
:86:?20Überweisung?32Sender A
:62F:C260224EUR1100,00
:20:STMT002
:25:DE89370400440532013000
:28C:00002/001
:60F:C260225EUR1100,00
:61:260225D300,00NMSCREF2
:86:?20Lastschrift?32Empfänger B
:62F:C260225EUR800,00
`;

    it('combines rows from both statement blocks', () => {
      const { rows, errors } = parseMt940(TWO_STATEMENTS);
      expect(errors).toHaveLength(0);
      expect(rows).toHaveLength(2);
    });

    it('first row comes from first statement (credit)', () => {
      const { rows } = parseMt940(TWO_STATEMENTS);
      expect(rows[0].amount).toBe(100);
      expect(rows[0].payee).toBe('Sender A');
    });

    it('second row comes from second statement (debit)', () => {
      const { rows } = parseMt940(TWO_STATEMENTS);
      expect(rows[1].amount).toBe(-300);
      expect(rows[1].payee).toBe('Empfänger B');
    });
  });

  // -------------------------------------------------------------------------
  // :86: field parsing — structured subfields
  // -------------------------------------------------------------------------
  describe(':86: structured subfields', () => {
    it('combines ?32 and ?33 into a single payee string', () => {
      const block = `\
:20:TEST
:25:DE89370400440532013000
:28C:00001/001
:60F:C260224EUR500,00
:61:260224C50,00NMSCREF
:86:?20Zweck?32First Name?33Last Name
:62F:C260224EUR550,00
`;
      const { rows } = parseMt940(block);
      expect(rows[0].payee).toBe('First Name Last Name');
    });

    it('concatenates ?20–?29 subfields into notes', () => {
      const block = `\
:20:TEST
:25:DE89370400440532013000
:28C:00001/001
:60F:C260224EUR500,00
:61:260224C10,00NMSCREF
:86:?20Part one?21 part two?32Payee
:62F:C260224EUR510,00
`;
      const { rows } = parseMt940(block);
      expect(rows[0].notes).toContain('Part one');
      expect(rows[0].notes).toContain('part two');
    });

    it('extracts IBAN from ?38 subfield', () => {
      const block = `\
:20:TEST
:25:DE89370400440532013000
:28C:00001/001
:60F:C260224EUR500,00
:61:260224C25,00NMSCREF
:86:?20Zahlung?32Remote Bank?38DE89370400440532013000
:62F:C260224EUR525,00
`;
      const { rows } = parseMt940(block);
      expect(rows[0].iban).toBe('DE89370400440532013000');
    });
  });

  // -------------------------------------------------------------------------
  // :86: field parsing — unstructured format
  // -------------------------------------------------------------------------
  describe(':86: unstructured format', () => {
    it('uses the first 70 characters as the payee when no ?-subfields are present', () => {
      const longText = 'A'.repeat(80);
      const block = `:20:TEST\n:25:DE89370400440532013000\n:28C:00001/001\n:60F:C260224EUR500,00\n:61:260224C10,00NMSCREF\n:86:${longText}\n:62F:C260224EUR510,00\n`;
      const { rows } = parseMt940(block);
      expect(rows[0].payee).toBe('A'.repeat(70));
    });

    it('sets notes to the full unstructured text', () => {
      const text = 'Unstructured payment info for goods and services';
      const block = `:20:TEST\n:25:DE89370400440532013000\n:28C:00001/001\n:60F:C260224EUR500,00\n:61:260224C10,00NMSCREF\n:86:${text}\n:62F:C260224EUR510,00\n`;
      const { rows } = parseMt940(block);
      expect(rows[0].notes).toContain(text);
    });
  });

  // -------------------------------------------------------------------------
  // Balance tags
  // -------------------------------------------------------------------------
  describe(':60F: opening balance', () => {
    it('parses a credit opening balance into metadata.openingBalance', () => {
      const { metadata } = parseMt940(SINGLE_CREDIT_BLOCK);
      expect(metadata?.openingBalance).toBe(1000);
    });

    it('parses a debit opening balance as a negative number', () => {
      const block = `\
:20:TEST
:25:DE89370400440532013000
:28C:00001/001
:60F:D260224EUR500,00
:61:260224C100,00NMSCREF
:86:?20Test?32Somebody
:62F:C260224EUR400,00
`;
      const { metadata } = parseMt940(block);
      expect(metadata?.openingBalance).toBe(-500);
    });
  });

  describe(':62F: closing balance', () => {
    it('parses the credit closing balance into metadata.closingBalance', () => {
      const { metadata } = parseMt940(SINGLE_CREDIT_BLOCK);
      expect(metadata?.closingBalance).toBe(1100);
    });
  });

  // -------------------------------------------------------------------------
  // Account IBAN from :25:
  // -------------------------------------------------------------------------
  describe(':25: account identification', () => {
    it('extracts the account IBAN from the :25: field into metadata.accountIban', () => {
      const { metadata } = parseMt940(SINGLE_CREDIT_BLOCK);
      expect(metadata?.accountIban).toBe('DE89370400440532013000');
    });
  });

  // -------------------------------------------------------------------------
  // :61: without a following :86:
  // -------------------------------------------------------------------------
  describe(':61: without :86:', () => {
    it('still creates a row with empty payee when :86: is missing', () => {
      const block = `\
:20:TEST
:25:DE89370400440532013000
:28C:00001/001
:60F:C260224EUR500,00
:61:260224C75,00NMSCNONREF
:62F:C260224EUR575,00
`;
      const { rows, errors } = parseMt940(block);
      expect(errors).toHaveLength(0);
      expect(rows).toHaveLength(1);
      expect(rows[0].amount).toBe(75);
      expect(rows[0].payee).toBe('');
    });
  });

  // -------------------------------------------------------------------------
  // Reversal transactions
  // -------------------------------------------------------------------------
  describe('reversal transactions', () => {
    it('parses RD (reversal debit) as a positive amount', () => {
      const block = `\
:20:TEST
:25:DE89370400440532013000
:28C:00001/001
:60F:C260224EUR500,00
:61:260224RD50,00NMSCREF
:86:?20Rueckbuchung?32Sender
:62F:C260224EUR550,00
`;
      const { rows } = parseMt940(block);
      expect(rows[0].amount).toBe(50);
    });

    it('parses RC (reversal credit) as a negative amount', () => {
      const block = `\
:20:TEST
:25:DE89370400440532013000
:28C:00001/001
:60F:C260224EUR1000,00
:61:260224RC100,00NMSCREF
:86:?20Rueckbuchung?32Empfaenger
:62F:C260224EUR900,00
`;
      const { rows } = parseMt940(block);
      expect(rows[0].amount).toBe(-100);
    });
  });

  // -------------------------------------------------------------------------
  // Amount parsing
  // -------------------------------------------------------------------------
  describe('amount parsing', () => {
    it('parses comma-decimal amounts: "1234,56" → 1234.56', () => {
      const block = `\
:20:TEST
:25:DE89370400440532013000
:28C:00001/001
:60F:C260224EUR5000,00
:61:260224C1234,56NMSCREF
:86:?20Zahlung?32Jemand
:62F:C260224EUR6234,56
`;
      const { rows } = parseMt940(block);
      expect(rows[0].amount).toBeCloseTo(1234.56, 2);
    });

    it('parses an amount with zero decimal part: "100,00" → 100', () => {
      const { rows } = parseMt940(SINGLE_CREDIT_BLOCK);
      expect(rows[0].amount).toBe(100);
    });
  });

  // -------------------------------------------------------------------------
  // Date parsing — year pivot
  // -------------------------------------------------------------------------
  describe('date year pivot', () => {
    // The implementation: parseInt(yy) >= 80 → 19xx, else 20xx

    it('treats yy=79 as 20xx, giving "2079-01-01" for 790101', () => {
      // 79 < 80 → 20xx
      const block = `\
:20:TEST
:25:DE89370400440532013000
:28C:00001/001
:60F:C790101EUR100,00
:61:790101C10,00NMSCREF
:86:?20Test?32Someone
:62F:C790101EUR110,00
`;
      const { rows } = parseMt940(block);
      expect(rows[0].date).toBe('2079-01-01');
    });

    it('treats yy=80 as 19xx, giving "1980-01-01" for 800101', () => {
      // 80 >= 80 → 19xx
      const block = `\
:20:TEST
:25:DE89370400440532013000
:28C:00001/001
:60F:C800101EUR100,00
:61:800101C10,00NMSCREF
:86:?20Test?32Someone
:62F:C800101EUR110,00
`;
      const { rows } = parseMt940(block);
      expect(rows[0].date).toBe('1980-01-01');
    });

    it('treats yy=26 as 20xx, giving "2026-02-24" for 260224', () => {
      const { rows } = parseMt940(SINGLE_CREDIT_BLOCK);
      expect(rows[0].date).toBe('2026-02-24');
    });
  });

  // -------------------------------------------------------------------------
  // :61: with optional booking date (10-digit prefix: YYMMDD + MMDD)
  // -------------------------------------------------------------------------
  describe(':61: with optional booking date', () => {
    it('correctly parses a transaction when a 4-digit booking date follows the value date', () => {
      // Value date 260224, booking date 0228, then C100,00
      const block = `\
:20:TEST
:25:DE89370400440532013000
:28C:00001/001
:60F:C260224EUR500,00
:61:2602240228C100,00NMSCREF
:86:?20Test?32Payee
:62F:C260224EUR600,00
`;
      const { rows, errors } = parseMt940(block);
      expect(errors).toHaveLength(0);
      expect(rows).toHaveLength(1);
      expect(rows[0].amount).toBe(100);
      expect(rows[0].date).toBe('2026-02-24');
    });
  });

  // -------------------------------------------------------------------------
  // Malformed :61: — error collection
  // -------------------------------------------------------------------------
  describe('malformed :61: handling', () => {
    it('collects an error for a malformed :61: but still parses valid transactions', () => {
      const block = `\
:20:TEST
:25:DE89370400440532013000
:28C:00001/001
:60F:C260224EUR500,00
:61:BADDATA
:86:?20Bad?32Entry
:61:260224C50,00NMSCREF
:86:?20Good?32Entry
:62F:C260224EUR550,00
`;
      const { rows, errors } = parseMt940(block);
      // At least one error collected from the malformed :61:
      expect(errors.length).toBeGreaterThan(0);
      // The valid transaction is still parsed — payee comes from ?32 subfield
      expect(rows.some(r => r.payee === 'Entry')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // CRLF line endings
  // -------------------------------------------------------------------------
  describe('CRLF line endings', () => {
    it('parses a file with Windows CRLF line endings correctly', () => {
      const crlfBlock = SINGLE_CREDIT_BLOCK.replace(/\n/g, '\r\n');
      const { rows, errors } = parseMt940(crlfBlock);
      expect(errors).toHaveLength(0);
      expect(rows).toHaveLength(1);
      expect(rows[0].amount).toBe(100);
    });
  });

  // -------------------------------------------------------------------------
  // IBAN extracted from :86: ?38 subfield
  // -------------------------------------------------------------------------
  describe('IBAN from ?38 subfield', () => {
    it('sets row.iban from the ?38 subfield value', () => {
      const block = `\
:20:TEST
:25:DE89370400440532013000
:28C:00001/001
:60F:C260224EUR500,00
:61:260224C30,00NMSCREF
:86:?20Test?32Counter Party?38GB29NWBK60161331926819
:62F:C260224EUR530,00
`;
      const { rows } = parseMt940(block);
      expect(rows[0].iban).toBe('GB29NWBK60161331926819');
    });
  });

  // -------------------------------------------------------------------------
  // Performance — large file
  // -------------------------------------------------------------------------
  describe('performance', () => {
    it('parses a file with 100+ transactions in under 100ms', () => {
      // Build a file with 110 transactions
      const txLine = ':61:260224C10,00NMSCREF\n:86:?20Zahlung?32Payee Name\n';
      const block =
        ':20:PERF\n:25:DE89370400440532013000\n:28C:00001/001\n:60F:C260224EUR10000,00\n' +
        txLine.repeat(110) +
        ':62F:C260224EUR11100,00\n';

      const start = Date.now();
      const { rows, errors } = parseMt940(block);
      const elapsed = Date.now() - start;

      expect(errors).toHaveLength(0);
      expect(rows).toHaveLength(110);
      expect(elapsed).toBeLessThan(100);
    });
  });
});

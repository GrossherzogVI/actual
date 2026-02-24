import { describe, it, expect } from 'vitest';

import { generateSepaXml } from '../sepa-xml';
import type { SepaPayment, PayerInfo } from '../types';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

/** A valid payer using a real German IBAN (mod-97 passes). */
const VALID_PAYER: PayerInfo = {
  name: 'Max Mustermann',
  iban: 'DE89370400440532013000',
  bic: 'COBADEFFXXX',
};

/** Factory for a valid SepaPayment object. Overrideable per test. */
function makePayment(overrides: Partial<SepaPayment> = {}): SepaPayment {
  return {
    id: 'pay-001',
    payee_name: 'Vermieter GmbH',
    iban: 'DE75512108001245126199',
    bic: 'SSKMDEMMXXX',
    amount: 850.0,
    reference: 'Miete März 2026',
    execution_date: '2026-03-01',
    status: 'draft',
    created_at: '2026-02-24T12:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('generateSepaXml', () => {
  // -------------------------------------------------------------------------
  // Valid generation
  // -------------------------------------------------------------------------

  describe('valid single payment', () => {
    it('returns ok=true for a valid payment', () => {
      const result = generateSepaXml([makePayment()], VALID_PAYER);
      expect(result.ok).toBe(true);
    });

    it('returns an xml string', () => {
      const result = generateSepaXml([makePayment()], VALID_PAYER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(typeof result.xml).toBe('string');
      expect(result.xml.length).toBeGreaterThan(0);
    });

    it('contains pain.001.003.03 namespace declaration', () => {
      const result = generateSepaXml([makePayment()], VALID_PAYER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.xml).toContain('pain.001.003.03');
    });

    it('is well-formed XML starting with XML declaration', () => {
      const result = generateSepaXml([makePayment()], VALID_PAYER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.xml.trimStart()).toMatch(/^<\?xml/);
    });

    it('contains NbOfTxs = 1', () => {
      const result = generateSepaXml([makePayment()], VALID_PAYER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // At least one occurrence (GrpHdr and PmtInf both include it)
      expect(result.xml).toContain('<NbOfTxs>1</NbOfTxs>');
    });

    it('contains CtrlSum equal to the payment amount formatted to 2dp', () => {
      const result = generateSepaXml([makePayment({ amount: 850.0 })], VALID_PAYER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.xml).toContain('<CtrlSum>850.00</CtrlSum>');
    });

    it('contains MsgId element', () => {
      const result = generateSepaXml([makePayment()], VALID_PAYER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.xml).toMatch(/<MsgId>FINOS-\d+<\/MsgId>/);
    });

    it('contains payer name in Dbtr section', () => {
      const result = generateSepaXml([makePayment()], VALID_PAYER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.xml).toContain('<Nm>Max Mustermann</Nm>');
    });

    it('contains payer IBAN in DbtrAcct section', () => {
      const result = generateSepaXml([makePayment()], VALID_PAYER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // Payer IBAN should appear (spaces stripped)
      expect(result.xml).toContain('<IBAN>DE89370400440532013000</IBAN>');
    });

    it('contains payer BIC in DbtrAgt section', () => {
      const result = generateSepaXml([makePayment()], VALID_PAYER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.xml).toContain('<BIC>COBADEFFXXX</BIC>');
    });

    it('contains payment payee name in Cdtr section', () => {
      const result = generateSepaXml([makePayment({ payee_name: 'Vermieter GmbH' })], VALID_PAYER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.xml).toContain('<Nm>Vermieter GmbH</Nm>');
    });

    it('contains payment IBAN in CdtrAcct section', () => {
      const result = generateSepaXml([makePayment()], VALID_PAYER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.xml).toContain('<IBAN>DE75512108001245126199</IBAN>');
    });

    it('contains payment BIC in CdtrAgt section', () => {
      const result = generateSepaXml([makePayment({ bic: 'SSKMDEMMXXX' })], VALID_PAYER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.xml).toContain('<BIC>SSKMDEMMXXX</BIC>');
    });

    it('contains formatted amount with Ccy="EUR"', () => {
      const result = generateSepaXml([makePayment({ amount: 850.0 })], VALID_PAYER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.xml).toContain('<InstdAmt Ccy="EUR">850.00</InstdAmt>');
    });

    it('contains reference (Ustrd) in RmtInf', () => {
      const result = generateSepaXml([makePayment({ reference: 'Miete März 2026' })], VALID_PAYER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.xml).toContain('<Ustrd>Miete März 2026</Ustrd>');
    });
  });

  describe('multiple payments', () => {
    it('NbOfTxs matches payment count', () => {
      const payments = [makePayment({ id: 'p1', amount: 100 }), makePayment({ id: 'p2', amount: 200 })];
      const result = generateSepaXml(payments, VALID_PAYER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.xml).toContain('<NbOfTxs>2</NbOfTxs>');
    });

    it('CtrlSum equals sum of all amounts', () => {
      const payments = [
        makePayment({ id: 'p1', amount: 100.5 }),
        makePayment({ id: 'p2', amount: 200.25 }),
        makePayment({ id: 'p3', amount: 49.25 }),
      ];
      const result = generateSepaXml(payments, VALID_PAYER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // 100.50 + 200.25 + 49.25 = 350.00
      expect(result.xml).toContain('<CtrlSum>350.00</CtrlSum>');
    });

    it('generates one CdtTrfTxInf block per payment', () => {
      const payments = [makePayment({ id: 'p1' }), makePayment({ id: 'p2' }), makePayment({ id: 'p3' })];
      const result = generateSepaXml(payments, VALID_PAYER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const matches = result.xml.match(/<CdtTrfTxInf>/g) ?? [];
      expect(matches).toHaveLength(3);
    });
  });

  describe('XML character escaping', () => {
    it('escapes ampersand in payee name', () => {
      const result = generateSepaXml(
        [makePayment({ payee_name: 'Müller & Söhne GmbH' })],
        VALID_PAYER,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.xml).toContain('Müller &amp; Söhne GmbH');
      expect(result.xml).not.toContain('Müller & Söhne GmbH');
    });

    it('escapes < and > in reference', () => {
      const result = generateSepaXml(
        [makePayment({ reference: 'Ref <123> Test' })],
        VALID_PAYER,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.xml).toContain('Ref &lt;123&gt; Test');
    });

    it('escapes double-quote in payer name', () => {
      const payer: PayerInfo = { ...VALID_PAYER, name: 'Firma "Alpha" GmbH' };
      const result = generateSepaXml([makePayment()], payer);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.xml).toContain('Firma &quot;Alpha&quot; GmbH');
    });
  });

  describe('reference truncation', () => {
    it('truncates reference to 140 characters', () => {
      const longRef = 'X'.repeat(200);
      const result = generateSepaXml([makePayment({ reference: longRef })], VALID_PAYER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.xml).toContain('<Ustrd>' + 'X'.repeat(140) + '</Ustrd>');
    });

    it('does not truncate references under 140 chars', () => {
      const shortRef = 'Miete März 2026 — Wohnung Berlin';
      const result = generateSepaXml([makePayment({ reference: shortRef })], VALID_PAYER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.xml).toContain(`<Ustrd>${shortRef}</Ustrd>`);
    });
  });

  describe('amount formatting', () => {
    it('formats amount with exactly 2 decimal places', () => {
      const result = generateSepaXml([makePayment({ amount: 10 })], VALID_PAYER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.xml).toContain('<InstdAmt Ccy="EUR">10.00</InstdAmt>');
    });

    it('rounds amount with many decimal places to 2dp', () => {
      // 0.1 + 0.2 = 0.30000000000000004 in JS float
      const result = generateSepaXml([makePayment({ amount: 0.1 + 0.2 })], VALID_PAYER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.xml).toContain('<InstdAmt Ccy="EUR">0.30</InstdAmt>');
    });

    it('accepts minimum valid amount (0.01)', () => {
      const result = generateSepaXml([makePayment({ amount: 0.01 })], VALID_PAYER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.xml).toContain('<InstdAmt Ccy="EUR">0.01</InstdAmt>');
    });
  });

  // -------------------------------------------------------------------------
  // Validation errors
  // -------------------------------------------------------------------------

  describe('validation — payer', () => {
    it('invalid payer IBAN → ok=false, error at index=-1', () => {
      const badPayer: PayerInfo = { ...VALID_PAYER, iban: 'DE00000000000000000000' };
      const result = generateSepaXml([makePayment()], badPayer);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      const err = result.errors.find(e => e.index === -1);
      expect(err).toBeDefined();
      expect(err?.payee_name).toBe('Auftraggeber');
    });

    it('completely invalid payer IBAN format → ok=false', () => {
      const badPayer: PayerInfo = { ...VALID_PAYER, iban: 'NOT-AN-IBAN' };
      const result = generateSepaXml([makePayment()], badPayer);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.errors.some(e => e.index === -1)).toBe(true);
    });
  });

  describe('validation — payment IBAN', () => {
    it('invalid payment IBAN → ok=false, error at correct index', () => {
      const payments = [
        makePayment({ id: 'p1' }),
        makePayment({ id: 'p2', iban: 'DE00000000000000000000' }),
      ];
      const result = generateSepaXml(payments, VALID_PAYER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      const err = result.errors.find(e => e.index === 1);
      expect(err).toBeDefined();
    });

    it('first payment with bad IBAN → error index=0', () => {
      const result = generateSepaXml(
        [makePayment({ iban: 'INVALID' })],
        VALID_PAYER,
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.errors[0].index).toBe(0);
    });
  });

  describe('validation — amounts', () => {
    it('zero amount → ok=false with positive-amount error', () => {
      const result = generateSepaXml([makePayment({ amount: 0 })], VALID_PAYER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      const err = result.errors.find(e => e.index === 0);
      expect(err?.error).toMatch(/positiv|ungültig/i);
    });

    it('negative amount → ok=false with positive-amount error', () => {
      const result = generateSepaXml([makePayment({ amount: -100 })], VALID_PAYER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      const err = result.errors.find(e => e.index === 0);
      expect(err?.error).toMatch(/positiv|ungültig/i);
    });

    it('amount > 999,999,999.99 → ok=false with SEPA maximum error', () => {
      const result = generateSepaXml(
        [makePayment({ amount: 1_000_000_000 })],
        VALID_PAYER,
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      const err = result.errors.find(e => e.index === 0);
      expect(err?.error).toMatch(/Maximum|maximum|999/i);
    });

    it('amount at SEPA maximum (999999999.99) → ok=true', () => {
      const result = generateSepaXml(
        [makePayment({ amount: 999_999_999.99 })],
        VALID_PAYER,
      );
      expect(result.ok).toBe(true);
    });
  });

  describe('validation — BIC', () => {
    it('BIC too short (3 chars) → ok=false', () => {
      const result = generateSepaXml([makePayment({ bic: 'ABX' })], VALID_PAYER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.errors.some(e => e.index === 0 && /BIC/i.test(e.error))).toBe(true);
    });

    it('BIC with wrong character class → ok=false', () => {
      // BIC must be [A-Z0-9] only — spaces are invalid
      const result = generateSepaXml([makePayment({ bic: 'COBA DEFF' })], VALID_PAYER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.errors.some(e => e.index === 0 && /BIC/i.test(e.error))).toBe(true);
    });

    it('BIC with 9 chars (not 8 or 11) → ok=false', () => {
      const result = generateSepaXml([makePayment({ bic: 'COBADEFF0' })], VALID_PAYER);
      expect(result.ok).toBe(false);
    });

    it('BIC with 10 chars → ok=false', () => {
      const result = generateSepaXml([makePayment({ bic: 'COBADEFF00' })], VALID_PAYER);
      expect(result.ok).toBe(false);
    });

    it('valid 8-char BIC → ok=true', () => {
      const result = generateSepaXml([makePayment({ bic: 'COBADEFF' })], VALID_PAYER);
      expect(result.ok).toBe(true);
    });

    it('valid 11-char BIC → ok=true', () => {
      const result = generateSepaXml([makePayment({ bic: 'SSKMDEMMXXX' })], VALID_PAYER);
      expect(result.ok).toBe(true);
    });

    it('lowercase BIC is accepted (case-insensitive)', () => {
      const result = generateSepaXml([makePayment({ bic: 'cobadeff' })], VALID_PAYER);
      expect(result.ok).toBe(true);
    });
  });

  describe('validation — multiple errors collected', () => {
    it('collects multiple errors across different payments', () => {
      const payments = [
        makePayment({ id: 'p1', amount: 0 }),                        // amount error at index 0
        makePayment({ id: 'p2', iban: 'DE00000000000000000000' }),   // IBAN error at index 1
        makePayment({ id: 'p3', bic: 'BAD' }),                       // BIC error at index 2
      ];
      const result = generateSepaXml(payments, VALID_PAYER);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
      const indices = result.errors.map(e => e.index);
      expect(indices).toContain(0);
      expect(indices).toContain(1);
      expect(indices).toContain(2);
    });

    it('stops short of generating XML when validation fails', () => {
      const result = generateSepaXml([makePayment({ amount: -1 })], VALID_PAYER);
      expect(result.ok).toBe(false);
      // Confirm there is no xml property on the failure result
      expect('xml' in result).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Structural / document correctness
  // -------------------------------------------------------------------------

  describe('XML structure', () => {
    it('contains Document root element', () => {
      const result = generateSepaXml([makePayment()], VALID_PAYER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.xml).toContain('<Document');
      expect(result.xml).toContain('</Document>');
    });

    it('contains CstmrCdtTrfInitn wrapper', () => {
      const result = generateSepaXml([makePayment()], VALID_PAYER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.xml).toContain('<CstmrCdtTrfInitn>');
    });

    it('contains GrpHdr with CreDtTm', () => {
      const result = generateSepaXml([makePayment()], VALID_PAYER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.xml).toContain('<GrpHdr>');
      expect(result.xml).toMatch(/<CreDtTm>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}<\/CreDtTm>/);
    });

    it('contains SEPA service level code', () => {
      const result = generateSepaXml([makePayment()], VALID_PAYER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.xml).toContain('<Cd>SEPA</Cd>');
    });

    it('contains execution date in ReqdExctnDt', () => {
      const result = generateSepaXml([makePayment({ execution_date: '2026-03-01' })], VALID_PAYER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.xml).toContain('<ReqdExctnDt>2026-03-01</ReqdExctnDt>');
    });

    it('contains EndToEndId in each transaction', () => {
      const result = generateSepaXml([makePayment()], VALID_PAYER);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.xml).toMatch(/<EndToEndId>E2E-000001-\d+<\/EndToEndId>/);
    });

    it('strips spaces from IBAN in XML output', () => {
      const payer: PayerInfo = {
        ...VALID_PAYER,
        iban: 'DE89 3704 0044 0532 0130 00', // with spaces
      };
      const result = generateSepaXml([makePayment()], payer);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // Spaces must be stripped
      expect(result.xml).toContain('<IBAN>DE89370400440532013000</IBAN>');
      expect(result.xml).not.toContain('DE89 3704');
    });
  });
});

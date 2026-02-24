import { describe, expect, it } from 'vitest';

import { extractBic, formatIban, validateIban } from '../iban-utils';

// ---------------------------------------------------------------------------
// validateIban
// ---------------------------------------------------------------------------
describe('validateIban', () => {
  // --- valid inputs ---

  it('accepts a valid German IBAN (no spaces)', () => {
    const result = validateIban('DE89370400440532013000');
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('accepts a valid German IBAN with spaces', () => {
    const result = validateIban('DE89 3704 0044 0532 0130 00');
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('accepts a valid German IBAN in lowercase (normalises to uppercase)', () => {
    const result = validateIban('de89370400440532013000');
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('accepts a valid British IBAN (non-German)', () => {
    const result = validateIban('GB29NWBK60161331926819');
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('accepts a valid Austrian IBAN', () => {
    const result = validateIban('AT611904300234573201');
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  // --- empty / missing ---

  it('rejects an empty string', () => {
    const result = validateIban('');
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('rejects a whitespace-only string', () => {
    const result = validateIban('   ');
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  // --- format errors ---

  it('rejects an IBAN without a 2-letter country code', () => {
    // Starts with digits, not letters — fails the regex
    const result = validateIban('8937040044053201300012');
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('rejects an IBAN that contains special characters', () => {
    const result = validateIban('DE89!704004405320130+0');
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  // --- length errors (German IBAN must be exactly 22 chars) ---

  it('rejects a German IBAN that is 21 characters long', () => {
    // Drop last character from valid DE IBAN
    const result = validateIban('DE8937040044053201300');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/22/);
  });

  it('rejects a German IBAN that is 23 characters long', () => {
    const result = validateIban('DE893704004405320130000');
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/22/);
  });

  it('rejects an IBAN that is only 4 characters long', () => {
    // Fails the length < 5 guard
    const result = validateIban('DE89');
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('rejects an IBAN that is 35 or more characters long', () => {
    // Non-German country code so DE length check is skipped; hits general length guard
    // 36 chars total — over the 34-char limit
    const result = validateIban('XX001234567890123456789012345678901');
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  // --- checksum errors ---

  it('rejects a German IBAN with invalid check digits (DE00…)', () => {
    // DE00… — check digits 00 never produce mod-97 == 1
    const result = validateIban('DE00370400440532013000');
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  // --- mod-97 edge-case: IBAN whose BBAN is all zeros but has a valid checksum ---
  // BBAN = 000000000000000000 → check digits = 36  →  DE36000000000000000000
  it('validates an all-zeros BBAN German IBAN with a correct checksum (DE36)', () => {
    const result = validateIban('DE36000000000000000000');
    expect(result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// formatIban
// ---------------------------------------------------------------------------
describe('formatIban', () => {
  it('formats a compact IBAN into groups of 4', () => {
    expect(formatIban('DE89370400440532013000')).toBe(
      'DE89 3704 0044 0532 0130 00',
    );
  });

  it('returns the same output when the IBAN is already formatted with spaces', () => {
    const formatted = 'DE89 3704 0044 0532 0130 00';
    expect(formatIban(formatted)).toBe(formatted);
  });

  it('uppercases a lowercase IBAN before formatting', () => {
    expect(formatIban('de89370400440532013000')).toBe(
      'DE89 3704 0044 0532 0130 00',
    );
  });

  it('handles a 20-char Austrian IBAN — last group has 4 characters', () => {
    // AT61 1904 3002 3457 3201 — 5 groups of 4
    expect(formatIban('AT611904300234573201')).toBe('AT61 1904 3002 3457 3201');
  });

  it('removes extra internal spaces before formatting', () => {
    // Malformed spacing should still produce canonical output
    expect(formatIban('DE89  37040044 0532013000')).toBe(
      'DE89 3704 0044 0532 0130 00',
    );
  });
});

// ---------------------------------------------------------------------------
// extractBic
// ---------------------------------------------------------------------------
describe('extractBic', () => {
  // Valid DE IBAN: DE72 1007 0000 0532 0130 00  (BLZ 10070000 = Deutsche Bank)
  it('returns the BIC for Deutsche Bank BLZ 10070000', () => {
    expect(extractBic('DE72100700000532013000')).toBe('DEUTDEBBXXX');
  });

  // Space-formatted variant of the same IBAN
  it('accepts a space-formatted IBAN and still resolves the BIC', () => {
    expect(extractBic('DE72 1007 0000 0532 0130 00')).toBe('DEUTDEBBXXX');
  });

  // Valid DE IBAN: DE60 2004 0000 0654 9200 00  (BLZ 20040000 = Commerzbank)
  it('returns the BIC for Commerzbank BLZ 20040000', () => {
    expect(extractBic('DE60200400000654920000')).toBe('COBADEFFXXX');
  });

  // Valid DE IBAN: DE22 1203 0009 0000 1234 56  (BLZ 12030009 = DKB)
  it('returns the BIC for DKB BLZ 12030009', () => {
    expect(extractBic('DE22120300090000123456')).toBe('DKBDDEBBXXX');
  });

  it('returns null for an unknown BLZ', () => {
    // BLZ 99999999 is not in the lookup table.
    // extractBic only checks DE prefix + length == 22; checksum is irrelevant here.
    const result = extractBic('DE00999999990000000000');
    expect(result).toBeNull();
  });

  it('returns null for a non-German IBAN', () => {
    expect(extractBic('GB29NWBK60161331926819')).toBeNull();
  });

  it('returns null for an IBAN that is too short', () => {
    expect(extractBic('DE89')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(extractBic('')).toBeNull();
  });
});

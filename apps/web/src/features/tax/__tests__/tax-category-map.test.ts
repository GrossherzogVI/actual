/**
 * Unit tests for tax-category-map.ts
 *
 * Covers:
 *  - EUER_LINE_LABELS: completeness and content
 *  - EUER_LINE_GROUP: correct group assignments
 *  - EUER_EINNAHMEN_ORDER / EUER_AUSGABEN_ORDER: ordering arrays
 *  - DEFAULT_TAX_MAPPING: VAT rates, EÜR line assignments
 *  - getDefaultMappingForCategory(): lookup logic, fallback, case-insensitivity
 *  - calcNetto() / calcVat(): arithmetic correctness
 */

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_TAX_MAPPING,
  EUER_AUSGABEN_ORDER,
  EUER_EINNAHMEN_ORDER,
  EUER_LINE_GROUP,
  EUER_LINE_LABELS,
  calcNetto,
  calcVat,
  getDefaultMappingForCategory,
} from '../tax-category-map';
import type { EuerLine, VatRate } from '../types';

// ── helpers ──────────────────────────────────────────────────────────────────

const VALID_VAT_RATES: VatRate[] = [0, 7, 19];

const ALL_EUER_LINES: EuerLine[] = [
  'umsatzerloese',
  'sonstige_einnahmen',
  'steuerfreie_einnahmen',
  'wareneinkauf',
  'personal',
  'miete_nebenkosten',
  'versicherungen',
  'kfz_kosten',
  'buerokosten',
  'reisekosten',
  'telefon_internet',
  'beratung',
  'abschreibungen',
  'sonstige_ausgaben',
  'nicht_relevant',
];

const EINNAHMEN_LINES: EuerLine[] = [
  'umsatzerloese',
  'sonstige_einnahmen',
  'steuerfreie_einnahmen',
];

const AUSGABEN_LINES: EuerLine[] = [
  'wareneinkauf',
  'personal',
  'miete_nebenkosten',
  'versicherungen',
  'kfz_kosten',
  'buerokosten',
  'reisekosten',
  'telefon_internet',
  'beratung',
  'abschreibungen',
  'sonstige_ausgaben',
];

// ── EUER_LINE_LABELS ──────────────────────────────────────────────────────────

describe('EUER_LINE_LABELS', () => {
  it('has a label for every EuerLine', () => {
    for (const line of ALL_EUER_LINES) {
      expect(EUER_LINE_LABELS).toHaveProperty(line);
      expect(EUER_LINE_LABELS[line].length).toBeGreaterThan(0);
    }
  });

  it('maps umsatzerloese to the correct German label', () => {
    expect(EUER_LINE_LABELS.umsatzerloese).toBe('Umsatzerlöse');
  });

  it('maps miete_nebenkosten to the correct German label', () => {
    expect(EUER_LINE_LABELS.miete_nebenkosten).toBe('Miete / Nebenkosten');
  });

  it('maps nicht_relevant to the correct German label', () => {
    expect(EUER_LINE_LABELS.nicht_relevant).toBe('Nicht steuerlich relevant');
  });

  it('contains exactly 15 entries (one per EuerLine variant)', () => {
    expect(Object.keys(EUER_LINE_LABELS)).toHaveLength(ALL_EUER_LINES.length);
  });
});

// ── EUER_LINE_GROUP ───────────────────────────────────────────────────────────

describe('EUER_LINE_GROUP', () => {
  it('classifies all income lines as einnahmen', () => {
    for (const line of EINNAHMEN_LINES) {
      expect(EUER_LINE_GROUP[line]).toBe('einnahmen');
    }
  });

  it('classifies all expense lines as ausgaben', () => {
    for (const line of AUSGABEN_LINES) {
      expect(EUER_LINE_GROUP[line]).toBe('ausgaben');
    }
  });

  it('classifies nicht_relevant as none', () => {
    expect(EUER_LINE_GROUP.nicht_relevant).toBe('none');
  });

  it('covers every EuerLine variant without gaps', () => {
    for (const line of ALL_EUER_LINES) {
      expect(['einnahmen', 'ausgaben', 'none']).toContain(EUER_LINE_GROUP[line]);
    }
  });
});

// ── EUER_EINNAHMEN_ORDER ──────────────────────────────────────────────────────

describe('EUER_EINNAHMEN_ORDER', () => {
  it('contains exactly the three income EÜR lines', () => {
    expect(EUER_EINNAHMEN_ORDER).toEqual([
      'umsatzerloese',
      'sonstige_einnahmen',
      'steuerfreie_einnahmen',
    ]);
  });

  it('starts with umsatzerloese (primary revenue line)', () => {
    expect(EUER_EINNAHMEN_ORDER[0]).toBe('umsatzerloese');
  });

  it('contains only lines classified as einnahmen', () => {
    for (const line of EUER_EINNAHMEN_ORDER) {
      expect(EUER_LINE_GROUP[line]).toBe('einnahmen');
    }
  });
});

// ── EUER_AUSGABEN_ORDER ───────────────────────────────────────────────────────

describe('EUER_AUSGABEN_ORDER', () => {
  it('starts with wareneinkauf', () => {
    expect(EUER_AUSGABEN_ORDER[0]).toBe('wareneinkauf');
  });

  it('ends with sonstige_ausgaben', () => {
    expect(EUER_AUSGABEN_ORDER[EUER_AUSGABEN_ORDER.length - 1]).toBe(
      'sonstige_ausgaben',
    );
  });

  it('contains exactly 11 expense lines', () => {
    expect(EUER_AUSGABEN_ORDER).toHaveLength(11);
  });

  it('contains only lines classified as ausgaben', () => {
    for (const line of EUER_AUSGABEN_ORDER) {
      expect(EUER_LINE_GROUP[line]).toBe('ausgaben');
    }
  });

  it('does not include nicht_relevant', () => {
    expect(EUER_AUSGABEN_ORDER).not.toContain('nicht_relevant');
  });
});

// ── DEFAULT_TAX_MAPPING ───────────────────────────────────────────────────────

describe('DEFAULT_TAX_MAPPING', () => {
  it('all entries have a valid VAT rate (0, 7, or 19)', () => {
    for (const [key, entry] of Object.entries(DEFAULT_TAX_MAPPING)) {
      expect(VALID_VAT_RATES).toContain(entry.vat_rate);
    }
  });

  it('all entries reference a valid EuerLine', () => {
    for (const [key, entry] of Object.entries(DEFAULT_TAX_MAPPING)) {
      expect(ALL_EUER_LINES).toContain(entry.euer_line);
    }
  });

  it('income keywords map to einnahmen EÜR lines', () => {
    const incomeKeys = ['einnahmen', 'honorar', 'gehalt', 'lohn'];
    for (const key of incomeKeys) {
      const entry = DEFAULT_TAX_MAPPING[key];
      expect(entry).toBeDefined();
      expect(EUER_LINE_GROUP[entry.euer_line]).toBe('einnahmen');
    }
  });

  it('expense keywords map to ausgaben or nicht_relevant EÜR lines', () => {
    const expenseKeys = [
      'miete', 'nebenkosten', 'versicherung', 'telefon', 'internet',
      'büro', 'buero', 'reise', 'hotel', 'bahn', 'kfz', 'tankstelle',
      'tanken', 'steuerberater', 'beratung', 'personal',
    ];
    for (const key of expenseKeys) {
      const entry = DEFAULT_TAX_MAPPING[key];
      expect(entry).toBeDefined();
      expect(['ausgaben', 'none']).toContain(EUER_LINE_GROUP[entry.euer_line]);
    }
  });

  // ── VAT rate spot-checks ──────────────────────────────────────────────────

  it('lebensmittel → 7% VAT (reduced rate for food)', () => {
    expect(DEFAULT_TAX_MAPPING.lebensmittel.vat_rate).toBe(7);
  });

  it('supermarkt → 7% VAT (reduced rate for food)', () => {
    expect(DEFAULT_TAX_MAPPING.supermarkt.vat_rate).toBe(7);
  });

  it('restaurant → 7% VAT (reduced rate)', () => {
    // Note: German restaurant dine-in is 19%, but the default mapping uses 7%
    // because takeaway food qualifies for reduced rate; user can override.
    expect(DEFAULT_TAX_MAPPING.restaurant.vat_rate).toBe(7);
  });

  it('hotel → 7% VAT (accommodation reduced rate)', () => {
    expect(DEFAULT_TAX_MAPPING.hotel.vat_rate).toBe(7);
  });

  it('bahn → 7% VAT (public transport reduced rate)', () => {
    expect(DEFAULT_TAX_MAPPING.bahn.vat_rate).toBe(7);
  });

  it('miete → 0% VAT (private rent is exempt)', () => {
    expect(DEFAULT_TAX_MAPPING.miete.vat_rate).toBe(0);
  });

  it('versicherung → 0% VAT (insurance is exempt)', () => {
    expect(DEFAULT_TAX_MAPPING.versicherung.vat_rate).toBe(0);
  });

  it('flug → 0% VAT (international flights exempt)', () => {
    expect(DEFAULT_TAX_MAPPING.flug.vat_rate).toBe(0);
  });

  it('gehalt → 0% VAT (wages are not subject to VAT)', () => {
    expect(DEFAULT_TAX_MAPPING.gehalt.vat_rate).toBe(0);
  });

  it('telefon → 19% VAT (standard rate)', () => {
    expect(DEFAULT_TAX_MAPPING.telefon.vat_rate).toBe(19);
  });

  it('beratung → 19% VAT (standard rate)', () => {
    expect(DEFAULT_TAX_MAPPING.beratung.vat_rate).toBe(19);
  });

  it('tanken → 19% VAT (standard rate)', () => {
    expect(DEFAULT_TAX_MAPPING.tanken.vat_rate).toBe(19);
  });

  // ── EÜR line spot-checks ──────────────────────────────────────────────────

  it('miete → miete_nebenkosten EÜR line', () => {
    expect(DEFAULT_TAX_MAPPING.miete.euer_line).toBe('miete_nebenkosten');
  });

  it('versicherung → versicherungen EÜR line', () => {
    expect(DEFAULT_TAX_MAPPING.versicherung.euer_line).toBe('versicherungen');
  });

  it('kfz → kfz_kosten EÜR line', () => {
    expect(DEFAULT_TAX_MAPPING.kfz.euer_line).toBe('kfz_kosten');
  });

  it('steuerberater → beratung EÜR line', () => {
    expect(DEFAULT_TAX_MAPPING.steuerberater.euer_line).toBe('beratung');
  });

  it('rechtsanwalt → beratung EÜR line', () => {
    expect(DEFAULT_TAX_MAPPING.rechtsanwalt.euer_line).toBe('beratung');
  });

  it('büro and buero both map to buerokosten', () => {
    expect(DEFAULT_TAX_MAPPING['büro'].euer_line).toBe('buerokosten');
    expect(DEFAULT_TAX_MAPPING.buero.euer_line).toBe('buerokosten');
  });

  // ── tax_relevant flag ─────────────────────────────────────────────────────

  it('private categories are marked is_tax_relevant: false', () => {
    const privateKeys = ['lebensmittel', 'supermarkt', 'restaurant', 'freizeit', 'unterhaltung'];
    for (const key of privateKeys) {
      expect(DEFAULT_TAX_MAPPING[key].is_tax_relevant).toBe(false);
    }
  });

  it('business categories are marked is_tax_relevant: true', () => {
    const businessKeys = ['miete', 'versicherung', 'telefon', 'beratung', 'kfz'];
    for (const key of businessKeys) {
      expect(DEFAULT_TAX_MAPPING[key].is_tax_relevant).toBe(true);
    }
  });

  it('private categories map to nicht_relevant EÜR line', () => {
    const privateKeys = ['lebensmittel', 'supermarkt', 'restaurant', 'freizeit', 'unterhaltung'];
    for (const key of privateKeys) {
      expect(DEFAULT_TAX_MAPPING[key].euer_line).toBe('nicht_relevant');
    }
  });
});

// ── getDefaultMappingForCategory ──────────────────────────────────────────────

describe('getDefaultMappingForCategory', () => {
  it('exact keyword match — miete', () => {
    const result = getDefaultMappingForCategory('miete');
    expect(result.euer_line).toBe('miete_nebenkosten');
    expect(result.vat_rate).toBe(0);
  });

  it('case-insensitive match — TELEFON', () => {
    const result = getDefaultMappingForCategory('TELEFON');
    expect(result.euer_line).toBe('telefon_internet');
  });

  it('case-insensitive match — Versicherung', () => {
    const result = getDefaultMappingForCategory('Versicherung');
    expect(result.euer_line).toBe('versicherungen');
  });

  it('substring match inside a longer name — "Mobilfunk-Rechnung"', () => {
    // "mobilfunk" is a key in DEFAULT_TAX_MAPPING
    const result = getDefaultMappingForCategory('Mobilfunk-Rechnung');
    expect(result.euer_line).toBe('telefon_internet');
  });

  it('substring match — "Steuerberater München"', () => {
    const result = getDefaultMappingForCategory('Steuerberater München');
    expect(result.euer_line).toBe('beratung');
  });

  it('substring match — "Hotel Adlon Berlin"', () => {
    const result = getDefaultMappingForCategory('Hotel Adlon Berlin');
    expect(result.euer_line).toBe('reisekosten');
    expect(result.vat_rate).toBe(7);
  });

  it('unknown category returns sonstige_ausgaben fallback', () => {
    const result = getDefaultMappingForCategory('Unbekannte Kategorie XYZ');
    expect(result.euer_line).toBe('sonstige_ausgaben');
    expect(result.vat_rate).toBe(19);
    expect(result.is_tax_relevant).toBe(false);
  });

  it('empty string returns sonstige_ausgaben fallback', () => {
    const result = getDefaultMappingForCategory('');
    expect(result.euer_line).toBe('sonstige_ausgaben');
    expect(result.vat_rate).toBe(19);
    expect(result.is_tax_relevant).toBe(false);
  });

  it('category with multiple matching substrings returns first match', () => {
    // "bahn reise" — both "bahn" (index ~11) and "reise" (index ~9) are keys.
    // The loop iterates Object.entries in insertion order, so "reise" comes first.
    const result = getDefaultMappingForCategory('bahn reise');
    // whichever key comes first in DEFAULT_TAX_MAPPING wins; both map to reisekosten
    expect(result.euer_line).toBe('reisekosten');
  });

  it('lebensmittel → nicht_relevant and 7% VAT', () => {
    const result = getDefaultMappingForCategory('Lebensmittel');
    expect(result.euer_line).toBe('nicht_relevant');
    expect(result.vat_rate).toBe(7);
    expect(result.is_tax_relevant).toBe(false);
  });

  it('einnahmen category → umsatzerloese and 19% VAT', () => {
    const result = getDefaultMappingForCategory('Einnahmen Beratung');
    expect(result.euer_line).toBe('umsatzerloese');
    expect(result.vat_rate).toBe(19);
    expect(result.is_tax_relevant).toBe(true);
  });
});

// ── calcNetto ─────────────────────────────────────────────────────────────────

describe('calcNetto', () => {
  it('0% VAT: returns brutto unchanged', () => {
    expect(calcNetto(100, 0)).toBe(100);
    expect(calcNetto(0, 0)).toBe(0);
  });

  it('19% VAT: netto = brutto / 1.19', () => {
    const result = calcNetto(119, 19);
    expect(result).toBeCloseTo(100, 10);
  });

  it('19% VAT: netto from 1 euro brutto', () => {
    const result = calcNetto(1, 19);
    expect(result).toBeCloseTo(1 / 1.19, 10);
  });

  it('7% VAT: netto = brutto / 1.07', () => {
    const result = calcNetto(107, 7);
    expect(result).toBeCloseTo(100, 10);
  });

  it('7% VAT: netto from 1 euro brutto', () => {
    const result = calcNetto(1, 7);
    expect(result).toBeCloseTo(1 / 1.07, 10);
  });

  it('handles zero brutto with all VAT rates', () => {
    expect(calcNetto(0, 0)).toBe(0);
    expect(calcNetto(0, 7)).toBe(0);
    expect(calcNetto(0, 19)).toBe(0);
  });

  it('handles large amounts without overflow', () => {
    expect(calcNetto(1_000_000, 19)).toBeCloseTo(1_000_000 / 1.19, 5);
  });
});

// ── calcVat ───────────────────────────────────────────────────────────────────

describe('calcVat', () => {
  it('0% VAT: no tax amount', () => {
    expect(calcVat(100, 0)).toBe(0);
    expect(calcVat(0, 0)).toBe(0);
  });

  it('19% VAT: tax = brutto - brutto/1.19', () => {
    const result = calcVat(119, 19);
    expect(result).toBeCloseTo(19, 10);
  });

  it('7% VAT: tax = brutto - brutto/1.07', () => {
    const result = calcVat(107, 7);
    expect(result).toBeCloseTo(7, 10);
  });

  it('calcNetto + calcVat always sums to brutto', () => {
    for (const rate of VALID_VAT_RATES) {
      const brutto = 238.50;
      const netto = calcNetto(brutto, rate);
      const vat = calcVat(brutto, rate);
      expect(netto + vat).toBeCloseTo(brutto, 10);
    }
  });

  it('handles zero brutto for all rates', () => {
    expect(calcVat(0, 0)).toBe(0);
    expect(calcVat(0, 7)).toBe(0);
    expect(calcVat(0, 19)).toBe(0);
  });
});

import type { EuerLine, VatRate } from './types';

// Human-readable labels for each EÜR line item
export const EUER_LINE_LABELS: Record<EuerLine, string> = {
  umsatzerloese: 'Umsatzerlöse',
  sonstige_einnahmen: 'Sonstige Einnahmen',
  steuerfreie_einnahmen: 'Steuerfreie Einnahmen',
  wareneinkauf: 'Wareneinkauf / Materialeinkauf',
  personal: 'Personalkosten',
  miete_nebenkosten: 'Miete / Nebenkosten',
  versicherungen: 'Versicherungen',
  kfz_kosten: 'Kfz-Kosten',
  buerokosten: 'Bürokosten',
  reisekosten: 'Reisekosten',
  telefon_internet: 'Telefon / Internet',
  beratung: 'Beratung / Rechtsanwalts- / Steuerkosten',
  abschreibungen: 'Abschreibungen (AfA)',
  sonstige_ausgaben: 'Sonstige Betriebsausgaben',
  nicht_relevant: 'Nicht steuerlich relevant',
};

// Which group each line belongs to
export const EUER_LINE_GROUP: Record<
  EuerLine,
  'einnahmen' | 'ausgaben' | 'none'
> = {
  umsatzerloese: 'einnahmen',
  sonstige_einnahmen: 'einnahmen',
  steuerfreie_einnahmen: 'einnahmen',
  wareneinkauf: 'ausgaben',
  personal: 'ausgaben',
  miete_nebenkosten: 'ausgaben',
  versicherungen: 'ausgaben',
  kfz_kosten: 'ausgaben',
  buerokosten: 'ausgaben',
  reisekosten: 'ausgaben',
  telefon_internet: 'ausgaben',
  beratung: 'ausgaben',
  abschreibungen: 'ausgaben',
  sonstige_ausgaben: 'ausgaben',
  nicht_relevant: 'none',
};

// Display order for EÜR form sections
export const EUER_EINNAHMEN_ORDER: EuerLine[] = [
  'umsatzerloese',
  'sonstige_einnahmen',
  'steuerfreie_einnahmen',
];

export const EUER_AUSGABEN_ORDER: EuerLine[] = [
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

// Default mapping from German category name keywords → EÜR line
// These are fuzzy defaults; user can override via TaxCategoryMapping UI
type DefaultMappingEntry = {
  euer_line: EuerLine;
  vat_rate: VatRate;
  is_tax_relevant: boolean;
};

export const DEFAULT_TAX_MAPPING: Record<string, DefaultMappingEntry> = {
  // Einnahmen
  einnahmen: { euer_line: 'umsatzerloese', vat_rate: 19, is_tax_relevant: true },
  honorar: { euer_line: 'umsatzerloese', vat_rate: 19, is_tax_relevant: true },
  gehalt: { euer_line: 'sonstige_einnahmen', vat_rate: 0, is_tax_relevant: true },
  lohn: { euer_line: 'sonstige_einnahmen', vat_rate: 0, is_tax_relevant: true },
  // Ausgaben
  miete: { euer_line: 'miete_nebenkosten', vat_rate: 0, is_tax_relevant: true },
  nebenkosten: { euer_line: 'miete_nebenkosten', vat_rate: 19, is_tax_relevant: true },
  strom: { euer_line: 'miete_nebenkosten', vat_rate: 19, is_tax_relevant: true },
  versicherung: { euer_line: 'versicherungen', vat_rate: 0, is_tax_relevant: true },
  telefon: { euer_line: 'telefon_internet', vat_rate: 19, is_tax_relevant: true },
  internet: { euer_line: 'telefon_internet', vat_rate: 19, is_tax_relevant: true },
  mobilfunk: { euer_line: 'telefon_internet', vat_rate: 19, is_tax_relevant: true },
  büro: { euer_line: 'buerokosten', vat_rate: 19, is_tax_relevant: true },
  buero: { euer_line: 'buerokosten', vat_rate: 19, is_tax_relevant: true },
  schreibwaren: { euer_line: 'buerokosten', vat_rate: 19, is_tax_relevant: true },
  reise: { euer_line: 'reisekosten', vat_rate: 19, is_tax_relevant: true },
  hotel: { euer_line: 'reisekosten', vat_rate: 7, is_tax_relevant: true },
  bahn: { euer_line: 'reisekosten', vat_rate: 7, is_tax_relevant: true },
  flug: { euer_line: 'reisekosten', vat_rate: 0, is_tax_relevant: true },
  kfz: { euer_line: 'kfz_kosten', vat_rate: 19, is_tax_relevant: true },
  tankstelle: { euer_line: 'kfz_kosten', vat_rate: 19, is_tax_relevant: true },
  tanken: { euer_line: 'kfz_kosten', vat_rate: 19, is_tax_relevant: true },
  steuerberater: { euer_line: 'beratung', vat_rate: 19, is_tax_relevant: true },
  rechtsanwalt: { euer_line: 'beratung', vat_rate: 19, is_tax_relevant: true },
  beratung: { euer_line: 'beratung', vat_rate: 19, is_tax_relevant: true },
  personal: { euer_line: 'personal', vat_rate: 0, is_tax_relevant: true },
  // Private (not tax-relevant by default)
  lebensmittel: { euer_line: 'nicht_relevant', vat_rate: 7, is_tax_relevant: false },
  supermarkt: { euer_line: 'nicht_relevant', vat_rate: 7, is_tax_relevant: false },
  restaurant: { euer_line: 'nicht_relevant', vat_rate: 7, is_tax_relevant: false },
  freizeit: { euer_line: 'nicht_relevant', vat_rate: 19, is_tax_relevant: false },
  unterhaltung: { euer_line: 'nicht_relevant', vat_rate: 19, is_tax_relevant: false },
};

/**
 * Look up a default mapping for a category by name (case-insensitive substring match).
 * Returns the first match found, or a safe default.
 */
export function getDefaultMappingForCategory(
  categoryName: string,
): DefaultMappingEntry {
  const lower = categoryName.toLowerCase();
  for (const [key, entry] of Object.entries(DEFAULT_TAX_MAPPING)) {
    if (lower.includes(key)) {
      return entry;
    }
  }
  return { euer_line: 'sonstige_ausgaben', vat_rate: 19, is_tax_relevant: false };
}

/** Calculate Nettobetrag from Bruttobetrag + VAT rate */
export function calcNetto(brutto: number, vatRate: VatRate): number {
  if (vatRate === 0) return brutto;
  return brutto / (1 + vatRate / 100);
}

/** Calculate VAT amount from Bruttobetrag */
export function calcVat(brutto: number, vatRate: VatRate): number {
  return brutto - calcNetto(brutto, vatRate);
}

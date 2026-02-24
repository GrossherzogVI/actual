// Local types for the Tax Export module (EÜR + Umsatzsteuer)

export type EuerLine =
  // Betriebseinnahmen
  | 'umsatzerloese'
  | 'sonstige_einnahmen'
  | 'steuerfreie_einnahmen'
  // Betriebsausgaben
  | 'wareneinkauf'
  | 'personal'
  | 'miete_nebenkosten'
  | 'versicherungen'
  | 'kfz_kosten'
  | 'buerokosten'
  | 'reisekosten'
  | 'telefon_internet'
  | 'beratung'
  | 'abschreibungen'
  | 'sonstige_ausgaben'
  // Nicht steuerlich relevant
  | 'nicht_relevant';

export type VatRate = 0 | 7 | 19;

export type TaxMapping = {
  id: string;
  category: string; // record link "category:xyz"
  category_name?: string;
  euer_line: EuerLine;
  vat_rate: VatRate;
  is_tax_relevant: boolean;
};

export type EuerLineTotal = {
  line: EuerLine;
  label: string;
  group: 'einnahmen' | 'ausgaben';
  total: number; // in cents
  count: number;
  transactions: TaxTransaction[];
};

export type TaxTransaction = {
  id: string;
  date: string;
  amount: number; // in cents
  payee_name?: string;
  category_name?: string;
  notes?: string;
};

export type EuerData = {
  year: number;
  lines: EuerLineTotal[];
  total_einnahmen: number;
  total_ausgaben: number;
  gewinn_verlust: number;
};

export type VatGroup = {
  rate: VatRate;
  label: string;
  // Income side
  income_brutto: number;
  income_netto: number;
  income_ust: number;
  // Expense side
  expense_brutto: number;
  expense_netto: number;
  expense_vorsteuer: number;
  count: number;
};

export type QuarterlyVat = {
  quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  umsatzsteuer: number;
  vorsteuer: number;
  zahllast: number;
};

export type UstData = {
  year: number;
  groups: VatGroup[];
  quarterly: QuarterlyVat[];
  total_umsatzsteuer: number;
  total_vorsteuer: number;
  zahllast: number;
};

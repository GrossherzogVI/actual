export type ParsedRow = {
  date: string;       // ISO format "2026-02-24"
  amount: number;     // Negative for expenses, positive for income
  payee: string;
  notes: string;
  iban?: string;      // If available
  reference?: string; // Verwendungszweck
};

export type StatementMetadata = {
  accountIban?: string;
  openingBalance?: number;
  closingBalance?: number;
  statementDate?: string;
  statementId?: string;
};

export type ParserResult = {
  rows: ParsedRow[];
  errors: string[];
  bankName: string;
  encoding: string;
  metadata?: StatementMetadata;
};

export type ColumnMapping = {
  date: number;
  amount: number;
  payee: number;
  notes: number;
  iban?: number;
  reference?: number;
};

export type BankFormat = 'dkb' | 'ing' | 'sparkasse' | 'commerzbank' | 'n26' | 'generic' | 'mt940' | 'camt053';

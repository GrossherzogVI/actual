// Types for the Import module (frontend-local, mirrors loot-core import-data types)

export type ImportFormat = 'finanzguru' | 'csv';

export type ImportState = 'upload' | 'mapping' | 'preview' | 'importing' | 'complete';

export type ImportPreviewRow = {
  date: string;
  payee: string;
  amount: number;
  notes: string | null;
  account_id?: string;
  suggested_category_id?: string;
  suggested_contract_id?: string;
  confidence?: number;
};

export type ImportPreviewResult = {
  rows: ImportPreviewRow[];
  total: number;
  detected_format?: string;
  warnings: string[];
};

export type ImportCommitResult = {
  imported: number;
  skipped: number;
  contracts_detected: number;
};

export type BankFormat = {
  id: string;
  name: string;
  bank: string;
  example_header: string;
};

export type CategoryMapping = {
  external: string;
  internal_id: string | null;
  auto_matched: boolean;
};

export type CategoryTemplate = {
  id: string;
  name: string;
  description: string;
  language: string;
  category_count: number;
};

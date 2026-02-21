// @ts-strict-ignore
import * as asyncStorage from '../../platform/server/asyncStorage';
import { createApp } from '../app';
import { get, post } from '../post';
import { getServer } from '../server-config';

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

export type ImportDataHandlers = {
  'import-finanzguru-preview': typeof importFinanzguruPreview;
  'import-finanzguru-commit': typeof importFinanzguruCommit;
  'import-csv-preview': typeof importCsvPreview;
  'import-csv-commit': typeof importCsvCommit;
  'import-detect-contracts': typeof importDetectContracts;
};

export const app = createApp<ImportDataHandlers>();

app.method('import-finanzguru-preview', importFinanzguruPreview);
app.method('import-finanzguru-commit', importFinanzguruCommit);
app.method('import-csv-preview', importCsvPreview);
app.method('import-csv-commit', importCsvCommit);
app.method('import-detect-contracts', importDetectContracts);

async function importFinanzguruPreview(args: {
  fileData: string; // base64-encoded XLSX
  accountMapping?: Record<string, string>;
}): Promise<ImportPreviewResult | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const result = await post(
      getServer().BASE_SERVER + '/import/finanzguru',
      args,
      { 'X-ACTUAL-TOKEN': userToken },
    );
    return result as ImportPreviewResult;
  } catch (err) {
    return { error: err.reason || err.message || 'unknown' };
  }
}

async function importFinanzguruCommit(args: {
  rows: ImportPreviewRow[];
  accountMapping: Record<string, string>;
  categoryMapping?: Record<string, string>;
}): Promise<ImportCommitResult | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const result = await post(
      getServer().BASE_SERVER + '/import/finanzguru/commit',
      args,
      { 'X-ACTUAL-TOKEN': userToken },
    );
    return result as ImportCommitResult;
  } catch (err) {
    return { error: err.reason || err.message || 'unknown' };
  }
}

async function importCsvPreview(args: {
  fileData: string; // base64-encoded CSV
  bankFormat?: string;
  delimiter?: string;
  encoding?: string;
}): Promise<ImportPreviewResult | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const result = await post(
      getServer().BASE_SERVER + '/import/csv',
      args,
      { 'X-ACTUAL-TOKEN': userToken },
    );
    return result as ImportPreviewResult;
  } catch (err) {
    return { error: err.reason || err.message || 'unknown' };
  }
}

async function importCsvCommit(args: {
  rows: ImportPreviewRow[];
  accountId: string;
  categoryMapping?: Record<string, string>;
}): Promise<ImportCommitResult | { error: string }> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const result = await post(
      getServer().BASE_SERVER + '/import/csv/commit',
      args,
      { 'X-ACTUAL-TOKEN': userToken },
    );
    return result as ImportCommitResult;
  } catch (err) {
    return { error: err.reason || err.message || 'unknown' };
  }
}

async function importDetectContracts(args: {
  transactionIds?: string[];
  lookbackDays?: number;
}): Promise<
  | { detected: number; contracts: unknown[]; review_items: number }
  | { error: string }
> {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'not-logged-in' };

  try {
    const result = await post(
      getServer().BASE_SERVER + '/import/detect-contracts',
      args,
      { 'X-ACTUAL-TOKEN': userToken },
    );
    return result as {
      detected: number;
      contracts: unknown[];
      review_items: number;
    };
  } catch (err) {
    return { error: err.reason || err.message || 'unknown' };
  }
}

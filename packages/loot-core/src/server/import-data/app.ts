// @ts-strict-ignore
import type { ImportTransactionEntity } from '../../types/models/import-transaction';
import * as asyncStorage from '../../platform/server/asyncStorage';
import { createApp } from '../app';
import { importTransactions } from '../accounts/app';
import { post } from '../post';
import { getServer } from '../server-config';

export type ImportPreviewRow = {
  date: string;
  payee: string;
  amount: number;
  notes: string | null;
  imported_id?: string;
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
  try {
    // Group rows by account — Finanzguru exports contain multiple IBANs
    const byAccount = new Map<string, ImportPreviewRow[]>();
    let unmappedCount = 0;
    for (const row of args.rows) {
      const accountId =
        (row.account_id && args.accountMapping[row.account_id]) ?? undefined;
      if (!accountId) {
        unmappedCount++;
        continue;
      }
      const group = byAccount.get(accountId);
      if (group) {
        group.push(row);
      } else {
        byAccount.set(accountId, [row]);
      }
    }

    if (byAccount.size === 0) {
      return {
        error: `No rows could be mapped to accounts. ${unmappedCount} rows had unmapped IBANs.`,
      };
    }

    let totalImported = 0;
    let totalSkipped = 0;
    const errors: string[] = [];

    for (const [accountId, rows] of byAccount) {
      const transactions: ImportTransactionEntity[] = rows.map(row => ({
        account: accountId,
        date: row.date,
        amount: row.amount,
        payee_name: row.payee,
        imported_payee: row.payee,
        notes: row.notes ?? undefined,
        imported_id:
          row.imported_id ?? `${row.date}-${row.payee}-${row.amount}`,
        category:
          args.categoryMapping?.[row.suggested_category_id ?? ''] ?? undefined,
      }));

      const result = await importTransactions({
        accountId,
        transactions,
        isPreview: false,
      });

      if (result.errors.length > 0) {
        errors.push(...result.errors.map(e => e.message));
      }

      totalImported += result.added.length;
      totalSkipped += result.updated.length;
    }

    if (errors.length > 0) {
      return { error: errors.join('; ') };
    }

    return {
      imported: totalImported,
      skipped: totalSkipped + unmappedCount,
      contracts_detected: 0,
    };
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
  try {
    const transactions: ImportTransactionEntity[] = args.rows.map(row => ({
      account: args.accountId,
      date: row.date,
      amount: row.amount,
      payee_name: row.payee,
      imported_payee: row.payee,
      notes: row.notes ?? undefined,
      imported_id:
        row.imported_id ?? `${row.date}-${row.payee}-${row.amount}`,
      category:
        args.categoryMapping?.[row.suggested_category_id ?? ''] ?? undefined,
    }));

    const result = await importTransactions({
      accountId: args.accountId,
      transactions,
      isPreview: false,
    });

    if (result.errors.length > 0) {
      return { error: result.errors.map(e => e.message).join('; ') };
    }

    return {
      imported: result.added.length,
      skipped: result.updated.length,
      contracts_detected: 0,
    };
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

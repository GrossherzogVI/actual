// @ts-strict-ignore
import { useCallback, useState } from 'react';

import { send } from 'loot-core/platform/client/connection';

import type {
  ImportState,
  ImportPreviewRow,
  ImportPreviewResult,
  ImportCommitResult,
} from '../types';

type UseImportOptions = {
  format: 'finanzguru' | 'csv';
};

type UseImportReturn = {
  state: ImportState;
  preview: ImportPreviewResult | null;
  result: ImportCommitResult | null;
  error: string | null;
  loading: boolean;
  uploadAndPreview: (
    fileData: string,
    opts?: { bankFormat?: string; delimiter?: string; encoding?: string; accountMapping?: Record<string, string> },
  ) => Promise<void>;
  commit: (args: {
    rows: ImportPreviewRow[];
    accountId?: string;
    accountMapping?: Record<string, string>;
    categoryMapping?: Record<string, string>;
  }) => Promise<void>;
  reset: () => void;
  setState: (s: ImportState) => void;
};

export function useImport({ format }: UseImportOptions): UseImportReturn {
  const [state, setState] = useState<ImportState>('upload');
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null);
  const [result, setResult] = useState<ImportCommitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const uploadAndPreview = useCallback(
    async (
      fileData: string,
      opts: {
        bankFormat?: string;
        delimiter?: string;
        encoding?: string;
        accountMapping?: Record<string, string>;
      } = {},
    ) => {
      setLoading(true);
      setError(null);

      const handler =
        format === 'finanzguru' ? 'import-finanzguru-preview' : 'import-csv-preview';

      const args =
        format === 'finanzguru'
          ? { fileData, accountMapping: opts.accountMapping }
          : {
              fileData,
              bankFormat: opts.bankFormat,
              delimiter: opts.delimiter,
              encoding: opts.encoding,
            };

      const res = await (send as Function)(handler, args);

      if (res && 'error' in res) {
        setError(res.error as string);
      } else {
        setPreview(res as ImportPreviewResult);
        setState('mapping');
      }
      setLoading(false);
    },
    [format],
  );

  const commit = useCallback(
    async (args: {
      rows: ImportPreviewRow[];
      accountId?: string;
      accountMapping?: Record<string, string>;
      categoryMapping?: Record<string, string>;
    }) => {
      setLoading(true);
      setError(null);
      setState('importing');

      const handler =
        format === 'finanzguru' ? 'import-finanzguru-commit' : 'import-csv-commit';

      const payload =
        format === 'finanzguru'
          ? {
              rows: args.rows,
              accountMapping: args.accountMapping ?? {},
              categoryMapping: args.categoryMapping,
            }
          : {
              rows: args.rows,
              accountId: args.accountId ?? '',
              categoryMapping: args.categoryMapping,
            };

      const res = await (send as Function)(handler, payload);

      if (res && 'error' in res) {
        setError(res.error as string);
        setState('preview');
      } else {
        setResult(res as ImportCommitResult);
        setState('complete');
      }
      setLoading(false);
    },
    [format],
  );

  const reset = useCallback(() => {
    setState('upload');
    setPreview(null);
    setResult(null);
    setError(null);
    setLoading(false);
  }, []);

  return {
    state,
    preview,
    result,
    error,
    loading,
    uploadAndPreview,
    commit,
    reset,
    setState,
  };
}

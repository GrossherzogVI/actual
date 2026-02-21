// @ts-strict-ignore
import { useCallback, useEffect, useState } from 'react';

import { send } from 'loot-core/platform/client/connection';

import type { BankFormat } from '../types';

type UseBankFormatDetectionReturn = {
  formats: BankFormat[];
  detectedFormat: BankFormat | null;
  loading: boolean;
  detectFromHeader: (headerRow: string) => BankFormat | null;
};

export function useBankFormatDetection(): UseBankFormatDetectionReturn {
  const [formats, setFormats] = useState<BankFormat[]>([]);
  const [detectedFormat, setDetectedFormat] = useState<BankFormat | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const res = await (send as Function)('import-bank-formats', {});
      if (res && !('error' in res)) {
        setFormats((res as BankFormat[]) ?? []);
      }
      setLoading(false);
    }
    void load();
  }, []);

  const detectFromHeader = useCallback(
    (headerRow: string): BankFormat | null => {
      const normalized = headerRow.toLowerCase();
      for (const fmt of formats) {
        const exampleNorm = fmt.example_header.toLowerCase();
        // Simple substring match on key columns from the example header
        const cols = exampleNorm.split(/[,;]/).map(c => c.trim());
        const hits = cols.filter(col => col && normalized.includes(col));
        if (hits.length >= Math.ceil(cols.length * 0.6)) {
          setDetectedFormat(fmt);
          return fmt;
        }
      }
      setDetectedFormat(null);
      return null;
    },
    [formats],
  );

  return { formats, detectedFormat, loading, detectFromHeader };
}

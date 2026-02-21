// @ts-strict-ignore
import { useCallback, useEffect, useState } from 'react';

import { send } from 'loot-core/platform/client/connection';

import type { ContractSummary } from '../types';

type UseContractSummaryReturn = {
  summary: ContractSummary | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

export function useContractSummary(): UseContractSummaryReturn {
  const [summary, setSummary] = useState<ContractSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);

    const result = await (send as Function)('contract-summary', {});

    if (result && 'error' in result) {
      setError(result.error as string);
      setSummary(null);
    } else {
      setSummary(result as ContractSummary);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { summary, loading, error, reload };
}

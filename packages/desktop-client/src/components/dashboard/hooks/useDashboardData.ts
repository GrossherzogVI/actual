// @ts-strict-ignore
import { useCallback, useEffect, useState } from 'react';

import { send } from 'loot-core/platform/client/connection';

import type { ContractEntity, ContractSummary, DashboardData, ReviewCounts } from '../types';

export function useDashboardData(): DashboardData & { reload: () => Promise<void> } {
  const [contractSummary, setContractSummary] = useState<ContractSummary | null>(null);
  const [reviewCounts, setReviewCounts] = useState<ReviewCounts | null>(null);
  const [expiringContracts, setExpiringContracts] = useState<ContractEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [summaryResult, countsResult, expiringResult] = await Promise.all([
        (send as Function)('contract-summary'),
        (send as Function)('review-count'),
        (send as Function)('contract-expiring', { withinDays: 30 }),
      ]);

      if (summaryResult && 'error' in summaryResult) {
        setError(summaryResult.error as string);
      } else {
        setContractSummary((summaryResult as ContractSummary) ?? null);
      }

      if (countsResult && !('error' in countsResult)) {
        setReviewCounts((countsResult as ReviewCounts) ?? null);
      }

      if (expiringResult && !('error' in expiringResult)) {
        setExpiringContracts((expiringResult as ContractEntity[]) ?? []);
      }
    } catch {
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { contractSummary, reviewCounts, expiringContracts, loading, error, reload };
}

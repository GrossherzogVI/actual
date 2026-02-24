// @ts-strict-ignore
import { useCallback, useEffect, useState } from 'react';

import { send } from 'loot-core/platform/client/connection';

import type {
  ContractEntity,
  ContractSummary,
  DashboardData,
  ReviewCounts,
} from '@/components/dashboard/types';

export function useDashboardData(): DashboardData & {
  reload: () => Promise<void>;
} {
  const [contractSummary, setContractSummary] =
    useState<ContractSummary | null>(null);
  const [reviewCounts, setReviewCounts] = useState<ReviewCounts | null>(null);
  const [expiringContracts, setExpiringContracts] = useState<ContractEntity[]>(
    [],
  );
  const [healthScore, setHealthScore] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [summaryResult, countsResult, expiringResult, healthResult] =
        await Promise.all([
          send('contract-summary'),
          send('review-count'),
          send('contract-expiring', { withinDays: 30 }),
          send('ops-health-score').catch(() => null),
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

      if (
        healthResult &&
        typeof healthResult === 'object' &&
        !('error' in healthResult)
      ) {
        setHealthScore(healthResult as Record<string, unknown>);
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

  return {
    contractSummary,
    reviewCounts,
    expiringContracts,
    healthScore,
    loading,
    error,
    reload,
  };
}

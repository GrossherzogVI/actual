import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '../../core/api/client';

type CloseLoopPanelProps = {
  onStatus: (status: string) => void;
};

type ClosePeriodFilter = 'all' | 'weekly' | 'monthly';

export function CloseLoopPanel({ onStatus }: CloseLoopPanelProps) {
  const queryClient = useQueryClient();
  const [periodFilter, setPeriodFilter] = useState<ClosePeriodFilter>('all');
  const [exceptionFilter, setExceptionFilter] = useState<'all' | 'with'>('all');

  const closeRuns = useQuery({
    queryKey: ['close-runs', periodFilter, exceptionFilter],
    queryFn: () =>
      apiClient.listCloseRuns({
        limit: 40,
        period: periodFilter === 'all' ? undefined : periodFilter,
        hasExceptions: exceptionFilter === 'with' ? true : undefined,
      }),
    refetchInterval: 20_000,
  });

  const weekly = useMutation({
    mutationFn: () => apiClient.runCloseRoutine('weekly'),
    onSuccess: async result => {
      onStatus(
        `Weekly close completed (${result.exceptionCount} exceptions / ${result.summary.pendingReviews} pending reviews).`,
      );
      await queryClient.invalidateQueries({ queryKey: ['close-runs'] });
    },
  });

  const monthly = useMutation({
    mutationFn: () => apiClient.runCloseRoutine('monthly'),
    onSuccess: async result => {
      onStatus(
        `Monthly close completed (${result.exceptionCount} exceptions / ${result.summary.expiringContracts} expiring contracts).`,
      );
      await queryClient.invalidateQueries({ queryKey: ['close-runs'] });
    },
  });

  const stats = useMemo(() => {
    const runs = closeRuns.data || [];
    if (runs.length === 0) {
      return {
        total: 0,
        withExceptions: 0,
        avgExceptions: 0,
      };
    }
    const withExceptions = runs.filter(run => run.exceptionCount > 0).length;
    const avgExceptions =
      runs.reduce((acc, run) => acc + run.exceptionCount, 0) / runs.length;
    return {
      total: runs.length,
      withExceptions,
      avgExceptions,
    };
  }, [closeRuns.data]);

  return (
    <section className="fo-panel">
      <header className="fo-panel-header">
        <h2>Close Loop</h2>
        <small>Exception-first weekly/monthly operations with trend visibility.</small>
      </header>

      <div className="fo-row">
        <button className="fo-btn" onClick={() => weekly.mutate()} disabled={weekly.isPending}>
          Run weekly close
        </button>
        <button
          className="fo-btn-secondary"
          onClick={() => monthly.mutate()}
          disabled={monthly.isPending}
        >
          Run monthly close
        </button>
      </div>

      <div className="fo-space-between">
        <small>runs: {stats.total}</small>
        <small>with exceptions: {stats.withExceptions}</small>
        <small>avg exceptions: {stats.avgExceptions.toFixed(1)}</small>
      </div>

      <div className="fo-row">
        <select
          className="fo-input"
          value={periodFilter}
          onChange={event => setPeriodFilter(event.target.value as ClosePeriodFilter)}
        >
          <option value="all">all periods</option>
          <option value="weekly">weekly</option>
          <option value="monthly">monthly</option>
        </select>
        <select
          className="fo-input"
          value={exceptionFilter}
          onChange={event => setExceptionFilter(event.target.value as 'all' | 'with')}
        >
          <option value="all">all runs</option>
          <option value="with">exceptions only</option>
        </select>
      </div>

      <div className="fo-log-list">
        {(closeRuns.data || []).map(run => (
          <article
            key={run.id}
            className={`fo-log ${run.exceptionCount > 0 ? 'fo-log-error' : 'fo-log-live'}`}
          >
            <div className="fo-space-between">
              <strong>{run.period}</strong>
              <small>{new Date(run.createdAtMs).toLocaleString()}</small>
            </div>
            <small>{run.exceptionCount} exceptions</small>
            <small>
              pending {run.summary.pendingReviews} | urgent {run.summary.urgentReviews} |
              expiring {run.summary.expiringContracts}
            </small>
          </article>
        ))}
      </div>
    </section>
  );
}


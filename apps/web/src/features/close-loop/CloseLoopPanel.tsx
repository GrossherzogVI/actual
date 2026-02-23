import { useEffect, useMemo, useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '../../core/api/client';
import type { CloseRun, MoneyPulse } from '../../core/types';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type CloseLoopPanelProps = {
  onStatus: (status: string) => void;
};

type ClosePeriodFilter = 'all' | 'weekly' | 'monthly';
type CloseExceptionFilter = 'all' | 'with';
type CloseHealthTier = 'stable' | 'warn' | 'critical';

const CLOSE_RESOLVED_STORAGE_KEY = 'finance-os.close-loop.resolved-runs';

function readResolvedRunIds(): string[] {
  try {
    const raw = window.localStorage.getItem(CLOSE_RESOLVED_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(item => typeof item === 'string');
  } catch {
    return [];
  }
}

function writeResolvedRunIds(ids: string[]) {
  try {
    window.localStorage.setItem(
      CLOSE_RESOLVED_STORAGE_KEY,
      JSON.stringify(ids),
    );
  } catch {
    // Ignore storage failures.
  }
}

function runAgeLabel(run?: CloseRun) {
  if (!run) return 'no close run yet';
  const diffMs = Date.now() - run.createdAtMs;
  const diffHours = Math.max(0, Math.round(diffMs / (60 * 60 * 1000)));
  if (diffHours < 1) return 'run in last hour';
  if (diffHours < 24) return `run ${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  return `run ${diffDays}d ago`;
}

function stageStatus(input: {
  unresolvedExceptions: number;
  latestRun?: CloseRun;
  pulse?: MoneyPulse;
  healthScore: number;
}) {
  const preflightLoad =
    (input.pulse?.urgentReviews || 0) * 3 +
    (input.pulse?.expiringContracts || 0) * 2 +
    (input.pulse?.pendingReviews || 0);
  const latestAgeMs = input.latestRun
    ? Date.now() - input.latestRun.createdAtMs
    : Number.POSITIVE_INFINITY;

  const preflight: CloseHealthTier =
    preflightLoad >= 30 ? 'critical' : preflightLoad >= 12 ? 'warn' : 'stable';
  const execution: CloseHealthTier =
    latestAgeMs > 7 * 24 * 60 * 60 * 1000
      ? 'critical'
      : latestAgeMs > 48 * 60 * 60 * 1000
        ? 'warn'
        : 'stable';
  const exceptions: CloseHealthTier =
    input.unresolvedExceptions >= 4
      ? 'critical'
      : input.unresolvedExceptions > 0
        ? 'warn'
        : 'stable';
  const confidence: CloseHealthTier =
    input.healthScore < 45
      ? 'critical'
      : input.healthScore < 72
        ? 'warn'
        : 'stable';

  return {
    preflight,
    execution,
    exceptions,
    confidence,
  };
}

function healthClass(tier: CloseHealthTier) {
  if (tier === 'stable') return 'fo-close-health-stable';
  if (tier === 'warn') return 'fo-close-health-warn';
  return 'fo-close-health-critical';
}

function stageClass(tier: CloseHealthTier) {
  if (tier === 'stable') return 'fo-close-stage-stable';
  if (tier === 'warn') return 'fo-close-stage-warn';
  return 'fo-close-stage-critical';
}

export function CloseLoopPanel({ onStatus }: CloseLoopPanelProps) {
  const queryClient = useQueryClient();
  const [periodFilter, setPeriodFilter] = useState<ClosePeriodFilter>('all');
  const [exceptionFilter, setExceptionFilter] =
    useState<CloseExceptionFilter>('all');
  const [resolvedRunIds, setResolvedRunIds] = useState<string[]>(() =>
    readResolvedRunIds(),
  );

  const closeRuns = useQuery({
    queryKey: ['close-runs', periodFilter, exceptionFilter],
    queryFn: () =>
      apiClient.listCloseRuns({
        limit: 80,
        period: periodFilter === 'all' ? undefined : periodFilter,
        hasExceptions: exceptionFilter === 'with' ? true : undefined,
      }),
    refetchInterval: 20_000,
  });

  const pulse = useQuery({
    queryKey: ['money-pulse', 'close-loop'],
    queryFn: apiClient.getMoneyPulse,
    refetchInterval: 20_000,
  });

  const runClose = useMutation({
    mutationFn: (period: 'weekly' | 'monthly') =>
      apiClient.runCloseRoutine(period),
    onSuccess: async result => {
      onStatus(
        `${result.period} close completed (${result.exceptionCount} exceptions / pending ${result.summary.pendingReviews} / urgent ${result.summary.urgentReviews}).`,
      );
      await queryClient.invalidateQueries({ queryKey: ['close-runs'] });
      await queryClient.invalidateQueries({ queryKey: ['money-pulse'] });
    },
  });

  const runFullCycle = useMutation({
    mutationFn: async () => {
      const weekly = await apiClient.runCloseRoutine('weekly');
      const monthly = await apiClient.runCloseRoutine('monthly');
      return { weekly, monthly };
    },
    onSuccess: async result => {
      onStatus(
        `Full close cycle executed (weekly ${result.weekly.exceptionCount} / monthly ${result.monthly.exceptionCount} exceptions).`,
      );
      await queryClient.invalidateQueries({ queryKey: ['close-runs'] });
      await queryClient.invalidateQueries({ queryKey: ['money-pulse'] });
    },
  });

  const resolvedSet = useMemo(() => new Set(resolvedRunIds), [resolvedRunIds]);

  const closeStats = useMemo(() => {
    const runs = closeRuns.data || [];
    const withExceptions = runs.filter(run => run.exceptionCount > 0);
    const unresolvedRuns = withExceptions.filter(
      run => !resolvedSet.has(run.id),
    );
    const avgExceptions =
      runs.length > 0
        ? runs.reduce((acc, run) => acc + run.exceptionCount, 0) / runs.length
        : 0;
    const latestRun = runs[0];

    const operationalLoad =
      (pulse.data?.pendingReviews || 0) +
      (pulse.data?.urgentReviews || 0) * 3 +
      (pulse.data?.expiringContracts || 0) * 2;

    const healthScore = Math.max(
      0,
      Math.round(
        100 -
          unresolvedRuns.length * 15 -
          avgExceptions * 5 -
          Math.min(40, operationalLoad),
      ),
    );
    const healthTier: CloseHealthTier =
      healthScore >= 75 ? 'stable' : healthScore >= 45 ? 'warn' : 'critical';

    return {
      runs,
      latestRun,
      withExceptions,
      unresolvedRuns,
      avgExceptions,
      healthScore,
      healthTier,
    };
  }, [closeRuns.data, pulse.data, resolvedSet]);

  const stages = useMemo(
    () =>
      stageStatus({
        unresolvedExceptions: closeStats.unresolvedRuns.length,
        latestRun: closeStats.latestRun,
        pulse: pulse.data,
        healthScore: closeStats.healthScore,
      }),
    [
      closeStats.healthScore,
      closeStats.latestRun,
      closeStats.unresolvedRuns.length,
      pulse.data,
    ],
  );

  const markResolved = (runId: string) => {
    const next = Array.from(new Set([...resolvedRunIds, runId]));
    setResolvedRunIds(next);
    writeResolvedRunIds(next);
    onStatus(`Close run ${runId.slice(0, 8)} marked resolved.`);
  };

  const unresolveRun = (runId: string) => {
    const next = resolvedRunIds.filter(id => id !== runId);
    setResolvedRunIds(next);
    writeResolvedRunIds(next);
    onStatus(`Close run ${runId.slice(0, 8)} moved back to unresolved.`);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || !event.shiftKey) return;
      if (event.key.toLowerCase() === 'w') {
        event.preventDefault();
        runClose.mutate('weekly');
        return;
      }
      if (event.key.toLowerCase() === 'u') {
        event.preventDefault();
        runClose.mutate('monthly');
        return;
      }
      if (event.key === '9') {
        event.preventDefault();
        runFullCycle.mutate();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [runClose, runFullCycle]);

  return (
    <section className="fo-panel" id="close-loop">
      <header className="fo-panel-header">
        <h2>
          Close Loop
        </h2>
        <small>
          Exception-first cockpit. Shortcuts: Alt+Shift+W (weekly), Alt+Shift+U
          (monthly), Alt+Shift+9 (full cycle).
        </small>
      </header>

      <article
        className={`fo-close-health ${healthClass(closeStats.healthTier)}`}
      >
        <div className="fo-space-between">
          <strong>Close confidence score</strong>
          <strong>{closeStats.healthScore}</strong>
        </div>
        <small>
          {closeStats.unresolvedRuns.length} unresolved exception run(s) ·{' '}
          {runAgeLabel(closeStats.latestRun)}
        </small>
        <small>
          pending {pulse.data?.pendingReviews ?? '-'} · urgent{' '}
          {pulse.data?.urgentReviews ?? '-'} · expiring{' '}
          {pulse.data?.expiringContracts ?? '-'}
        </small>
      </article>

      <div className="fo-row">
        <Button
          onClick={() => runClose.mutate('weekly')}
          disabled={runClose.isPending || runFullCycle.isPending}
        >Run weekly close</Button>
        <Button
          variant="secondary"
          onClick={() => runClose.mutate('monthly')}
          disabled={runClose.isPending || runFullCycle.isPending}
        >Run monthly close</Button>
        <Button
          variant="secondary"
          onClick={() => runFullCycle.mutate()}
          disabled={runClose.isPending || runFullCycle.isPending}
        >Full cycle</Button>
      </div>

      <div className="fo-space-between">
        <small>runs: {closeStats.runs.length}</small>
        <small>exception runs: {closeStats.withExceptions.length}</small>
        <small>avg exceptions: {closeStats.avgExceptions.toFixed(1)}</small>
      </div>

      <div className="fo-row">
        <Select
          value={periodFilter}
          onValueChange={value => setPeriodFilter(value as ClosePeriodFilter)}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder={'Period'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">all periods</SelectItem>
            <SelectItem value="weekly">weekly</SelectItem>
            <SelectItem value="monthly">monthly</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={exceptionFilter}
          onValueChange={value =>
            setExceptionFilter(value as CloseExceptionFilter)
          }
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder={'Exceptions'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">all runs</SelectItem>
            <SelectItem value="with">exceptions only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="fo-close-stage-list">
        <article className={`fo-close-stage ${stageClass(stages.preflight)}`}>
          <strong>Preflight pressure</strong>
          <small>
            Urgent + expiring workload before close commit (
            {pulse.data?.urgentReviews ?? 0}/
            {pulse.data?.expiringContracts ?? 0}).
          </small>
        </article>
        <article className={`fo-close-stage ${stageClass(stages.execution)}`}>
          <strong>Execution freshness</strong>
          <small>{runAgeLabel(closeStats.latestRun)}</small>
        </article>
        <article className={`fo-close-stage ${stageClass(stages.exceptions)}`}>
          <strong>Exception resolution</strong>
          <small>{closeStats.unresolvedRuns.length} unresolved runs.</small>
        </article>
        <article className={`fo-close-stage ${stageClass(stages.confidence)}`}>
          <strong>Operational confidence</strong>
          <small>Health score {closeStats.healthScore}.</small>
        </article>
      </div>

      <div className="fo-stack">
        <strong>Unresolved exception rail</strong>
        {closeStats.unresolvedRuns.length === 0 ? (
          <small>No unresolved close exceptions.</small>
        ) : (
          <div className="fo-log-list">
            {closeStats.unresolvedRuns.slice(0, 10).map(run => (
              <article className="fo-log fo-log-error" key={run.id}>
                <div className="fo-space-between">
                  <strong>{run.period} close</strong>
                  <small>{new Date(run.createdAtMs).toLocaleString()}</small>
                </div>
                <small>{run.exceptionCount} exceptions</small>
                <small>
                  pending {run.summary.pendingReviews} | urgent{' '}
                  {run.summary.urgentReviews} | expiring{' '}
                  {run.summary.expiringContracts}
                </small>
                <div className="fo-row mt-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => markResolved(run.id)}
                  >Mark resolved</Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="fo-log-list">
        {(closeRuns.data || []).map(run => {
          const resolved = resolvedSet.has(run.id);
          return (
            <article
              key={run.id}
              className={`fo-log ${
                run.exceptionCount > 0
                  ? resolved
                    ? 'fo-close-run-resolved'
                    : 'fo-close-run-unresolved'
                  : 'fo-log-live'
              }`}
            >
              <div className="fo-space-between">
                <strong>{run.period}</strong>
                <small>{new Date(run.createdAtMs).toLocaleString()}</small>
              </div>
              <small>{run.exceptionCount} exceptions</small>
              <small>
                pending {run.summary.pendingReviews} | urgent{' '}
                {run.summary.urgentReviews} | expiring{' '}
                {run.summary.expiringContracts}
              </small>
              {run.exceptionCount > 0 ? (
                <div className="fo-row mt-2">
                  {resolved ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => unresolveRun(run.id)}
                    >Move to unresolved</Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => markResolved(run.id)}
                    >Mark resolved</Button>
                  )}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

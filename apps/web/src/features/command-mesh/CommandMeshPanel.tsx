import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { COMMAND_MESH_HINTS } from '@finance-os/domain-kernel';

import { apiClient } from '../../core/api/client';
import type {
  ExecutionMode,
  GuardrailProfile,
  GuardrailResult,
  RunStatus,
  WorkflowCommandExecution,
} from '../../core/types';
import { RunDetailsDrawer } from '../runtime/RunDetailsDrawer';
import {
  type RunDetailsCommandEventDetail,
  type RunDetailsSelector,
  RUN_DETAILS_COMMAND_EVENT,
} from '../runtime/run-details-commands';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

type CommandMeshPanelProps = {
  onRoute: (route: string) => void;
  onStatus: (status: string) => void;
};

type LogEntry = {
  id: string;
  step: string;
  status: 'ok' | 'error';
  detail: string;
};

function nextId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function CommandMeshPanel({ onRoute, onStatus }: CommandMeshPanelProps) {
  const queryClient = useQueryClient();
  const [command, setCommand] = useState('triage -> close-weekly');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [executionMode, setExecutionMode] = useState<ExecutionMode>('dry-run');
  const [guardrailProfile, setGuardrailProfile] =
    useState<GuardrailProfile>('strict');
  const [rollbackWindowMinutes, setRollbackWindowMinutes] = useState(60);
  const [rollbackOnFailure, setRollbackOnFailure] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [guardrailBlocks, setGuardrailBlocks] = useState<GuardrailResult[]>([]);

  const [historyErrorFilter, setHistoryErrorFilter] = useState<
    'all' | 'errors' | 'clean'
  >('all');
  const [historyModeFilter, setHistoryModeFilter] = useState<'all' | ExecutionMode>(
    'all',
  );
  const [historyStatusFilter, setHistoryStatusFilter] = useState<'all' | RunStatus>(
    'all',
  );
  const [historyActorFilter, setHistoryActorFilter] = useState('');
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [pendingRunDetailsSelector, setPendingRunDetailsSelector] =
    useState<RunDetailsSelector | null>(null);

  const history = useQuery({
    queryKey: [
      'command-runs',
      historyErrorFilter,
      historyModeFilter,
      historyStatusFilter,
      historyActorFilter,
    ],
    queryFn: () =>
      apiClient.listCommandRuns({
        limit: 20,
        actorId: historyActorFilter.trim() || undefined,
        hasErrors:
          historyErrorFilter === 'all'
            ? undefined
            : historyErrorFilter === 'errors',
        executionMode: historyModeFilter === 'all' ? undefined : historyModeFilter,
        status: historyStatusFilter === 'all' ? undefined : historyStatusFilter,
      }),
    refetchInterval: 15_000,
  });

  const latestRollbackCandidate = useMemo(
    () =>
      (history.data || []).find(
        run =>
          run.executionMode === 'live' &&
          (run.status === 'completed' || run.status === 'failed') &&
          run.rollbackEligible,
      ) || null,
    [history.data],
  );
  const selectedRun = useMemo<WorkflowCommandExecution | null>(
    () =>
      selectedRunId
        ? (history.data || []).find(run => run.id === selectedRunId) || null
        : null,
    [history.data, selectedRunId],
  );

  useEffect(() => {
    const onRunDetailsCommand = (event: Event) => {
      const detail = (event as CustomEvent<RunDetailsCommandEventDetail>).detail;
      if (!detail || detail.scope !== 'command') {
        return;
      }

      setHistoryErrorFilter('all');
      setHistoryModeFilter('all');
      setHistoryStatusFilter('all');
      setHistoryActorFilter('');
      setPendingRunDetailsSelector(detail.selector);
      onStatus('Resolving command run details view...');
    };

    window.addEventListener(
      RUN_DETAILS_COMMAND_EVENT,
      onRunDetailsCommand as EventListener,
    );
    return () =>
      window.removeEventListener(
        RUN_DETAILS_COMMAND_EVENT,
        onRunDetailsCommand as EventListener,
      );
  }, [onStatus]);

  useEffect(() => {
    if (!pendingRunDetailsSelector) {
      return;
    }
    if (history.isFetching) {
      return;
    }

    const runs = history.data || [];
    const now = Date.now();
    const candidate =
      pendingRunDetailsSelector === 'latest-live'
        ? runs.find(run => run.executionMode === 'live')
        : pendingRunDetailsSelector === 'latest-failed'
          ? runs.find(run => run.status === 'failed')
          : pendingRunDetailsSelector === 'latest-blocked'
            ? runs.find(run => run.status === 'blocked')
            : runs.find(
                run =>
                  run.rollbackEligible &&
                  (run.status === 'completed' || run.status === 'failed') &&
                  typeof run.rollbackWindowUntilMs === 'number' &&
                  run.rollbackWindowUntilMs > now,
              );

    if (!candidate) {
      onStatus(`No ${pendingRunDetailsSelector.replace('latest-', '')} command run found.`);
      setPendingRunDetailsSelector(null);
      return;
    }

    setSelectedRunId(candidate.id);
    setPendingRunDetailsSelector(null);
    onStatus(`Opened details for command run ${candidate.id} (${candidate.status}).`);
  }, [
    history.data,
    history.isFetching,
    onStatus,
    pendingRunDetailsSelector,
  ]);

  const addLog = (entry: Omit<LogEntry, 'id'>) => {
    setLogs(prev => [{ ...entry, id: nextId() }, ...prev].slice(0, 24));
  };

  const execute = useMutation({
    mutationFn: async (chain: string) => {
      const run = await apiClient.executeCommandChain(chain, 'delegate', {
        executionMode,
        guardrailProfile,
        rollbackWindowMinutes,
        rollbackOnFailure,
        idempotencyKey: idempotencyKey.trim() || undefined,
      });

      for (const step of run.steps) {
        addLog({
          step: step.raw,
          status: step.status,
          detail: step.detail,
        });
        if (step.route) {
          onRoute(step.route);
        }
      }

      setGuardrailBlocks(
        run.guardrailResults.filter(result => result.blocking && !result.passed),
      );
      onStatus(
        `Command run ${run.status} (${run.executionMode}) with ${run.errorCount} error(s).`,
      );
      await queryClient.invalidateQueries({ queryKey: ['command-runs'] });
      return run;
    },
  });

  const rollbackRun = useMutation({
    mutationFn: (input: { runId: string; reason: string }) =>
      apiClient.rollbackCommandRun(input.runId, input.reason),
    onSuccess: async run => {
      onStatus(`Rollback run completed: ${run.id}`);
      setSelectedRunId(null);
      await queryClient.invalidateQueries({ queryKey: ['command-runs'] });
    },
    onError: error => {
      const message = error instanceof Error ? error.message : String(error);
      onStatus(`Rollback failed: ${message}`);
    },
  });

  const rollbackLatestLiveRun = () => {
    if (!latestRollbackCandidate) {
      onStatus('No rollback-eligible live command run found.');
      return;
    }
    rollbackRun.mutate({
      runId: latestRollbackCandidate.id,
      reason: 'rollback-latest-live-chain',
    });
  };

  return (
    <section className="fo-panel">
      <header className="fo-panel-header">
        <h2>Command Mesh</h2>
        <small>Guardrail-aware chain execution with rollback window controls.</small>
      </header>

      <div className="fo-stack">
        <div className="fo-row">
          <Input
            value={command}
            onChange={event => setCommand(event.target.value)}
            placeholder="triage -> close-weekly"
            className="flex-1"
          />
          <Button
            disabled={execute.isPending}
            onClick={() => execute.mutate(command)}
          >
            {execute.isPending ? 'Running' : 'Execute'}
          </Button>
          <Button
            variant="secondary"
            disabled={!latestRollbackCandidate || rollbackRun.isPending}
            onClick={rollbackLatestLiveRun}
          >
            {rollbackRun.isPending
              ? 'Rolling back...'
              : 'Rollback latest live chain'}
          </Button>
        </div>

        <div className="fo-row">
          <Select
            value={executionMode}
            onValueChange={value => setExecutionMode(value as ExecutionMode)}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Mode" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="dry-run">dry-run</SelectItem>
              <SelectItem value="live">live</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={guardrailProfile}
            onValueChange={value => setGuardrailProfile(value as GuardrailProfile)}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Guardrail" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="strict">strict</SelectItem>
              <SelectItem value="balanced">balanced</SelectItem>
              <SelectItem value="off">off</SelectItem>
            </SelectContent>
          </Select>
          <Input
            className="w-[120px]"
            aria-label="command rollback window minutes"
            type="number"
            min={1}
            max={1440}
            value={rollbackWindowMinutes}
            onChange={event =>
              setRollbackWindowMinutes(
                Math.max(1, Math.min(1440, Number(event.target.value) || 60)),
              )
            }
            title="Rollback window minutes"
          />
          <label className="fo-row">
            <input
              type="checkbox"
              aria-label="command rollback on failure"
              checked={rollbackOnFailure}
              onChange={event => setRollbackOnFailure(event.target.checked)}
            />
            <small>rollback on failure</small>
          </label>
        </div>

        <Input
          placeholder="idempotency key (optional, 8-128 chars)"
          value={idempotencyKey}
          onChange={event => setIdempotencyKey(event.target.value)}
        />
      </div>

      <div className="fo-hints">
        {COMMAND_MESH_HINTS.map(hint => (
          <code key={hint.command}>{hint.command}</code>
        ))}
      </div>

      {guardrailBlocks.length > 0 ? (
        <section className="fo-log-list">
          <small>Guardrail blocks</small>
          {guardrailBlocks.map(block => (
            <article key={block.ruleId} className="fo-log fo-log-error">
              <strong>{block.ruleId}</strong>
              <span>{block.message}</span>
            </article>
          ))}
        </section>
      ) : null}

      <div className="fo-log-list">
        {logs.length === 0 ? <small>No command logs yet.</small> : null}
        {logs.map(log => (
          <article
            key={log.id}
            className={`fo-log ${log.status === 'error' ? 'fo-log-error' : ''}`}
          >
            <strong>{log.step}</strong>
            <span>{log.detail}</span>
          </article>
        ))}
      </div>

      <div className="fo-log-list">
        <small>Recent command runs</small>
        <div className="fo-row">
          <Button
            size="sm"
            variant={historyErrorFilter === 'all' ? 'default' : 'secondary'}
            onClick={() => setHistoryErrorFilter('all')}
          >
            All
          </Button>
          <Button
            size="sm"
            variant={historyErrorFilter === 'errors' ? 'default' : 'secondary'}
            onClick={() => setHistoryErrorFilter('errors')}
          >
            Errors
          </Button>
          <Button
            size="sm"
            variant={historyErrorFilter === 'clean' ? 'default' : 'secondary'}
            onClick={() => setHistoryErrorFilter('clean')}
          >
            Clean
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              setHistoryModeFilter(current =>
                current === 'all'
                  ? 'dry-run'
                  : current === 'dry-run'
                    ? 'live'
                    : 'all',
              )
            }
          >
            {historyModeFilter}
          </Button>
          <Select
            value={historyStatusFilter}
            onValueChange={value => setHistoryStatusFilter(value as 'all' | RunStatus)}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">status:all</SelectItem>
              <SelectItem value="planned">planned</SelectItem>
              <SelectItem value="running">running</SelectItem>
              <SelectItem value="completed">completed</SelectItem>
              <SelectItem value="failed">failed</SelectItem>
              <SelectItem value="blocked">blocked</SelectItem>
              <SelectItem value="rolled_back">rolled_back</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Input
          placeholder="Filter by actor (owner, delegate)"
          value={historyActorFilter}
          onChange={event => setHistoryActorFilter(event.target.value)}
        />
        {history.data?.slice(0, 8).map(run => (
          <article key={run.id} className="fo-log">
            <strong>{run.chain}</strong>
            <span>
              {new Date(run.startedAtMs).toLocaleTimeString()} · {run.actorId} ·{' '}
              {run.sourceSurface} · {run.executionMode} · status:{' '}
              {run.status} · {run.errorCount} errors
            </span>
            {run.statusTimeline.length > 0 ? (
              <small>
                status path:{' '}
                {run.statusTimeline.map(transition => transition.status).join(' -> ')}
              </small>
            ) : null}
            <small>
              rollback:{' '}
              {run.rollbackEligible &&
              run.rollbackWindowUntilMs &&
              run.rollbackWindowUntilMs > Date.now()
                ? `eligible until ${new Date(run.rollbackWindowUntilMs).toLocaleTimeString()}`
                : 'not eligible'}
            </small>
            {run.guardrailResults.length > 0 ? (
              <small>
                guardrails:{' '}
                {run.guardrailResults
                  .map(result => `${result.ruleId}:${result.passed ? 'pass' : 'fail'}`)
                  .join(', ')}
              </small>
            ) : null}
            {run.effectSummaries.length > 0 ? (
              <small>
                effects:{' '}
                {run.effectSummaries
                  .map(effect => `${effect.kind}:${effect.status}`)
                  .join(', ')}
              </small>
            ) : null}
            <div className="fo-row mt-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setSelectedRunId(run.id)}
              >
                Details
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => execute.mutate(run.chain)}
                disabled={execute.isPending}
              >
                Replay
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  apiClient
                    .executeCommandChain(run.chain, 'delegate', {
                      executionMode: 'live',
                      guardrailProfile: 'strict',
                      rollbackWindowMinutes,
                      rollbackOnFailure,
                    })
                    .then(() =>
                      queryClient.invalidateQueries({ queryKey: ['command-runs'] }),
                    )
                }
                disabled={execute.isPending}
              >
                Replay Live
              </Button>
            </div>
          </article>
        ))}
      </div>
      <RunDetailsDrawer
        run={selectedRun}
        onClose={() => setSelectedRunId(null)}
        onRollback={runId =>
          rollbackRun.mutate({
            runId,
            reason: 'rollback-from-command-drawer',
          })
        }
        rollbackPending={rollbackRun.isPending}
      />
    </section>
  );
}

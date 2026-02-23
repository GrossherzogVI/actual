import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { COMMAND_MESH_HINTS } from '@finance-os/domain-kernel';

import { apiClient } from '../../core/api/client';

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
  const [dryRunMode, setDryRunMode] = useState(true);
  const [historyErrorFilter, setHistoryErrorFilter] = useState<
    'all' | 'errors' | 'clean'
  >('all');
  const [historyModeFilter, setHistoryModeFilter] = useState<
    'all' | 'dry-run' | 'live'
  >('all');
  const [historyActorFilter, setHistoryActorFilter] = useState('');
  const history = useQuery({
    queryKey: [
      'command-runs',
      historyErrorFilter,
      historyModeFilter,
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
        dryRun:
          historyModeFilter === 'all'
            ? undefined
            : historyModeFilter === 'dry-run',
      }),
    refetchInterval: 15_000,
  });

  const addLog = (entry: Omit<LogEntry, 'id'>) => {
    setLogs(prev => [{ ...entry, id: nextId() }, ...prev].slice(0, 16));
  };

  const execute = useMutation({
    mutationFn: async (input: { chain: string; dryRun: boolean }) => {
      const run = await apiClient.executeCommandChain(
        input.chain,
        'delegate',
        input.dryRun,
      );

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

      onStatus(
        run.errorCount > 0
          ? `Command chain executed with ${run.errorCount} error(s)`
          : input.dryRun
            ? 'Dry-run command chain executed'
            : 'Command chain executed',
      );
      await queryClient.invalidateQueries();
    },
  });

  return (
    <section className="fo-panel">
      <header className="fo-panel-header">
        <h2>Command Mesh</h2>
        <small>Chain commands using -&gt; separators</small>
      </header>

      <div className="fo-row">
        <input
          value={command}
          onChange={event => setCommand(event.target.value)}
          placeholder="triage -> close-weekly"
          className="fo-input"
        />
        <button
          className="fo-btn-secondary"
          type="button"
          disabled={execute.isPending}
          onClick={() => setDryRunMode(current => !current)}
        >
          {dryRunMode ? 'Dry-run' : 'Live'}
        </button>
        <button
          className="fo-btn"
          type="button"
          disabled={execute.isPending}
          onClick={() => execute.mutate({ chain: command, dryRun: dryRunMode })}
        >
          {execute.isPending ? 'Running' : 'Execute'}
        </button>
      </div>

      <div className="fo-hints">
        {COMMAND_MESH_HINTS.map(hint => (
          <code key={hint.command}>{hint.command}</code>
        ))}
      </div>

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
          <button
            className="fo-btn-secondary"
            type="button"
            onClick={() => setHistoryErrorFilter('all')}
          >
            All
          </button>
          <button
            className="fo-btn-secondary"
            type="button"
            onClick={() => setHistoryErrorFilter('errors')}
          >
            Errors
          </button>
          <button
            className="fo-btn-secondary"
            type="button"
            onClick={() => setHistoryErrorFilter('clean')}
          >
            Clean
          </button>
          <button
            className="fo-btn-secondary"
            type="button"
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
          </button>
        </div>
        <input
          className="fo-input"
          placeholder="Filter by actor (owner, delegate)"
          value={historyActorFilter}
          onChange={event => setHistoryActorFilter(event.target.value)}
        />
        {history.data?.slice(0, 8).map(run => (
          <article key={run.id} className="fo-log">
            <strong>{run.chain}</strong>
            <span>
              {new Date(run.executedAtMs).toLocaleTimeString()} · {run.actorId} ·{' '}
              {run.sourceSurface} · {run.dryRun ? 'dry-run' : 'live'} · {run.errorCount}{' '}
              errors
            </span>
            <div className="fo-row">
              <button
                className="fo-btn-secondary"
                type="button"
                onClick={() =>
                  execute.mutate({ chain: run.chain, dryRun: run.dryRun })
                }
                disabled={execute.isPending}
              >
                Replay
              </button>
              <button
                className="fo-btn-secondary"
                type="button"
                onClick={() => execute.mutate({ chain: run.chain, dryRun: false })}
                disabled={execute.isPending}
              >
                Replay Live
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { Playbook, PlaybookRun } from '../../core/types';
import { apiClient } from '../../core/api/client';

type PlaybooksPanelProps = {
  onStatus: (status: string) => void;
};

type RunModeFilter = 'all' | 'dry-run' | 'live' | 'errors';

const CHAIN_HINT =
  'triage -> expiring<30d -> batch-renegotiate -> close-weekly -> refresh';

function tokensToCommands(chain: string): {
  commands: Array<Record<string, unknown>>;
  invalidTokens: string[];
} {
  const tokens = chain
    .split('->')
    .map(token => token.trim().toLowerCase())
    .filter(Boolean);

  const commands: Array<Record<string, unknown>> = [];
  const invalidTokens: string[] = [];

  for (const token of tokens) {
    if (token === 'triage' || token === 'resolve-next') {
      commands.push({ verb: 'resolve-next-action', lane: 'triage' });
      continue;
    }
    if (token === 'close-weekly' || token === 'close' || token === 'weekly') {
      commands.push({ verb: 'run-close', period: 'weekly' });
      continue;
    }
    if (token === 'close-monthly' || token === 'monthly') {
      commands.push({ verb: 'run-close', period: 'monthly' });
      continue;
    }
    if (token === 'expiring<30d') {
      commands.push({ verb: 'open-expiring-contracts', windowDays: 30 });
      continue;
    }
    if (token === 'batch-renegotiate') {
      commands.push({ verb: 'assign-expiring-contracts-lane' });
      continue;
    }
    if (token === 'open-review') {
      commands.push({ verb: 'open-urgent-review' });
      continue;
    }
    if (token === 'refresh') {
      commands.push({ verb: 'refresh-command-center' });
      continue;
    }
    if (token === 'playbook-create-default') {
      commands.push({ verb: 'create-default-playbook' });
      continue;
    }
    if (token === 'run-first') {
      commands.push({ verb: 'run-first-playbook' });
      continue;
    }

    invalidTokens.push(token);
  }

  return { commands, invalidTokens };
}

function statusColorClass(run: PlaybookRun): string {
  if (run.errorCount > 0) {
    return 'fo-log-error';
  }
  return run.dryRun ? '' : 'fo-log-live';
}

export function PlaybooksPanel({ onStatus }: PlaybooksPanelProps) {
  const queryClient = useQueryClient();
  const [playbookName, setPlaybookName] = useState('');
  const [playbookChain, setPlaybookChain] = useState(CHAIN_HINT);
  const [selectedPlaybookId, setSelectedPlaybookId] = useState('');
  const [runModeFilter, setRunModeFilter] = useState<RunModeFilter>('all');

  const parsed = useMemo(() => tokensToCommands(playbookChain), [playbookChain]);

  const playbooks = useQuery({
    queryKey: ['playbooks'],
    queryFn: apiClient.listPlaybooks,
  });

  const playbookRuns = useQuery({
    queryKey: ['playbook-runs', selectedPlaybookId, runModeFilter],
    queryFn: () =>
      apiClient.listPlaybookRuns({
        limit: 40,
        playbookId: selectedPlaybookId || undefined,
        dryRun:
          runModeFilter === 'all' || runModeFilter === 'errors'
            ? undefined
            : runModeFilter === 'dry-run',
        hasErrors: runModeFilter === 'errors' ? true : undefined,
      }),
    refetchInterval: 20_000,
  });

  const create = useMutation({
    mutationFn: async (input: { name: string; commands: Array<Record<string, unknown>> }) =>
      apiClient.createPlaybook(input.name, input.commands),
    onSuccess: async created => {
      setPlaybookName('');
      setSelectedPlaybookId(created.id);
      onStatus(`Created playbook: ${created.name}`);
      await queryClient.invalidateQueries({ queryKey: ['playbooks'] });
    },
  });

  const run = useMutation({
    mutationFn: async (input: { playbookId: string; dryRun: boolean }) =>
      apiClient.runPlaybook(input.playbookId, input.dryRun),
    onSuccess: async result => {
      onStatus(
        `Playbook run ${result.id}: ${result.executedSteps} steps / ${result.errorCount} errors (${result.dryRun ? 'dry-run' : 'live'}).`,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['playbook-runs'] }),
        queryClient.invalidateQueries({ queryKey: ['delegate-lanes'] }),
        queryClient.invalidateQueries({ queryKey: ['focus-panel'] }),
      ]);
    },
  });

  const replay = useMutation({
    mutationFn: async (input: { runId: string; dryRun: boolean }) =>
      apiClient.replayPlaybookRun(input.runId, input.dryRun),
    onSuccess: async result => {
      onStatus(
        `Replayed run ${result.id} (${result.dryRun ? 'dry-run' : 'live'}) with ${result.errorCount} errors.`,
      );
      await queryClient.invalidateQueries({ queryKey: ['playbook-runs'] });
    },
  });

  return (
    <section className="fo-panel">
      <header className="fo-panel-header">
        <h2>Ops Playbooks</h2>
        <small>Composable macros with dry-run preview, live execute, and replay timeline.</small>
      </header>

      <div className="fo-stack">
        <input
          className="fo-input"
          value={playbookName}
          onChange={event => setPlaybookName(event.target.value)}
          placeholder="Playbook name"
        />
        <textarea
          className="fo-input"
          rows={3}
          value={playbookChain}
          onChange={event => setPlaybookChain(event.target.value)}
          placeholder={CHAIN_HINT}
        />
        <small>
          Commands parsed: {parsed.commands.length} | invalid tokens:{' '}
          {parsed.invalidTokens.length > 0 ? parsed.invalidTokens.join(', ') : 'none'}
        </small>
        <button
          className="fo-btn"
          type="button"
          disabled={
            !playbookName.trim() ||
            parsed.commands.length === 0 ||
            parsed.invalidTokens.length > 0 ||
            create.isPending
          }
          onClick={() =>
            create.mutate({
              name: playbookName.trim(),
              commands: parsed.commands,
            })
          }
        >
          Create playbook
        </button>
      </div>

      <div className="fo-stack">
        {(playbooks.data || []).map((playbook: Playbook) => (
          <article key={playbook.id} className="fo-card">
            <div className="fo-space-between">
              <strong>{playbook.name}</strong>
              <small>{playbook.commands.length} steps</small>
            </div>
            <small>{playbook.description}</small>
            <small>{playbook.commands.map(command => String(command.verb || '?')).join(' -> ')}</small>
            <div className="fo-row">
              <button
                className="fo-btn-secondary"
                type="button"
                onClick={() => setSelectedPlaybookId(playbook.id)}
              >
                History
              </button>
              <button
                className="fo-btn-secondary"
                type="button"
                onClick={() => run.mutate({ playbookId: playbook.id, dryRun: true })}
              >
                Dry-run
              </button>
              <button
                className="fo-btn"
                type="button"
                onClick={() => run.mutate({ playbookId: playbook.id, dryRun: false })}
              >
                Execute live
              </button>
            </div>
          </article>
        ))}
      </div>

      <div className="fo-space-between">
        <strong>Playbook run timeline</strong>
        <div className="fo-row">
          <select
            className="fo-input"
            value={runModeFilter}
            onChange={event => setRunModeFilter(event.target.value as RunModeFilter)}
          >
            <option value="all">all</option>
            <option value="dry-run">dry-run</option>
            <option value="live">live</option>
            <option value="errors">errors</option>
          </select>
        </div>
      </div>

      <div className="fo-log-list">
        {(playbookRuns.data || []).map(runItem => (
          <article key={runItem.id} className={`fo-log ${statusColorClass(runItem)}`}>
            <div className="fo-space-between">
              <strong>{runItem.playbookId}</strong>
              <small>{new Date(runItem.createdAtMs).toLocaleString()}</small>
            </div>
            <small>
              {runItem.dryRun ? 'dry-run' : 'live'} | {runItem.executedSteps} steps |{' '}
              {runItem.errorCount} errors
            </small>
            <small>
              actor: {runItem.actorId} | surface: {runItem.sourceSurface}
            </small>
            <small>{runItem.chain || '(no executable chain)'}</small>
            <div className="fo-row">
              <button
                className="fo-btn-secondary"
                type="button"
                onClick={() => replay.mutate({ runId: runItem.id, dryRun: true })}
              >
                Replay dry-run
              </button>
              <button
                className="fo-btn-secondary"
                type="button"
                onClick={() => replay.mutate({ runId: runItem.id, dryRun: false })}
              >
                Replay live
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}


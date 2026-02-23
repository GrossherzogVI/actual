import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  ExecutionMode,
  GuardrailProfile,
  Playbook,
  PlaybookRun,
  WorkflowCommandExecution,
} from '../../core/types';
import { apiClient } from '../../core/api/client';
import { RunDetailsDrawer } from '../runtime/RunDetailsDrawer';
import {
  type RunDetailsCommandEventDetail,
  type RunDetailsSelector,
  RUN_DETAILS_COMMAND_EVENT,
} from '../runtime/run-details-commands';

type PlaybooksPanelProps = {
  onStatus: (status: string) => void;
};

type RunModeFilter =
  | 'all'
  | 'dry-run'
  | 'live'
  | 'errors'
  | 'blocked'
  | 'failed'
  | 'rolled_back';

type PlaybookStepDefinition = {
  token: string;
  label: string;
  description: string;
  command: Record<string, unknown>;
  category: 'triage' | 'contracts' | 'close' | 'utility';
};

const CHAIN_HINT =
  'triage -> expiring<30d -> batch-renegotiate -> close-weekly -> refresh';

const STEP_DEFINITIONS: PlaybookStepDefinition[] = [
  {
    token: 'triage',
    label: 'Resolve Next',
    description: 'Prioritize next action from adaptive focus.',
    command: { verb: 'resolve-next-action', lane: 'triage' },
    category: 'triage',
  },
  {
    token: 'expiring<30d',
    label: 'Expiring Contracts <30d',
    description: 'Open expiring contracts lane for proactive renewal.',
    command: { verb: 'open-expiring-contracts', windowDays: 30 },
    category: 'contracts',
  },
  {
    token: 'batch-renegotiate',
    label: 'Assign Renegotiation Lane',
    description: 'Create delegate mission for contract renegotiation.',
    command: { verb: 'assign-expiring-contracts-lane' },
    category: 'contracts',
  },
  {
    token: 'open-review',
    label: 'Open Urgent Review',
    description: 'Route to urgent review queue.',
    command: { verb: 'open-urgent-review' },
    category: 'triage',
  },
  {
    token: 'close-weekly',
    label: 'Run Weekly Close',
    description: 'Execute weekly close routine.',
    command: { verb: 'run-close', period: 'weekly' },
    category: 'close',
  },
  {
    token: 'close-monthly',
    label: 'Run Monthly Close',
    description: 'Execute monthly close routine.',
    command: { verb: 'run-close', period: 'monthly' },
    category: 'close',
  },
  {
    token: 'refresh',
    label: 'Refresh Command Center',
    description: 'Refresh cockpit context after execution.',
    command: { verb: 'refresh-command-center' },
    category: 'utility',
  },
];

const STEP_BY_TOKEN = new Map(STEP_DEFINITIONS.map(step => [step.token, step]));

const PLAYBOOK_TEMPLATES: Array<{
  id: string;
  label: string;
  tokens: string[];
}> = [
  {
    id: 'morning',
    label: 'Morning Loop',
    tokens: ['triage', 'open-review', 'close-weekly', 'refresh'],
  },
  {
    id: 'expiring-contracts',
    label: 'Contract Pressure',
    tokens: ['triage', 'expiring<30d', 'batch-renegotiate', 'refresh'],
  },
  {
    id: 'close-weekly',
    label: 'Close Sprint',
    tokens: ['triage', 'close-weekly', 'refresh'],
  },
];

function tokenizeChain(chain: string): string[] {
  return chain
    .split('->')
    .map(token => token.trim().toLowerCase())
    .filter(Boolean);
}

function joinChain(tokens: string[]): string {
  return tokens.join(' -> ');
}

function parsePlaybookChain(chain: string): {
  tokens: string[];
  commands: Array<Record<string, unknown>>;
  invalidTokens: string[];
  resolvedSteps: PlaybookStepDefinition[];
} {
  const tokens = tokenizeChain(chain);
  const commands: Array<Record<string, unknown>> = [];
  const invalidTokens: string[] = [];
  const resolvedSteps: PlaybookStepDefinition[] = [];

  for (const token of tokens) {
    if (token === 'close' || token === 'weekly') {
      const step = STEP_BY_TOKEN.get('close-weekly');
      if (step) {
        commands.push(step.command);
        resolvedSteps.push(step);
      }
      continue;
    }

    if (token === 'monthly') {
      const step = STEP_BY_TOKEN.get('close-monthly');
      if (step) {
        commands.push(step.command);
        resolvedSteps.push(step);
      }
      continue;
    }

    if (token === 'resolve-next') {
      const step = STEP_BY_TOKEN.get('triage');
      if (step) {
        commands.push(step.command);
        resolvedSteps.push(step);
      }
      continue;
    }

    const step = STEP_BY_TOKEN.get(token);
    if (step) {
      commands.push(step.command);
      resolvedSteps.push(step);
      continue;
    }
    invalidTokens.push(token);
  }

  return { tokens, commands, invalidTokens, resolvedSteps };
}

function statusColorClass(run: PlaybookRun): string {
  if (run.status === 'failed' || run.status === 'blocked') {
    return 'fo-log-error';
  }
  return run.executionMode === 'live' ? 'fo-log-live' : '';
}

function previewStepClass(step: WorkflowCommandExecution['steps'][number]): string {
  return step.status === 'error' ? 'fo-preview-step fo-preview-step-error' : 'fo-preview-step';
}

function mutationErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return `${fallback}: ${error.message}`;
  }
  return fallback;
}

export function PlaybooksPanel({ onStatus }: PlaybooksPanelProps) {
  const queryClient = useQueryClient();
  const [playbookName, setPlaybookName] = useState('');
  const [playbookChain, setPlaybookChain] = useState(CHAIN_HINT);
  const [selectedPlaybookId, setSelectedPlaybookId] = useState('');
  const [runModeFilter, setRunModeFilter] = useState<RunModeFilter>('all');
  const [previewResult, setPreviewResult] = useState<WorkflowCommandExecution | null>(null);
  const [previewChain, setPreviewChain] = useState('');
  const [executionMode, setExecutionMode] = useState<ExecutionMode>('dry-run');
  const [guardrailProfile, setGuardrailProfile] =
    useState<GuardrailProfile>('strict');
  const [rollbackWindowMinutes, setRollbackWindowMinutes] = useState(60);
  const [rollbackOnFailure, setRollbackOnFailure] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [pendingRunDetailsSelector, setPendingRunDetailsSelector] =
    useState<RunDetailsSelector | null>(null);

  const parsed = useMemo(() => parsePlaybookChain(playbookChain), [playbookChain]);
  const normalizedChain = useMemo(() => joinChain(parsed.tokens), [parsed.tokens]);

  useEffect(() => {
    setPreviewResult(null);
    setPreviewChain('');
  }, [normalizedChain]);

  useEffect(() => {
    const onRunDetailsCommand = (event: Event) => {
      const detail = (event as CustomEvent<RunDetailsCommandEventDetail>).detail;
      if (!detail || detail.scope !== 'playbook') {
        return;
      }

      setRunModeFilter('all');
      setSelectedPlaybookId('');
      setPendingRunDetailsSelector(detail.selector);
      onStatus('Resolving playbook run details view...');
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
        executionMode:
          runModeFilter === 'dry-run'
            ? 'dry-run'
            : runModeFilter === 'live'
              ? 'live'
              : undefined,
        status:
          runModeFilter === 'blocked'
            ? 'blocked'
            : runModeFilter === 'failed'
              ? 'failed'
              : runModeFilter === 'rolled_back'
                ? 'rolled_back'
              : undefined,
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
    onError: error => {
      onStatus(mutationErrorMessage(error, 'Create playbook failed'));
    },
  });

  const run = useMutation({
    mutationFn: async (input: { playbookId: string; executionMode: ExecutionMode }) =>
      apiClient.runPlaybook(input.playbookId, {
        executionMode: input.executionMode,
        guardrailProfile,
        rollbackWindowMinutes,
        rollbackOnFailure,
        idempotencyKey: idempotencyKey.trim() || undefined,
      }),
    onSuccess: async result => {
      onStatus(
        `Playbook run ${result.id}: ${result.status} (${result.executionMode}), ${result.executedSteps} steps / ${result.errorCount} errors.`,
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['playbook-runs'] }),
        queryClient.invalidateQueries({ queryKey: ['delegate-lanes'] }),
        queryClient.invalidateQueries({ queryKey: ['focus-panel'] }),
      ]);
    },
    onError: error => {
      onStatus(mutationErrorMessage(error, 'Run playbook failed'));
    },
  });

  const replay = useMutation({
    mutationFn: async (input: { runId: string; executionMode: ExecutionMode }) =>
      apiClient.replayPlaybookRun(input.runId, {
        executionMode: input.executionMode,
        guardrailProfile,
        rollbackWindowMinutes,
        rollbackOnFailure,
      }),
    onSuccess: async result => {
      onStatus(
        `Replayed run ${result.id} (${result.executionMode}) with status ${result.status}.`,
      );
      await queryClient.invalidateQueries({ queryKey: ['playbook-runs'] });
    },
    onError: error => {
      onStatus(mutationErrorMessage(error, 'Replay run failed'));
    },
  });

  const preview = useMutation({
    mutationFn: async (chain: string) =>
      apiClient.executeCommandChain(chain, 'delegate', {
        executionMode: 'dry-run',
        guardrailProfile,
        rollbackWindowMinutes,
        rollbackOnFailure,
      }),
    onSuccess: result => {
      setPreviewResult(result);
      setPreviewChain(normalizedChain);
      onStatus(
        `Dry-run preview: ${result.steps.length} steps, ${result.errorCount} errors.`,
      );
    },
    onError: error => {
      onStatus(mutationErrorMessage(error, 'Dry-run preview failed'));
    },
  });

  const rollback = useMutation({
    mutationFn: async (runId: string) => apiClient.rollbackPlaybookRun(runId),
    onSuccess: async result => {
      onStatus(`Rollback completed: ${result.id}`);
      setSelectedRunId(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['playbook-runs'] }),
        queryClient.invalidateQueries({ queryKey: ['delegate-lanes'] }),
        queryClient.invalidateQueries({ queryKey: ['focus-panel'] }),
      ]);
    },
    onError: error => {
      onStatus(mutationErrorMessage(error, 'Rollback failed'));
    },
  });

  const appendToken = (token: string) => {
    setPlaybookChain(prev => {
      const tokens = tokenizeChain(prev);
      tokens.push(token);
      return joinChain(tokens);
    });
  };

  const removeTokenAt = (index: number) => {
    setPlaybookChain(prev => {
      const tokens = tokenizeChain(prev);
      if (index < 0 || index >= tokens.length) {
        return prev;
      }
      tokens.splice(index, 1);
      return joinChain(tokens);
    });
  };

  const applyTemplate = (templateId: string) => {
    const template = PLAYBOOK_TEMPLATES.find(item => item.id === templateId);
    if (!template) {
      return;
    }
    setPlaybookChain(joinChain(template.tokens));
  };

  const canPreview = parsed.commands.length > 0 && parsed.invalidTokens.length === 0;
  const showPreview = previewResult && previewChain === normalizedChain;
  const selectedRun = useMemo<PlaybookRun | null>(
    () =>
      selectedRunId
        ? (playbookRuns.data || []).find(runItem => runItem.id === selectedRunId) || null
        : null,
    [playbookRuns.data, selectedRunId],
  );
  useEffect(() => {
    if (!pendingRunDetailsSelector) {
      return;
    }
    if (playbookRuns.isFetching) {
      return;
    }

    const runs = playbookRuns.data || [];
    const now = Date.now();
    const candidate =
      pendingRunDetailsSelector === 'latest-live'
        ? runs.find(runItem => runItem.executionMode === 'live')
        : pendingRunDetailsSelector === 'latest-failed'
          ? runs.find(runItem => runItem.status === 'failed')
          : pendingRunDetailsSelector === 'latest-blocked'
            ? runs.find(runItem => runItem.status === 'blocked')
            : runs.find(
                runItem =>
                  runItem.rollbackEligible &&
                  (runItem.status === 'completed' || runItem.status === 'failed') &&
                  typeof runItem.rollbackWindowUntilMs === 'number' &&
                  runItem.rollbackWindowUntilMs > now,
              );

    if (!candidate) {
      onStatus(`No ${pendingRunDetailsSelector.replace('latest-', '')} playbook run found.`);
      setPendingRunDetailsSelector(null);
      return;
    }

    setSelectedRunId(candidate.id);
    setPendingRunDetailsSelector(null);
    onStatus(`Opened details for playbook run ${candidate.id} (${candidate.status}).`);
  }, [
    onStatus,
    pendingRunDetailsSelector,
    playbookRuns.data,
    playbookRuns.isFetching,
  ]);

  return (
    <section className="fo-panel">
      <header className="fo-panel-header">
        <h2>Ops Playbooks v2</h2>
        <small>Visual chain composer, guardrail-aware execution controls, and rollback-ready history.</small>
      </header>

      <div className="fo-stack">
        <input
          className="fo-input"
          value={playbookName}
          onChange={event => setPlaybookName(event.target.value)}
          placeholder="Playbook name"
        />

        <div className="fo-row fo-playbook-templates">
          {PLAYBOOK_TEMPLATES.map(template => (
            <button
              key={template.id}
              className="fo-chip"
              type="button"
              onClick={() => applyTemplate(template.id)}
            >
              {template.label}
            </button>
          ))}
        </div>

        <div className="fo-playbook-token-bank">
          {STEP_DEFINITIONS.map(step => (
            <button
              key={step.token}
              className={`fo-chip fo-playbook-token fo-playbook-token-${step.category}`}
              type="button"
              onClick={() => appendToken(step.token)}
              title={step.description}
            >
              {step.label}
            </button>
          ))}
        </div>

        <div className="fo-playbook-chain-grid">
          {parsed.tokens.length === 0 ? (
            <small className="fo-muted-line">Add chain blocks from the token bank.</small>
          ) : (
            parsed.tokens.map((token, index) => {
              const step = STEP_BY_TOKEN.get(token);
              const isInvalid = !step;
              return (
                <article
                  key={`${token}-${index}`}
                  className={`fo-playbook-chain-block ${isInvalid ? 'fo-playbook-chain-block-invalid' : ''}`}
                >
                  <div className="fo-space-between">
                    <strong>{step?.label || token}</strong>
                    <button
                      className="fo-playbook-chain-remove"
                      type="button"
                      onClick={() => removeTokenAt(index)}
                    >
                      x
                    </button>
                  </div>
                  <small>{step?.description || 'Unknown token - remove or fix manually.'}</small>
                  {index < parsed.tokens.length - 1 ? <small className="fo-playbook-chain-arrow">then</small> : null}
                </article>
              );
            })
          )}
        </div>

        <textarea
          className="fo-input"
          rows={2}
          value={playbookChain}
          onChange={event => setPlaybookChain(event.target.value)}
          placeholder={CHAIN_HINT}
        />
        <small>
          Parsed steps: {parsed.commands.length} | invalid tokens:{' '}
          {parsed.invalidTokens.length > 0 ? parsed.invalidTokens.join(', ') : 'none'}
        </small>

        <div className="fo-row">
          <select
            className="fo-input"
            aria-label="playbook execution mode"
            value={executionMode}
            onChange={event => setExecutionMode(event.target.value as ExecutionMode)}
          >
            <option value="dry-run">dry-run</option>
            <option value="live">live</option>
          </select>
          <select
            className="fo-input"
            aria-label="playbook guardrail profile"
            value={guardrailProfile}
            onChange={event =>
              setGuardrailProfile(event.target.value as GuardrailProfile)
            }
          >
            <option value="strict">strict</option>
            <option value="balanced">balanced</option>
            <option value="off">off</option>
          </select>
          <input
            className="fo-input"
            aria-label="playbook rollback window minutes"
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
              aria-label="playbook rollback on failure"
              checked={rollbackOnFailure}
              onChange={event => setRollbackOnFailure(event.target.checked)}
            />
            <small>rollback on failure</small>
          </label>
        </div>

        <input
          className="fo-input"
          aria-label="playbook idempotency key"
          placeholder="idempotency key (optional)"
          value={idempotencyKey}
          onChange={event => setIdempotencyKey(event.target.value)}
        />

        <div className="fo-row">
          <button
            className="fo-btn-secondary"
            type="button"
            disabled={!canPreview || preview.isPending}
            onClick={() => preview.mutate(normalizedChain)}
          >
            {preview.isPending ? 'Previewing...' : 'Run Dry-run Preview'}
          </button>

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
            {create.isPending ? 'Creating...' : 'Create Playbook'}
          </button>
        </div>
      </div>

      {showPreview ? (
        <section className="fo-preview-panel">
          <div className="fo-space-between">
            <strong>Dry-run Step Diff Preview</strong>
            <small>
              steps: {previewResult.steps.length} | errors: {previewResult.errorCount}
            </small>
          </div>
          <div className="fo-preview-steps">
            {previewResult.steps.map((step, index) => (
              <article key={step.id || `${step.canonical}-${index}`} className={previewStepClass(step)}>
                <div className="fo-space-between">
                  <strong>{step.canonical || step.raw}</strong>
                  <small>{step.status}</small>
                </div>
                <small>{step.detail}</small>
              </article>
            ))}
          </div>
        </section>
      ) : null}

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
                onClick={() =>
                  run.mutate({ playbookId: playbook.id, executionMode: 'dry-run' })
                }
              >
                Dry-run
              </button>
              <button
                className="fo-btn"
                type="button"
                onClick={() =>
                  run.mutate({ playbookId: playbook.id, executionMode: 'live' })
                }
              >
                Execute Live
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
            aria-label="playbook run mode filter"
            value={runModeFilter}
            onChange={event => setRunModeFilter(event.target.value as RunModeFilter)}
          >
            <option value="all">all</option>
            <option value="dry-run">dry-run</option>
            <option value="live">live</option>
            <option value="errors">errors</option>
            <option value="blocked">blocked</option>
            <option value="failed">failed</option>
            <option value="rolled_back">rolled_back</option>
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
              {runItem.executionMode} | status: {runItem.status} | {runItem.executedSteps}{' '}
              steps | {runItem.errorCount} errors
            </small>
            <small>
              actor: {runItem.actorId} | surface: {runItem.sourceSurface}
            </small>
            <small>
              timeline: {new Date(runItem.startedAtMs).toLocaleTimeString()} -&gt;{' '}
              {runItem.finishedAtMs
                ? new Date(runItem.finishedAtMs).toLocaleTimeString()
                : 'running'}
            </small>
            {runItem.statusTimeline.length > 0 ? (
              <small>
                status path:{' '}
                {runItem.statusTimeline.map(transition => transition.status).join(' -> ')}
              </small>
            ) : null}
            <small>
              rollback:{' '}
              {runItem.rollbackEligible &&
              runItem.rollbackWindowUntilMs &&
              runItem.rollbackWindowUntilMs > Date.now()
                ? `eligible until ${new Date(runItem.rollbackWindowUntilMs).toLocaleTimeString()}`
                : 'not eligible'}
            </small>
            <small>{runItem.chain || '(no executable chain)'}</small>
            {runItem.guardrailResults.length > 0 ? (
              <small>
                guardrails:{' '}
                {runItem.guardrailResults
                  .map(result => `${result.ruleId}:${result.passed ? 'pass' : 'fail'}`)
                  .join(', ')}
              </small>
            ) : null}
            {runItem.effectSummaries.length > 0 ? (
              <small>
                effects:{' '}
                {runItem.effectSummaries
                  .map(effect => `${effect.kind}:${effect.status}`)
                  .join(', ')}
              </small>
            ) : null}
            <div className="fo-row">
              <button
                className="fo-btn-secondary"
                type="button"
                onClick={() => setSelectedRunId(runItem.id)}
              >
                Details
              </button>
              <button
                className="fo-btn-secondary"
                type="button"
                onClick={() =>
                  replay.mutate({ runId: runItem.id, executionMode: 'dry-run' })
                }
              >
                Replay dry-run
              </button>
              <button
                className="fo-btn-secondary"
                type="button"
                onClick={() =>
                  replay.mutate({ runId: runItem.id, executionMode: 'live' })
                }
              >
                Replay live
              </button>
              <button
                className="fo-btn-secondary"
                type="button"
                disabled={
                  rollback.isPending ||
                  !runItem.rollbackEligible ||
                  !(runItem.status === 'completed' || runItem.status === 'failed') ||
                  (runItem.rollbackWindowUntilMs
                    ? runItem.rollbackWindowUntilMs <= Date.now()
                    : true)
                }
                onClick={() => rollback.mutate(runItem.id)}
              >
                {rollback.isPending ? 'Rolling back...' : 'Rollback'}
              </button>
            </div>
          </article>
        ))}
      </div>
      <RunDetailsDrawer
        run={selectedRun}
        onClose={() => setSelectedRunId(null)}
        onRollback={runId => rollback.mutate(runId)}
        rollbackPending={rollback.isPending}
      />
    </section>
  );
}

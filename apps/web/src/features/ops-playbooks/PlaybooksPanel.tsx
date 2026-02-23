import { useEffect, useMemo, useState } from 'react';
import { Trans } from 'react-i18next';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '../../core/api/client';
import type {
  ExecutionMode,
  GuardrailProfile,
  Playbook,
  PlaybookRun,
  WorkflowCommandExecution,
} from '../../core/types';
import { RUN_DETAILS_COMMAND_EVENT } from '../runtime/run-details-commands';
import type { RunDetailsCommandEventDetail, RunDetailsSelector } from '../runtime/run-details-commands';
import { RunDetailsDrawer } from '../runtime/RunDetailsDrawer';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type PlaybooksPanelProps = {
  onStatus: (status: string) => void;
  onRoute?: (route: string) => void;
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

function previewStepClass(
  step: WorkflowCommandExecution['steps'][number],
): string {
  return step.status === 'error'
    ? 'fo-preview-step fo-preview-step-error'
    : 'fo-preview-step';
}

function mutationErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return `${fallback}: ${error.message}`;
  }
  return fallback;
}

function commandToToken(command: Record<string, unknown>): string | null {
  const verb = command.verb;
  if (verb === 'resolve-next-action') return 'triage';
  if (verb === 'open-expiring-contracts') return 'expiring<30d';
  if (verb === 'assign-expiring-contracts-lane') return 'batch-renegotiate';
  if (verb === 'open-urgent-review') return 'open-review';
  if (verb === 'refresh-command-center') return 'refresh';
  if (verb === 'run-close') {
    return command.period === 'monthly' ? 'close-monthly' : 'close-weekly';
  }
  return null;
}

function playbookToChain(playbook: Playbook): string {
  const tokens = playbook.commands
    .map(command => commandToToken(command))
    .filter(
      (token): token is string => typeof token === 'string' && token.length > 0,
    );
  if (tokens.length === 0) {
    return 'triage -> refresh';
  }
  return joinChain(tokens);
}

export function PlaybooksPanel({ onStatus, onRoute }: PlaybooksPanelProps) {
  const queryClient = useQueryClient();
  const [playbookName, setPlaybookName] = useState('');
  const [playbookChain, setPlaybookChain] = useState(CHAIN_HINT);
  const [selectedPlaybookId, setSelectedPlaybookId] = useState('');
  const [runModeFilter, setRunModeFilter] = useState<RunModeFilter>('all');
  const [previewResult, setPreviewResult] =
    useState<WorkflowCommandExecution | null>(null);
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

  const parsed = useMemo(
    () => parsePlaybookChain(playbookChain),
    [playbookChain],
  );
  const normalizedChain = useMemo(
    () => joinChain(parsed.tokens),
    [parsed.tokens],
  );

  useEffect(() => {
    setPreviewResult(null);
    setPreviewChain('');
  }, [normalizedChain]);

  useEffect(() => {
    const onRunDetailsCommand = (event: Event) => {
      const detail = (event as CustomEvent<RunDetailsCommandEventDetail>)
        .detail;
      if (!detail || detail.scope !== 'playbook') {
        return;
      }

      setRunModeFilter('all');
      setSelectedPlaybookId('');
      if (detail.selector) {
        setPendingRunDetailsSelector(detail.selector);
        onStatus('Resolving playbook run details view...');
      }
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
    mutationFn: async (input: {
      name: string;
      commands: Array<Record<string, unknown>>;
    }) => apiClient.createPlaybook(input.name, input.commands),
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
    mutationFn: async (input: {
      playbookId: string;
      executionMode: ExecutionMode;
    }) =>
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
    mutationFn: async (input: {
      runId: string;
      executionMode: ExecutionMode;
    }) =>
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

  const simulate = useMutation({
    mutationFn: async (input: {
      label: string;
      chain: string;
      expectedImpact: string;
    }) =>
      apiClient.simulateScenarioBranch({
        label: input.label,
        chain: input.chain,
        source: 'manual',
        expectedImpact: input.expectedImpact,
        confidence: executionMode === 'live' ? 0.9 : 0.82,
        notes: `Generated from ops playbooks panel. mode=${executionMode} guardrail=${guardrailProfile}.`,
      }),
    onSuccess: async simulation => {
      onStatus(
        `Playbook simulation ready: ${simulation.branch.name} (Δamount ${simulation.amountDelta}, Δrisk ${simulation.riskDelta}).`,
      );
      onRoute?.('/ops#spatial-twin');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['scenario-branches'] }),
        queryClient.invalidateQueries({ queryKey: ['scenario-mutations'] }),
        queryClient.invalidateQueries({ queryKey: ['scenario-compare'] }),
        queryClient.invalidateQueries({
          queryKey: ['scenario-adoption-check'],
        }),
        queryClient.invalidateQueries({ queryKey: ['scenario-lineage'] }),
      ]);
    },
    onError: error => {
      onStatus(mutationErrorMessage(error, 'Simulate playbook failed'));
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

  const canPreview =
    parsed.commands.length > 0 && parsed.invalidTokens.length === 0;
  const showPreview = previewResult && previewChain === normalizedChain;
  const selectedRun = useMemo<PlaybookRun | null>(
    () =>
      selectedRunId
        ? (playbookRuns.data || []).find(
            runItem => runItem.id === selectedRunId,
          ) || null
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
                  (runItem.status === 'completed' ||
                    runItem.status === 'failed') &&
                  typeof runItem.rollbackWindowUntilMs === 'number' &&
                  runItem.rollbackWindowUntilMs > now,
              );

    if (!candidate) {
      onStatus(
        `No ${pendingRunDetailsSelector.replace('latest-', '')} playbook run found.`,
      );
      setPendingRunDetailsSelector(null);
      return;
    }

    setSelectedRunId(candidate.id);
    setPendingRunDetailsSelector(null);
    onStatus(
      `Opened details for playbook run ${candidate.id} (${candidate.status}).`,
    );
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
        <small>
          Visual chain composer, guardrail-aware execution controls, and
          rollback-ready history.
        </small>
      </header>

      <div className="fo-stack">
        <Input
          value={playbookName}
          onChange={event => setPlaybookName(event.target.value)}
          placeholder={t("Playbook name")}
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
            <small className="fo-muted-line">
              Add chain blocks from the token bank.
            </small>
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
                  <small>
                    {step?.description ||
                      'Unknown token - remove or fix manually.'}
                  </small>
                  {index < parsed.tokens.length - 1 ? (
                    <small className="fo-playbook-chain-arrow">then</small>
                  ) : null}
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
          {parsed.invalidTokens.length > 0
            ? parsed.invalidTokens.join(', ')
            : 'none'}
        </small>

        <div className="fo-row">
          <Select
            value={executionMode}
            onValueChange={value => setExecutionMode(value as ExecutionMode)}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder={t("Mode")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="dry-run">dry-run</SelectItem>
              <SelectItem value="live">live</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={guardrailProfile}
            onValueChange={value =>
              setGuardrailProfile(value as GuardrailProfile)
            }
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder={t("Guardrail")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="strict">strict</SelectItem>
              <SelectItem value="balanced">balanced</SelectItem>
              <SelectItem value="off">off</SelectItem>
            </SelectContent>
          </Select>
          <Input
            className="w-[120px]"
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
            title={t("Rollback window minutes")}
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

        <Input
          aria-label="playbook idempotency key"
          placeholder="idempotency key (optional)"
          value={idempotencyKey}
          onChange={event => setIdempotencyKey(event.target.value)}
        />

        <div className="fo-row">
          <Button
            variant="secondary"
            disabled={!canPreview || preview.isPending}
            onClick={() => preview.mutate(normalizedChain)}
          >
            {preview.isPending ? 'Previewing...' : t('Run Dry-run Preview')}
          </Button>
          <Button
            variant="secondary"
            disabled={!canPreview || simulate.isPending}
            onClick={() =>
              simulate.mutate({
                label: `Playbook Draft ${playbookName.trim() || 'simulation'}`,
                chain: normalizedChain || 'triage -> refresh',
                expectedImpact: 'playbook execution rehearsal',
              })
            }
          >
            {simulate.isPending ? 'Simulating...' : t('Simulate Chain')}
          </Button>

          <Button
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
            {create.isPending ? 'Creating...' : t('Create Playbook')}
          </Button>
        </div>
      </div>

      {showPreview ? (
        <section className="fo-preview-panel">
          <div className="fo-space-between">
            <strong>
              <Trans>Dry-run Step Diff Preview</Trans>
            </strong>
            <small>
              steps: {previewResult.steps.length} | errors:{' '}
              {previewResult.errorCount}
            </small>
          </div>
          <div className="fo-preview-steps">
            {previewResult.steps.map((step, index) => (
              <article
                key={step.id || `${step.canonical}-${index}`}
                className={previewStepClass(step)}
              >
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
            <small>
              {playbook.commands
                .map(command => String(command.verb || '?'))
                .join(' -> ')}
            </small>
            <div className="fo-row mt-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setSelectedPlaybookId(playbook.id)}
              ><Trans>
                History
              </Trans></Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  run.mutate({
                    playbookId: playbook.id,
                    executionMode: 'dry-run',
                  })
                }
              ><Trans>
                Dry-run
              </Trans></Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={simulate.isPending}
                onClick={() =>
                  simulate.mutate({
                    label: `Playbook ${playbook.name}`,
                    chain: playbookToChain(playbook),
                    expectedImpact: 'playbook template rehearsal',
                  })
                }
              >
                {simulate.isPending ? 'Simulating...' : t('Simulate')}
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  run.mutate({ playbookId: playbook.id, executionMode: 'live' })
                }
              ><Trans>
                Execute Live
              </Trans></Button>
            </div>
          </article>
        ))}
      </div>

      <div className="fo-space-between">
        <strong><Trans>Playbook run timeline</Trans></strong>
        <div className="fo-row">
          <Select
            value={runModeFilter}
            onValueChange={value => setRunModeFilter(value as RunModeFilter)}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder={t('Mode')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">all</SelectItem>
              <SelectItem value="dry-run">dry-run</SelectItem>
              <SelectItem value="live">live</SelectItem>
              <SelectItem value="errors">errors</SelectItem>
              <SelectItem value="blocked">blocked</SelectItem>
              <SelectItem value="failed">failed</SelectItem>
              <SelectItem value="rolled_back">rolled_back</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="fo-log-list">
        {(playbookRuns.data || []).map(runItem => (
          <article
            key={runItem.id}
            className={`fo-log ${statusColorClass(runItem)}`}
          >
            <div className="fo-space-between">
              <strong>{runItem.playbookId}</strong>
              <small>{new Date(runItem.createdAtMs).toLocaleString()}</small>
            </div>
            <small>
              {runItem.executionMode} | status: {runItem.status} |{' '}
              {runItem.executedSteps} steps | {runItem.errorCount} errors
            </small>
            <small>
              actor: {runItem.actorId} | surface: {runItem.sourceSurface}
            </small>
            <small>
              timeline: {new Date(runItem.startedAtMs).toLocaleTimeString()}{' '}
              -&gt;{' '}
              {runItem.finishedAtMs
                ? new Date(runItem.finishedAtMs).toLocaleTimeString()
                : 'running'}
            </small>
            {runItem.statusTimeline.length > 0 ? (
              <small>
                status path:{' '}
                {runItem.statusTimeline
                  .map(transition => transition.status)
                  .join(' -> ')}
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
                  .map(
                    result =>
                      `${result.ruleId}:${result.passed ? 'pass' : 'fail'}`,
                  )
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
            <div className="fo-row mt-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setSelectedRunId(runItem.id)}
              ><Trans>
                Details
              </Trans></Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  replay.mutate({ runId: runItem.id, executionMode: 'dry-run' })
                }
              ><Trans>
                Replay dry-run
              </Trans></Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={simulate.isPending || !runItem.chain}
                onClick={() =>
                  simulate.mutate({
                    label: `Playbook run ${runItem.id}`,
                    chain: runItem.chain || 'triage -> refresh',
                    expectedImpact: 'playbook run scenario rehearsal',
                  })
                }
              >
                {simulate.isPending ? 'Simulating...' : t('Simulate')}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  replay.mutate({ runId: runItem.id, executionMode: 'live' })
                }
              ><Trans>
                Replay live
              </Trans></Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={
                  rollback.isPending ||
                  !runItem.rollbackEligible ||
                  !(
                    runItem.status === 'completed' ||
                    runItem.status === 'failed'
                  ) ||
                  (runItem.rollbackWindowUntilMs
                    ? runItem.rollbackWindowUntilMs <= Date.now()
                    : true)
                }
                onClick={() => rollback.mutate(runItem.id)}
              >
                {rollback.isPending ? 'Rolling back...' : t('Rollback')}
              </Button>
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

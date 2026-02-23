import {
  parseCommandChain,
  type CommandParseStep,
} from '@finance-os/domain-kernel';

import type { GatewayQueue } from '../queue/types';
import type { GatewayRepository } from '../repositories/types';
import type {
  CloseRun,
  ExecutionMode,
  GuardrailProfile,
  OpsActivityEvent,
  PlaybookRun,
  RunStatus,
  RunStatusTransition,
  WorkflowCommandExecution,
  WorkflowPlaybook,
} from '../types';

import {
  buildStepEffectSummary,
  isStepReversible,
} from './autopilot/effects';
import { evaluateGuardrails } from './autopilot/guardrails';
import {
  computeRollbackWindowUntil,
  isRollbackEligibleByEffects,
  isRollbackSourceStatus,
} from './autopilot/status';
import {
  type ExecutionOptionsInput,
  createTerminalStatusTimeline,
  isTerminalStatus,
  nanoid,
  normalizeExecutionOptions,
  queueJob,
  toCloseRunActivity,
  toPlaybookRunActivity,
  toPlaybookToken,
} from './helpers';

export type WorkflowDeps = {
  appendOpsActivityEvent: (event: OpsActivityEvent) => Promise<void>;
  executeWorkflowCommandChain: (input: {
    chain: string;
    assignee?: string;
    options?: ExecutionOptionsInput;
    actorId?: string;
    sourceSurface?: string;
    persist?: boolean;
  }) => Promise<WorkflowCommandExecution>;
  rollbackPlaybookRun: (input: {
    runId: string;
    reason?: string;
    actorId?: string;
    sourceSurface?: string;
  }) => Promise<PlaybookRun | null>;
};

export function createWorkflowService(
  repository: GatewayRepository,
  queue: GatewayQueue,
  deps: WorkflowDeps,
) {
  async function listPlaybooks(): Promise<WorkflowPlaybook[]> {
    return repository.listPlaybooks();
  }

  async function listPlaybookRuns(
    limit = 20,
    filters?: {
      playbookId?: string;
      actorId?: string;
      sourceSurface?: string;
      executionMode?: ExecutionMode;
      status?: RunStatus;
      idempotencyKey?: string;
      hasErrors?: boolean;
    },
  ) {
    return repository.listPlaybookRuns(
      Math.max(1, Math.min(limit, 200)),
      filters,
    );
  }

  async function createPlaybook(input: {
    name: string;
    description: string;
    commands: Array<Record<string, unknown>>;
  }): Promise<WorkflowPlaybook> {
    const now = Date.now();
    const playbook = await repository.createPlaybook({
      id: nanoid(),
      name: input.name,
      description: input.description,
      commands: input.commands,
      createdAtMs: now,
    });

    await queue.enqueue(
      queueJob('workflow.playbook.created', {
        playbookId: playbook.id,
      }),
    );

    return playbook;
  }

  async function runPlaybook(
    playbookId: string,
    optionsInput?: ExecutionOptionsInput,
    actorId = 'owner',
    sourceSurface = 'unknown',
  ): Promise<PlaybookRun | null> {
    const options = normalizeExecutionOptions(optionsInput, 'dry-run');
    if (options.idempotencyKey) {
      const existing = await repository.findRunByIdempotencyKey(
        'playbook',
        options.idempotencyKey,
      );
      if (
        existing &&
        'playbookId' in existing &&
        isTerminalStatus(existing.status)
      ) {
        return existing;
      }
    }

    const playbook = await repository.getPlaybookById(playbookId);
    if (!playbook) return null;

    const startedAtMs = Date.now();
    const runId = nanoid();
    const baseSteps = playbook.commands.map((command, index) => {
      const token = toPlaybookToken(command);
      return { index, command, token };
    });

    const unsupportedSteps = baseSteps
      .filter(step => !step.token)
      .map(step => ({
        index: step.index,
        command: step.command,
        status: 'error',
        detail: 'Unsupported playbook command payload.',
      }));

    const executableSteps = baseSteps.filter(
      step => typeof step.token === 'string',
    ) as Array<{
      index: number;
      command: Record<string, unknown>;
      token: string;
    }>;

    const chain = executableSteps.map(step => step.token).join(' -> ');
    const parsed = chain
      ? parseCommandChain(chain)
      : ({ steps: [], errors: [] } as {
          steps: CommandParseStep[];
          errors: Array<{
            code: 'empty-command' | 'unknown-token';
            index: number;
            raw: string;
          }>;
        });

    const opsState = await repository.getOpsState();
    const nonReversibleStepIds = new Set(
      parsed.steps
        .filter(step => !isStepReversible(step.id))
        .map(step => step.id),
    );
    const guardrailEvaluation = evaluateGuardrails({
      opsState,
      actorId,
      steps: parsed.steps,
      parseErrors: parsed.errors,
      profile: options.guardrailProfile,
      mode: options.executionMode,
      rollbackRequired: options.rollbackOnFailure,
      nonReversibleStepIds,
    });
    const shouldBlock =
      options.executionMode === 'live' &&
      guardrailEvaluation.hasBlockingFailure;

    const plannedStatusTimeline: RunStatusTransition[] = [
      { status: 'planned', atMs: startedAtMs, note: 'Execution accepted.' },
    ];
    const runningStatusTimeline: RunStatusTransition[] = [
      ...plannedStatusTimeline,
      { status: 'running', atMs: startedAtMs + 1, note: 'Execution started.' },
    ];
    const inFlightRunBase: PlaybookRun = {
      id: runId,
      playbookId,
      chain,
      executionMode: options.executionMode,
      guardrailProfile: options.guardrailProfile,
      status: 'planned',
      startedAtMs,
      finishedAtMs: undefined,
      rollbackWindowUntilMs: undefined,
      rollbackEligible: false,
      rollbackOfRunId: undefined,
      statusTimeline: plannedStatusTimeline,
      guardrailResults: guardrailEvaluation.results,
      effectSummaries: [],
      idempotencyKey: options.idempotencyKey,
      rollbackOnFailure: options.rollbackOnFailure,
      executedSteps: 0,
      errorCount: 0,
      actorId,
      sourceSurface,
      steps: [],
      createdAtMs: startedAtMs,
    };

    await repository.createPlaybookRun(inFlightRunBase);
    await repository.updatePlaybookRun({
      ...inFlightRunBase,
      status: 'running',
      statusTimeline: runningStatusTimeline,
    });
    await queue.enqueue(
      queueJob('autopilot-run-started', {
        scope: 'playbook',
        runId,
        playbookId,
        actorId,
        sourceSurface,
        executionMode: options.executionMode,
        guardrailProfile: options.guardrailProfile,
      }),
    );

    let commandRun: WorkflowCommandExecution | undefined;
    if (!shouldBlock && chain) {
      commandRun = await deps.executeWorkflowCommandChain({
        chain,
        options,
        actorId,
        sourceSurface,
      });
    }

    const executedSteps = executableSteps.map((step, index) => {
      const executionStep = commandRun?.steps[index];
      if (!executionStep) {
        return {
          index: step.index,
          command: step.command,
          status: 'error',
          detail: 'Missing execution result for playbook command.',
        };
      }
      return {
        index: step.index,
        command: step.command,
        status: executionStep.status,
        detail: executionStep.detail,
      };
    });

    const steps = [...unsupportedSteps, ...executedSteps].sort(
      (a, b) => a.index - b.index,
    );

    const fallbackEffects = steps.map((step, index) =>
      buildStepEffectSummary({
        effectId: `playbook-effect-${index + 1}`,
        stepId:
          typeof step.command.verb === 'string'
            ? step.command.verb
            : `step-${step.index}`,
        detail: step.detail || `Step ${step.index + 1}`,
        mode: options.executionMode,
        stepStatus: step.status === 'error' ? 'error' : 'ok',
      }),
    );
    const effectSummaries =
      commandRun && commandRun.effectSummaries.length > 0
        ? commandRun.effectSummaries
        : fallbackEffects;
    const errorCount = steps.filter(step => step.status === 'error').length;

    const status: RunStatus = shouldBlock
      ? 'blocked'
      : errorCount > 0
        ? 'failed'
        : 'completed';
    const finishedAtMs = commandRun?.finishedAtMs ?? Date.now();
    const rollbackEligible =
      options.executionMode === 'live' &&
      (status === 'completed' || status === 'failed') &&
      isRollbackEligibleByEffects(effectSummaries);
    const rollbackWindowUntilMs = rollbackEligible
      ? computeRollbackWindowUntil(startedAtMs, options.rollbackWindowMinutes)
      : undefined;
    const statusTimeline = createTerminalStatusTimeline({
      status,
      startedAtMs,
      finishedAtMs,
      note: shouldBlock
        ? 'Blocked by guardrail policy.'
        : status === 'failed'
          ? 'Execution finished with step errors.'
          : 'Execution completed.',
    });

    const run: PlaybookRun = {
      id: runId,
      playbookId,
      chain,
      executionMode: options.executionMode,
      guardrailProfile: options.guardrailProfile,
      status,
      startedAtMs,
      finishedAtMs,
      rollbackWindowUntilMs,
      rollbackEligible,
      rollbackOfRunId: undefined,
      statusTimeline,
      guardrailResults: guardrailEvaluation.results,
      effectSummaries,
      idempotencyKey: options.idempotencyKey,
      rollbackOnFailure: options.rollbackOnFailure,
      executedSteps: steps.length,
      errorCount,
      actorId,
      sourceSurface,
      steps,
      createdAtMs: startedAtMs,
    };

    const persisted = await repository.updatePlaybookRun(run);
    if (!persisted) {
      await repository.createPlaybookRun(run);
    }
    await queue.enqueue(
      queueJob(
        run.status === 'blocked'
          ? 'autopilot-run-blocked'
          : 'autopilot-run-completed',
        {
          scope: 'playbook',
          runId: run.id,
          playbookId,
          status: run.status,
          errorCount: run.errorCount,
        },
      ),
    );
    await queue.enqueue(
      queueJob('workflow.playbook.run', {
        runId: run.id,
        playbookId,
        chain,
        executionMode: run.executionMode,
        guardrailProfile: run.guardrailProfile,
        status: run.status,
        rollbackEligible: run.rollbackEligible,
        rollbackWindowUntilMs: run.rollbackWindowUntilMs,
        idempotencyKey: run.idempotencyKey,
        actorId,
        sourceSurface,
        errorCount: run.errorCount,
      }),
    );

    await deps.appendOpsActivityEvent(toPlaybookRunActivity(run));

    if (
      run.status === 'failed' &&
      run.executionMode === 'live' &&
      run.rollbackOnFailure &&
      run.rollbackEligible
    ) {
      await deps.rollbackPlaybookRun({
        runId: run.id,
        reason: 'rollback-on-failure',
        actorId,
        sourceSurface,
      });
    }

    return run;
  }

  async function replayPlaybookRun(input: {
    runId: string;
    executionMode?: ExecutionMode;
    guardrailProfile?: GuardrailProfile;
    rollbackWindowMinutes?: number;
    idempotencyKey?: string;
    rollbackOnFailure?: boolean;
    actorId?: string;
    sourceSurface?: string;
  }): Promise<PlaybookRun | null> {
    const previousRun = await repository.getPlaybookRunById(input.runId);
    if (!previousRun) {
      return null;
    }

    return runPlaybook(
      previousRun.playbookId,
      {
        executionMode: input.executionMode || previousRun.executionMode,
        guardrailProfile:
          input.guardrailProfile || previousRun.guardrailProfile,
        rollbackWindowMinutes:
          typeof input.rollbackWindowMinutes === 'number'
            ? input.rollbackWindowMinutes
            : previousRun.rollbackWindowUntilMs && previousRun.startedAtMs
              ? Math.max(
                  1,
                  Math.trunc(
                    (previousRun.rollbackWindowUntilMs -
                      previousRun.startedAtMs) /
                      60_000,
                  ),
                )
              : 60,
        idempotencyKey: input.idempotencyKey,
        rollbackOnFailure:
          typeof input.rollbackOnFailure === 'boolean'
            ? input.rollbackOnFailure
            : previousRun.rollbackOnFailure,
      },
      input.actorId || previousRun.actorId,
      input.sourceSurface || previousRun.sourceSurface,
    );
  }

  async function runCloseRoutine(
    period: 'weekly' | 'monthly',
  ): Promise<CloseRun> {
    const state = await repository.getOpsState();
    const run: CloseRun = {
      id: nanoid(),
      period,
      exceptionCount: state.pendingReviews + state.expiringContracts,
      summary: {
        pendingReviews: state.pendingReviews,
        urgentReviews: state.urgentReviews,
        expiringContracts: state.expiringContracts,
      },
      createdAtMs: Date.now(),
    };

    await repository.createCloseRun(run);
    await queue.enqueue(
      queueJob('workflow.close.run', {
        runId: run.id,
        period,
        exceptionCount: run.exceptionCount,
      }),
    );

    await deps.appendOpsActivityEvent(toCloseRunActivity(run));

    return run;
  }

  async function listCloseRuns(
    limit = 20,
    filters?: {
      period?: CloseRun['period'];
      hasExceptions?: boolean;
    },
  ) {
    return repository.listCloseRuns(Math.max(1, Math.min(limit, 200)), filters);
  }

  async function applyBatchPolicy(
    ids: string[],
    status: string,
    resolvedAction: string,
  ): Promise<{ updatedCount: number }> {
    const state = await repository.getOpsState();
    const updatedCount = Math.min(ids.length, state.pendingReviews);

    await repository.setOpsState({
      pendingReviews: Math.max(0, state.pendingReviews - updatedCount),
    });

    await queue.enqueue(
      queueJob('workflow.batch-policy.applied', {
        ids,
        status,
        resolvedAction,
        updatedCount,
      }),
    );

    return { updatedCount };
  }

  return {
    listPlaybooks,
    listPlaybookRuns,
    createPlaybook,
    runPlaybook,
    replayPlaybookRun,
    runCloseRoutine,
    listCloseRuns,
    applyBatchPolicy,
  };
}

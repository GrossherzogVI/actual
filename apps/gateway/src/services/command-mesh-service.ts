import { parseCommandChain } from '@finance-os/domain-kernel';

import type { GatewayQueue } from '../queue/types';
import type { GatewayRepository } from '../repositories/types';
import type {
  CloseRun,
  DelegateLane,
  DelegateLaneEvent,
  EffectSummary,
  ExecutionMode,
  OpsActivityEvent,
  PlaybookRun,
  RunStatus,
  RunStatusTransition,
  WorkflowAction,
  WorkflowCommandExecution,
  WorkflowCommandExecutionStep,
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
  isLaneStaleForEscalation,
  isTerminalStatus,
  nanoid,
  normalizeExecutionOptions,
  queueJob,
  statusSeverity,
  toCommandRunActivity,
} from './helpers';

export type CommandMeshDeps = {
  appendOpsActivityEvent: (event: OpsActivityEvent) => Promise<void>;
  resolveNextAction: () => Promise<WorkflowAction>;
  getMoneyPulse: () => Promise<unknown>;
  runCloseRoutine: (period: 'weekly' | 'monthly') => Promise<CloseRun>;
  applyBatchPolicy: (
    ids: string[],
    status: string,
    resolvedAction: string,
  ) => Promise<{ updatedCount: number }>;
  createPlaybook: (input: {
    name: string;
    description: string;
    commands: Array<Record<string, unknown>>;
  }) => Promise<WorkflowPlaybook>;
  listPlaybooks: () => Promise<WorkflowPlaybook[]>;
  runPlaybook: (
    playbookId: string,
    optionsInput?: ExecutionOptionsInput,
    actorId?: string,
    sourceSurface?: string,
  ) => Promise<PlaybookRun | null>;
  assignDelegateLane: (input: {
    title: string;
    assignee: string;
    assignedBy: string;
    actorId?: string;
    priority?: DelegateLane['priority'];
    payload: Record<string, unknown>;
  }) => Promise<DelegateLane>;
  commentDelegateLane: (input: {
    laneId: string;
    actorId: string;
    message: string;
    payload?: Record<string, unknown>;
  }) => Promise<DelegateLaneEvent | null>;
  rollbackCommandRun: (input: {
    runId: string;
    reason?: string;
    actorId?: string;
    sourceSurface?: string;
  }) => Promise<WorkflowCommandExecution | null>;
};

export function createCommandMeshService(
  repository: GatewayRepository,
  queue: GatewayQueue,
  deps: CommandMeshDeps,
) {
  async function listWorkflowCommandRuns(
    limit = 20,
    filters?: {
      actorId?: string;
      sourceSurface?: string;
      executionMode?: ExecutionMode;
      status?: RunStatus;
      idempotencyKey?: string;
      hasErrors?: boolean;
    },
  ) {
    return repository.listWorkflowCommandRuns(
      Math.max(1, Math.min(limit, 200)),
      filters,
    );
  }

  async function listWorkflowCommandRunsByIds(
    runIds: string[],
  ): Promise<WorkflowCommandExecution[]> {
    const normalized = Array.from(
      new Set(
        runIds.map(runId => runId.trim()).filter(runId => runId.length > 0),
      ),
    ).slice(0, 200);

    if (normalized.length === 0) {
      return [];
    }

    const runs = await Promise.all(
      normalized.map(runId => repository.getWorkflowCommandRunById(runId)),
    );

    return runs
      .filter((run): run is WorkflowCommandExecution => !!run)
      .sort((a, b) => b.startedAtMs - a.startedAtMs);
  }

  async function executeWorkflowCommandChain(input: {
    chain: string;
    assignee?: string;
    options?: ExecutionOptionsInput;
    actorId?: string;
    sourceSurface?: string;
    persist?: boolean;
  }): Promise<WorkflowCommandExecution> {
    const actorId = input.actorId || 'owner';
    const sourceSurface = input.sourceSurface || 'unknown';
    const options = normalizeExecutionOptions(input.options, 'live');
    if (options.idempotencyKey) {
      const existing = await repository.findRunByIdempotencyKey(
        'command',
        options.idempotencyKey,
      );
      if (
        existing &&
        !('playbookId' in existing) &&
        isTerminalStatus(existing.status)
      ) {
        return existing;
      }
    }

    const parsed = parseCommandChain(input.chain);
    const steps: WorkflowCommandExecutionStep[] = [];
    const prefix = options.executionMode === 'dry-run' ? '[dry-run] ' : '';
    const startedAtMs = Date.now();
    const runId = nanoid();
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
    const effectSummaries: EffectSummary[] = [];

    const plannedStatusTimeline: RunStatusTransition[] = [
      { status: 'planned', atMs: startedAtMs, note: 'Execution accepted.' },
    ];
    const runningStatusTimeline: RunStatusTransition[] = [
      ...plannedStatusTimeline,
      { status: 'running', atMs: startedAtMs + 1, note: 'Execution started.' },
    ];

    if (input.persist !== false) {
      const inFlightRunBase: WorkflowCommandExecution = {
        id: runId,
        chain: input.chain,
        steps: [],
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
        errorCount: 0,
        actorId,
        sourceSurface,
        executedAtMs: startedAtMs,
      };

      await repository.createWorkflowCommandRun(inFlightRunBase);
      await repository.updateWorkflowCommandRun({
        ...inFlightRunBase,
        status: 'running',
        statusTimeline: runningStatusTimeline,
      });
      await queue.enqueue(
        queueJob('autopilot-run-started', {
          scope: 'command',
          runId,
          actorId,
          sourceSurface,
          executionMode: options.executionMode,
          guardrailProfile: options.guardrailProfile,
        }),
      );
    }

    for (const error of parsed.errors) {
      steps.push({
        id: 'command-parse-error',
        raw: error.raw || 'command',
        canonical: '',
        status: 'error',
        detail:
          error.code === 'empty-command'
            ? 'Command chain is empty.'
            : `Unknown command token at position ${error.index + 1}.`,
      });
    }

    if (shouldBlock) {
      steps.push({
        id: 'guardrail-block',
        raw: input.chain,
        canonical: 'guardrail-block',
        status: 'error',
        detail: 'Blocked by guardrail policy.',
      });
    } else {
      for (let index = 0; index < parsed.steps.length; index += 1) {
        const step = parsed.steps[index]!;
        let result: WorkflowCommandExecutionStep;

        if (step.id === 'resolve-next-action') {
          const action = await deps.resolveNextAction();
          result = {
            id: step.id,
            raw: step.raw,
            canonical: step.canonical,
            status: 'ok',
            detail: `${prefix}${action.title}`,
            route: action.route,
          };
        } else if (step.id === 'run-close-weekly') {
          if (options.executionMode === 'dry-run') {
            result = {
              id: step.id,
              raw: step.raw,
              canonical: step.canonical,
              status: 'ok',
              detail: `${prefix}Would run weekly close routine.`,
            };
          } else {
            const run = await deps.runCloseRoutine('weekly');
            result = {
              id: step.id,
              raw: step.raw,
              canonical: step.canonical,
              status: 'ok',
              detail: `${prefix}Weekly close run ${run.id} (${run.exceptionCount} exceptions).`,
            };
          }
        } else if (step.id === 'run-close-monthly') {
          if (options.executionMode === 'dry-run') {
            result = {
              id: step.id,
              raw: step.raw,
              canonical: step.canonical,
              status: 'ok',
              detail: `${prefix}Would run monthly close routine.`,
            };
          } else {
            const run = await deps.runCloseRoutine('monthly');
            result = {
              id: step.id,
              raw: step.raw,
              canonical: step.canonical,
              status: 'ok',
              detail: `${prefix}Monthly close run ${run.id} (${run.exceptionCount} exceptions).`,
            };
          }
        } else if (step.id === 'run-close-safe') {
          if (options.executionMode === 'dry-run') {
            result = {
              id: step.id,
              raw: step.raw,
              canonical: step.canonical,
              status: 'ok',
              detail: `${prefix}Would run safe close routine with guardrail checks.`,
            };
          } else {
            const latestState = await repository.getOpsState();
            if (latestState.urgentReviews > 5) {
              result = {
                id: step.id,
                raw: step.raw,
                canonical: step.canonical,
                status: 'error',
                detail: 'Safe close blocked due to urgent review pressure.',
              };
            } else {
              const run = await deps.runCloseRoutine('weekly');
              result = {
                id: step.id,
                raw: step.raw,
                canonical: step.canonical,
                status: 'ok',
                detail: `${prefix}Safe close run ${run.id} completed.`,
              };
            }
          }
        } else if (step.id === 'create-default-playbook') {
          if (options.executionMode === 'dry-run') {
            result = {
              id: step.id,
              raw: step.raw,
              canonical: step.canonical,
              status: 'ok',
              detail: `${prefix}Would create default weekly triage playbook.`,
            };
          } else {
            const playbook = await deps.createPlaybook({
              name: 'Weekly Triage Autopilot',
              description: 'Created from command chain executor.',
              commands: [
                { verb: 'resolve-next-action', lane: 'triage' },
                { verb: 'open-expiring-contracts', window_days: 30 },
                { verb: 'run-close', period: 'weekly' },
              ],
            });
            result = {
              id: step.id,
              raw: step.raw,
              canonical: step.canonical,
              status: 'ok',
              detail: `${prefix}Created playbook ${playbook.name}.`,
            };
          }
        } else if (step.id === 'run-first-playbook') {
          const first = (await deps.listPlaybooks())[0];
          if (!first) {
            result = {
              id: step.id,
              raw: step.raw,
              canonical: step.canonical,
              status: 'error',
              detail: `${prefix}No playbook available to run.`,
            };
          } else if (options.executionMode === 'dry-run') {
            result = {
              id: step.id,
              raw: step.raw,
              canonical: step.canonical,
              status: 'ok',
              detail: `${prefix}Would run playbook ${first.name}.`,
            };
          } else {
            const run = await deps.runPlaybook(
              first.id,
              {
                ...options,
                executionMode: 'live',
                idempotencyKey: undefined,
              },
              actorId,
              sourceSurface,
            );
            if (!run) {
              result = {
                id: step.id,
                raw: step.raw,
                canonical: step.canonical,
                status: 'error',
                detail: `${prefix}Playbook ${first.id} not found.`,
              };
            } else {
              result = {
                id: step.id,
                raw: step.raw,
                canonical: step.canonical,
                status: run.errorCount > 0 ? 'error' : 'ok',
                detail: `${prefix}Playbook run ${run.id} (${run.executedSteps} steps).`,
              };
            }
          }
        } else if (step.id === 'open-expiring-contracts') {
          result = {
            id: step.id,
            raw: step.raw,
            canonical: step.canonical,
            status: 'ok',
            detail: `${prefix}Opened expiring contracts lane.`,
            route: '/contracts?filter=expiring',
          };
        } else if (step.id === 'assign-expiring-contracts-lane') {
          if (options.executionMode === 'dry-run') {
            result = {
              id: step.id,
              raw: step.raw,
              canonical: step.canonical,
              status: 'ok',
              detail: `${prefix}Would assign expiring-contract renegotiation lane.`,
            };
          } else {
            const lane = await deps.assignDelegateLane({
              title: 'Renegotiate expiring contracts',
              assignee: input.assignee || 'delegate',
              assignedBy: 'owner',
              actorId,
              priority: 'high',
              payload: {
                source: 'workflow.execute-chain',
              },
            });
            result = {
              id: step.id,
              raw: step.raw,
              canonical: step.canonical,
              status: 'ok',
              detail: `${prefix}Assigned lane ${lane.title}.`,
            };
          }
        } else if (step.id === 'delegate-triage-batch') {
          if (options.executionMode === 'dry-run') {
            result = {
              id: step.id,
              raw: step.raw,
              canonical: step.canonical,
              status: 'ok',
              detail: `${prefix}Would assign delegate triage batch lane.`,
            };
          } else {
            const lane = await deps.assignDelegateLane({
              title: 'Delegate triage batch',
              assignee: input.assignee || 'delegate',
              assignedBy: 'owner',
              actorId,
              priority: 'normal',
              payload: {
                source: 'workflow.delegate-triage-batch',
              },
            });
            result = {
              id: step.id,
              raw: step.raw,
              canonical: step.canonical,
              status: 'ok',
              detail: `${prefix}Assigned lane ${lane.id}.`,
            };
          }
        } else if (step.id === 'escalate-stale-lanes') {
          const now = Date.now();
          const staleLanes = (
            await repository.listDelegateLanes(500, {
              status: 'assigned',
            })
          ).filter(lane => isLaneStaleForEscalation(lane, now));

          if (options.executionMode === 'dry-run') {
            result = {
              id: step.id,
              raw: step.raw,
              canonical: step.canonical,
              status: 'ok',
              detail: `${prefix}Would escalate ${staleLanes.length} stale lane(s).`,
            };
          } else {
            for (const lane of staleLanes.slice(0, 25)) {
              await deps.commentDelegateLane({
                laneId: lane.id,
                actorId,
                message:
                  'Autopilot escalation: lane stale for >48h. Please acknowledge or complete.',
                payload: {
                  source: 'workflow.escalate-stale-lanes',
                  staleHours: Math.round(
                    (now - lane.updatedAtMs) / (60 * 60 * 1000),
                  ),
                },
              });
            }
            result = {
              id: step.id,
              raw: step.raw,
              canonical: step.canonical,
              status: 'ok',
              detail: `${prefix}Escalated ${staleLanes.length} stale lane(s).`,
            };
          }
        } else if (step.id === 'open-urgent-review') {
          result = {
            id: step.id,
            raw: step.raw,
            canonical: step.canonical,
            status: 'ok',
            detail: `${prefix}Opened urgent review lane.`,
            route: '/review?priority=urgent',
          };
        } else if (step.id === 'apply-batch-policy') {
          if (options.executionMode === 'dry-run') {
            result = {
              id: step.id,
              raw: step.raw,
              canonical: step.canonical,
              status: 'ok',
              detail: `${prefix}Would apply batch policy to pending reviews.`,
            };
          } else {
            const currentState = await repository.getOpsState();
            const ids = Array.from(
              { length: Math.max(1, Math.min(5, currentState.pendingReviews)) },
              (_, itemIndex) => `review-${itemIndex + 1}`,
            );
            const applied = await deps.applyBatchPolicy(
              ids,
              'accepted',
              'batch-policy',
            );
            result = {
              id: step.id,
              raw: step.raw,
              canonical: step.canonical,
              status: 'ok',
              detail: `${prefix}Applied batch policy to ${applied.updatedCount} item(s).`,
            };
          }
        } else {
          await deps.getMoneyPulse();
          result = {
            id: step.id,
            raw: step.raw,
            canonical: step.canonical,
            status: 'ok',
            detail: `${prefix}Refreshed command center data.`,
          };
        }

        steps.push(result);
        effectSummaries.push(
          buildStepEffectSummary({
            effectId: `command-effect-${index + 1}`,
            stepId: step.id,
            detail: result.detail,
            mode: options.executionMode,
            stepStatus: result.status,
          }),
        );
      }
    }

    const finishedAtMs = Date.now();
    const errorCount = steps.filter(step => step.status === 'error').length;
    const status: RunStatus = shouldBlock
      ? 'blocked'
      : errorCount > 0
        ? 'failed'
        : 'completed';
    const rollbackEligible =
      options.executionMode === 'live' &&
      isRollbackSourceStatus(status) &&
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

    const run: WorkflowCommandExecution = {
      id: runId,
      chain: input.chain,
      steps,
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
      errorCount,
      actorId,
      sourceSurface,
      executedAtMs: startedAtMs,
    };

    if (input.persist !== false) {
      const persisted = await repository.updateWorkflowCommandRun(run);
      if (!persisted) {
        await repository.createWorkflowCommandRun(run);
      }
      await queue.enqueue(
        queueJob(
          run.status === 'blocked'
            ? 'autopilot-run-blocked'
            : 'autopilot-run-completed',
          {
            scope: 'command',
            runId: run.id,
            status: run.status,
            errorCount: run.errorCount,
          },
        ),
      );
      await deps.appendOpsActivityEvent(toCommandRunActivity(run));
      await deps.appendOpsActivityEvent({
        id: `autopilot-command-${run.id}-${run.status}`,
        kind: 'workflow-command-run',
        title: `autopilot-run-${run.status}`,
        detail: `${run.chain} (${run.executionMode})`,
        route: '/ops#command-mesh',
        severity: statusSeverity(run.status),
        createdAtMs: finishedAtMs,
        meta: {
          runId: run.id,
          status: run.status,
          guardrailResults: run.guardrailResults,
          rollbackEligible: run.rollbackEligible,
        },
      });

      if (
        run.status === 'failed' &&
        run.executionMode === 'live' &&
        run.rollbackOnFailure &&
        run.rollbackEligible
      ) {
        await deps.rollbackCommandRun({
          runId: run.id,
          reason: 'rollback-on-failure',
          actorId,
          sourceSurface,
        });
      }
    }

    return run;
  }

  return {
    listWorkflowCommandRuns,
    listWorkflowCommandRunsByIds,
    executeWorkflowCommandChain,
  };
}

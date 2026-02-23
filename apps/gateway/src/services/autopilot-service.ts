import type { GatewayQueue } from '../queue/types';
import type { GatewayRepository } from '../repositories/types';
import type {
  OpsActivityEvent,
  PlaybookRun,
  WorkflowCommandExecution,
} from '../types';

import { toRollbackEffectSummaries } from './autopilot/effects';
import { isRollbackSourceStatus } from './autopilot/status';
import {
  createTerminalStatusTimeline,
  nanoid,
  queueJob,
  toCommandRunActivity,
  toPlaybookRunActivity,
} from './helpers';

export type AutopilotDeps = {
  appendOpsActivityEvent: (event: OpsActivityEvent) => Promise<void>;
};

export function createAutopilotService(
  repository: GatewayRepository,
  queue: GatewayQueue,
  deps: AutopilotDeps,
) {
  async function rollbackCommandRun(input: {
    runId: string;
    reason?: string;
    actorId?: string;
    sourceSurface?: string;
  }): Promise<WorkflowCommandExecution | null> {
    const run = await repository.getWorkflowCommandRunById(input.runId);
    if (!run) {
      return null;
    }
    if (!isRollbackSourceStatus(run.status)) {
      throw new Error('run-status-not-rollbackable');
    }
    if (!run.rollbackEligible) {
      throw new Error('run-not-rollback-eligible');
    }
    if (
      typeof run.rollbackWindowUntilMs !== 'number' ||
      Date.now() > run.rollbackWindowUntilMs
    ) {
      throw new Error('rollback-window-expired');
    }

    const now = Date.now();
    const rollbackRun: WorkflowCommandExecution = {
      id: nanoid(),
      chain: `rollback:${run.id}`,
      steps: run.steps
        .slice()
        .reverse()
        .map(step => ({
          ...step,
          detail: `Rollback: ${step.detail}`,
          status: 'ok',
        })),
      executionMode: 'live',
      guardrailProfile: 'off',
      status: 'completed',
      startedAtMs: now,
      finishedAtMs: now,
      rollbackWindowUntilMs: undefined,
      rollbackEligible: false,
      rollbackOfRunId: run.id,
      statusTimeline: createTerminalStatusTimeline({
        status: 'completed',
        startedAtMs: now,
        finishedAtMs: now,
        note: `Rollback applied for run ${run.id}.`,
      }),
      guardrailResults: [],
      effectSummaries: toRollbackEffectSummaries(run.effectSummaries),
      idempotencyKey: undefined,
      rollbackOnFailure: false,
      errorCount: 0,
      actorId: input.actorId || 'owner',
      sourceSurface: input.sourceSurface || 'unknown',
      executedAtMs: now,
    };

    await repository.createWorkflowCommandRun(rollbackRun);
    await repository.markWorkflowCommandRunRolledBack(
      run.id,
      now,
      rollbackRun.id,
    );
    await queue.enqueue(
      queueJob('autopilot-run-rolled-back', {
        scope: 'command',
        runId: run.id,
        rollbackRunId: rollbackRun.id,
        reason: input.reason || 'manual',
      }),
    );
    await deps.appendOpsActivityEvent(toCommandRunActivity(rollbackRun));
    return rollbackRun;
  }

  async function rollbackPlaybookRun(input: {
    runId: string;
    reason?: string;
    actorId?: string;
    sourceSurface?: string;
  }): Promise<PlaybookRun | null> {
    const run = await repository.getPlaybookRunById(input.runId);
    if (!run) {
      return null;
    }
    if (!isRollbackSourceStatus(run.status)) {
      throw new Error('run-status-not-rollbackable');
    }
    if (!run.rollbackEligible) {
      throw new Error('run-not-rollback-eligible');
    }
    if (
      typeof run.rollbackWindowUntilMs !== 'number' ||
      Date.now() > run.rollbackWindowUntilMs
    ) {
      throw new Error('rollback-window-expired');
    }

    const now = Date.now();
    const rollbackRun: PlaybookRun = {
      id: nanoid(),
      playbookId: run.playbookId,
      chain: `rollback:${run.id}`,
      executionMode: 'live',
      guardrailProfile: 'off',
      status: 'completed',
      startedAtMs: now,
      finishedAtMs: now,
      rollbackWindowUntilMs: undefined,
      rollbackEligible: false,
      rollbackOfRunId: run.id,
      statusTimeline: createTerminalStatusTimeline({
        status: 'completed',
        startedAtMs: now,
        finishedAtMs: now,
        note: `Rollback applied for run ${run.id}.`,
      }),
      guardrailResults: [],
      effectSummaries: toRollbackEffectSummaries(run.effectSummaries),
      idempotencyKey: undefined,
      rollbackOnFailure: false,
      executedSteps: run.executedSteps,
      errorCount: 0,
      actorId: input.actorId || 'owner',
      sourceSurface: input.sourceSurface || 'unknown',
      steps: run.steps.map(step => ({
        ...step,
        status: 'ok',
        detail: `Rollback: ${step.detail || 'step reverted'}`,
      })),
      createdAtMs: now,
    };

    await repository.createPlaybookRun(rollbackRun);
    await repository.markPlaybookRunRolledBack(run.id, now, rollbackRun.id);
    await queue.enqueue(
      queueJob('autopilot-run-rolled-back', {
        scope: 'playbook',
        runId: run.id,
        rollbackRunId: rollbackRun.id,
        reason: input.reason || 'manual',
      }),
    );
    await deps.appendOpsActivityEvent(toPlaybookRunActivity(rollbackRun));
    return rollbackRun;
  }

  return {
    rollbackCommandRun,
    rollbackPlaybookRun,
  };
}

import type { GatewayRepository } from '../repositories/types';
import type {
  OpsActivityEvent,
  OpsActivityListResult,
  OpsActivityPipelineStartResult,
  OpsActivityPipelineStatus,
} from '../types';

import {
  OPS_ACTIVITY_BACKFILL_LEASE_KEY,
  OPS_ACTIVITY_MAINTENANCE_LEASE_KEY,
  OPS_ACTIVITY_PIPELINE_LEASE_KEY,
  OPS_ACTIVITY_PIPELINE_LEASE_TTL_MS,
  beginOpsTask,
  cloneOpsTaskStatus,
  createEmptyOpsTaskStatus,
  decodeOpsActivityCursor,
  encodeOpsActivityCursor,
  failOpsTask,
  finishOpsTask,
  nanoid,
  toActionOutcomeActivity,
  toCloseRunActivity,
  toCommandRunActivity,
  toDelegateLaneEventActivity,
  toPlaybookRunActivity,
  toPolicyActivity,
  toScenarioAdoptionActivity,
} from './helpers';

export function createOpsActivityService(repository: GatewayRepository) {
  const pipelineLeaseOwnerId = `gateway-${nanoid()}`;
  const opsActivityPipelineState: OpsActivityPipelineStatus = {
    orchestrator: createEmptyOpsTaskStatus(),
    backfill: createEmptyOpsTaskStatus(),
    maintenance: createEmptyOpsTaskStatus(),
  };

  function snapshotOpsActivityPipelineStatus(): OpsActivityPipelineStatus {
    return {
      orchestrator: cloneOpsTaskStatus(opsActivityPipelineState.orchestrator),
      backfill: cloneOpsTaskStatus(opsActivityPipelineState.backfill),
      maintenance: cloneOpsTaskStatus(opsActivityPipelineState.maintenance),
    };
  }

  async function appendOpsActivityEvent(event: OpsActivityEvent) {
    await repository.appendOpsActivityEvent(event);
  }

  async function listOpsActivity(input?: {
    limit?: number;
    kinds?: OpsActivityEvent['kind'][];
    severities?: OpsActivityEvent['severity'][];
    cursor?: string;
  }): Promise<OpsActivityListResult> {
    const limit = Math.max(1, Math.min(input?.limit ?? 60, 250));
    const cursor = decodeOpsActivityCursor(input?.cursor);
    const fetched = await repository.listOpsActivityEvents(limit + 1, {
      kinds: input?.kinds,
      severities: input?.severities,
      cursor: cursor || undefined,
    });
    const eventsPage = fetched.slice(0, limit);
    const hasMore = fetched.length > limit;
    const last = eventsPage[eventsPage.length - 1];

    return {
      events: eventsPage,
      nextCursor:
        hasMore && last
          ? encodeOpsActivityCursor({
              createdAtMs: last.createdAtMs,
              id: last.id,
            })
          : undefined,
    };
  }

  async function backfillOpsActivity(input?: {
    limitPerPlane?: number;
  }): Promise<{ attempted: number; total: number }> {
    if (opsActivityPipelineState.backfill.running) {
      throw new Error('ops-activity-backfill-running');
    }
    const leaseAcquired = await repository.acquireSystemLease({
      leaseKey: OPS_ACTIVITY_BACKFILL_LEASE_KEY,
      ownerId: pipelineLeaseOwnerId,
      ttlMs: OPS_ACTIVITY_PIPELINE_LEASE_TTL_MS,
    });
    if (!leaseAcquired) {
      throw new Error('ops-activity-backfill-running');
    }
    beginOpsTask(opsActivityPipelineState.backfill);

    const limitPerPlane = Math.max(
      1,
      Math.min(input?.limitPerPlane ?? 500, 5_000),
    );
    let attempted = 0;
    try {
      const commandRuns =
        await repository.listWorkflowCommandRuns(limitPerPlane);
      for (const run of commandRuns) {
        await appendOpsActivityEvent(toCommandRunActivity(run));
        attempted += 1;
      }

      const playbookRuns = await repository.listPlaybookRuns(limitPerPlane);
      for (const run of playbookRuns) {
        await appendOpsActivityEvent(toPlaybookRunActivity(run));
        attempted += 1;
      }

      const closeRuns = await repository.listCloseRuns(limitPerPlane);
      for (const run of closeRuns) {
        await appendOpsActivityEvent(toCloseRunActivity(run));
        attempted += 1;
      }

      const outcomes = await repository.listActionOutcomes({
        limit: limitPerPlane,
      });
      for (const outcome of outcomes) {
        await appendOpsActivityEvent(toActionOutcomeActivity(outcome));
        attempted += 1;
      }

      const lanes = await repository.listDelegateLanes(limitPerPlane);
      for (const lane of lanes) {
        const laneEvents = await repository.listDelegateLaneEvents(
          lane.id,
          limitPerPlane,
        );
        for (const laneEvent of laneEvents) {
          await appendOpsActivityEvent(
            toDelegateLaneEventActivity(lane, laneEvent),
          );
          attempted += 1;
        }
      }

      const branches = await repository.listScenarioBranches();
      for (const branch of branches) {
        if (branch.status !== 'adopted') {
          continue;
        }
        await appendOpsActivityEvent(toScenarioAdoptionActivity(branch));
        attempted += 1;
      }

      const egressAudit = await repository.listEgressAudit(limitPerPlane);
      for (const entry of egressAudit) {
        await appendOpsActivityEvent(toPolicyActivity(entry));
        attempted += 1;
      }

      const total = await repository.countOpsActivityEvents();
      finishOpsTask(opsActivityPipelineState.backfill, {
        attempted,
        total,
      });
      return {
        attempted,
        total,
      };
    } catch (error) {
      failOpsTask(opsActivityPipelineState.backfill, error);
      throw error;
    } finally {
      try {
        await repository.releaseSystemLease({
          leaseKey: OPS_ACTIVITY_BACKFILL_LEASE_KEY,
          ownerId: pipelineLeaseOwnerId,
        });
      } catch {
        // best-effort lease release for backfill.
      }
    }
  }

  async function runOpsActivityMaintenance(input?: {
    retentionDays?: number;
    maxRows?: number;
  }): Promise<{
    removed: number;
    total: number;
    removedWorkerJobAttempts: number;
    totalWorkerJobAttempts: number;
    removedWorkerDeadLetters: number;
    totalWorkerDeadLetters: number;
    removedWorkerFingerprintClaimEvents: number;
    totalWorkerFingerprintClaimEvents: number;
  }> {
    if (opsActivityPipelineState.maintenance.running) {
      throw new Error('ops-activity-maintenance-running');
    }
    const leaseAcquired = await repository.acquireSystemLease({
      leaseKey: OPS_ACTIVITY_MAINTENANCE_LEASE_KEY,
      ownerId: pipelineLeaseOwnerId,
      ttlMs: OPS_ACTIVITY_PIPELINE_LEASE_TTL_MS,
    });
    if (!leaseAcquired) {
      throw new Error('ops-activity-maintenance-running');
    }
    beginOpsTask(opsActivityPipelineState.maintenance);

    const maxRows =
      typeof input?.maxRows === 'number' && Number.isFinite(input.maxRows)
        ? Math.max(0, Math.trunc(input.maxRows))
        : undefined;
    const retentionDays =
      typeof input?.retentionDays === 'number' &&
      Number.isFinite(input.retentionDays)
        ? Math.max(0, input.retentionDays)
        : undefined;
    const olderThanMs =
      typeof retentionDays === 'number'
        ? Date.now() - Math.floor(retentionDays * 24 * 60 * 60 * 1000)
        : undefined;
    try {
      const [
        removed,
        removedWorkerJobAttempts,
        removedWorkerDeadLetters,
        removedWorkerFingerprintClaimEvents,
      ] = await Promise.all([
        repository.trimOpsActivityEvents({
          maxRows,
          olderThanMs,
        }),
        repository.trimWorkerJobAttempts({
          maxRows,
          olderThanMs,
        }),
        repository.trimWorkerDeadLetters({
          maxRows,
          olderThanMs,
        }),
        repository.trimWorkerFingerprintClaimEvents({
          maxRows,
          olderThanMs,
        }),
      ]);
      const [
        total,
        totalWorkerJobAttempts,
        totalWorkerDeadLetters,
        totalWorkerFingerprintClaimEvents,
      ] = await Promise.all([
        repository.countOpsActivityEvents(),
        repository.countWorkerJobAttempts(),
        repository.countWorkerDeadLetters(),
        repository.countWorkerFingerprintClaimEvents(),
      ]);
      finishOpsTask(opsActivityPipelineState.maintenance, {
        removed,
        total,
        removedWorkerJobAttempts,
        totalWorkerJobAttempts,
        removedWorkerDeadLetters,
        totalWorkerDeadLetters,
        removedWorkerFingerprintClaimEvents,
        totalWorkerFingerprintClaimEvents,
      });
      return {
        removed,
        total,
        removedWorkerJobAttempts,
        totalWorkerJobAttempts,
        removedWorkerDeadLetters,
        totalWorkerDeadLetters,
        removedWorkerFingerprintClaimEvents,
        totalWorkerFingerprintClaimEvents,
      };
    } catch (error) {
      failOpsTask(opsActivityPipelineState.maintenance, error);
      throw error;
    } finally {
      try {
        await repository.releaseSystemLease({
          leaseKey: OPS_ACTIVITY_MAINTENANCE_LEASE_KEY,
          ownerId: pipelineLeaseOwnerId,
        });
      } catch {
        // best-effort lease release for maintenance.
      }
    }
  }

  async function getOpsActivityPipelineStatus(): Promise<OpsActivityPipelineStatus> {
    return snapshotOpsActivityPipelineStatus();
  }

  async function startOpsActivityPipeline(input?: {
    runBackfill?: boolean;
    runMaintenance?: boolean;
    limitPerPlane?: number;
    retentionDays?: number;
    maxRows?: number;
    waitForCompletion?: boolean;
  }): Promise<OpsActivityPipelineStartResult> {
    if (opsActivityPipelineState.orchestrator.running) {
      return {
        started: false,
        status: snapshotOpsActivityPipelineStatus(),
      };
    }

    const leaseAcquired = await repository.acquireSystemLease({
      leaseKey: OPS_ACTIVITY_PIPELINE_LEASE_KEY,
      ownerId: pipelineLeaseOwnerId,
      ttlMs: OPS_ACTIVITY_PIPELINE_LEASE_TTL_MS,
    });
    if (!leaseAcquired) {
      return {
        started: false,
        status: snapshotOpsActivityPipelineStatus(),
      };
    }

    beginOpsTask(opsActivityPipelineState.orchestrator);
    const runBackfill = input?.runBackfill !== false;
    const runMaintenance = input?.runMaintenance !== false;

    const execute = async () => {
      try {
        if (runBackfill) {
          await backfillOpsActivity({
            limitPerPlane: input?.limitPerPlane,
          });
        }
        if (runMaintenance) {
          await runOpsActivityMaintenance({
            retentionDays: input?.retentionDays,
            maxRows: input?.maxRows,
          });
        }
        const total = await repository.countOpsActivityEvents();
        finishOpsTask(opsActivityPipelineState.orchestrator, {
          total,
        });
      } catch (error) {
        failOpsTask(opsActivityPipelineState.orchestrator, error);
      } finally {
        try {
          await repository.releaseSystemLease({
            leaseKey: OPS_ACTIVITY_PIPELINE_LEASE_KEY,
            ownerId: pipelineLeaseOwnerId,
          });
        } catch {
          // lease release failure should not crash orchestrator lifecycle.
        }
      }
    };

    if (input?.waitForCompletion) {
      await execute();
    } else {
      void execute();
    }

    return {
      started: true,
      status: snapshotOpsActivityPipelineStatus(),
    };
  }

  return {
    appendOpsActivityEvent,
    listOpsActivity,
    backfillOpsActivity,
    runOpsActivityMaintenance,
    getOpsActivityPipelineStatus,
    startOpsActivityPipeline,
  };
}

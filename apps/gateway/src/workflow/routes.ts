import { commandEnvelopeSchema } from '@finance-os/domain-kernel';
import type { FastifyInstance } from 'fastify';
import * as z from 'zod';

import {
  parseRequestBody,
  sendConflict,
  sendNotFound,
  sendUnauthorized,
} from '../http/route-utils';
import type { GatewayService } from '../services/gateway-service';

type RequestLike = { body?: unknown };
type QueryLike = { query?: Record<string, unknown> };
type HeaderLike = { headers?: Record<string, unknown> };

const opsActivityKinds = [
  'workflow-command-run',
  'workflow-playbook-run',
  'workflow-close-run',
  'focus-action-outcome',
  'scenario-adoption',
  'delegate-lane',
  'policy-egress',
] as const;

const opsActivitySeverities = ['info', 'warn', 'critical'] as const;
const executionModes = ['dry-run', 'live'] as const;
const guardrailProfiles = ['strict', 'balanced', 'off'] as const;
const runStatuses = [
  'planned',
  'running',
  'completed',
  'failed',
  'blocked',
  'rolled_back',
] as const;

const executionOptionsSchema = z.object({
  executionMode: z.enum(executionModes),
  guardrailProfile: z.enum(guardrailProfiles).default('strict'),
  rollbackWindowMinutes: z.number().int().min(1).max(1440).default(60),
  idempotencyKey: z.string().min(8).max(128).optional(),
  rollbackOnFailure: z.boolean().default(false),
});

function parseCsvList(value: unknown): string[] {
  if (typeof value !== 'string' || value.trim() === '') {
    return [];
  }
  return value
    .split(',')
    .map(token => token.trim())
    .filter(token => token.length > 0);
}

function hasValidInternalToken(request: HeaderLike, token?: string): boolean {
  if (!token) {
    return true;
  }

  const value = request.headers?.['x-finance-internal-token'];
  if (typeof value === 'string') {
    return value === token;
  }
  if (Array.isArray(value)) {
    return value.includes(token);
  }
  return false;
}

export const workflowSchemas = {
  createPlaybook: z.object({
    name: z.string().min(1),
    description: z.string().default(''),
    commands: z.array(z.record(z.string(), z.unknown())).default([]),
  }),
  resolveNextAction: z.object({
    envelope: commandEnvelopeSchema,
  }),
  getNarrativePulse: z.object({
    workspaceId: z.string().optional(),
  }),
  runPlaybook: z.object({
    envelope: commandEnvelopeSchema,
    playbookId: z.string().min(1),
    ...executionOptionsSchema.shape,
  }),
  listPlaybookRuns: z.object({
    limit: z.number().int().min(1).max(200).default(20),
    playbookId: z.string().min(1).optional(),
    actorId: z.string().min(1).optional(),
    sourceSurface: z.string().min(1).optional(),
    executionMode: z.enum(executionModes).optional(),
    status: z.enum(runStatuses).optional(),
    idempotencyKey: z.string().min(8).max(128).optional(),
    hasErrors: z.boolean().optional(),
  }),
  replayPlaybookRun: z.object({
    envelope: commandEnvelopeSchema,
    runId: z.string().min(1),
    executionMode: z.enum(executionModes).optional(),
    guardrailProfile: z.enum(guardrailProfiles).optional(),
    rollbackWindowMinutes: z.number().int().min(1).max(1440).optional(),
    idempotencyKey: z.string().min(8).max(128).optional(),
    rollbackOnFailure: z.boolean().optional(),
  }),
  runCloseRoutine: z.object({
    envelope: commandEnvelopeSchema,
    period: z.enum(['weekly', 'monthly']),
  }),
  listCloseRuns: z.object({
    limit: z.number().int().min(1).max(200).default(20),
    period: z.enum(['weekly', 'monthly']).optional(),
    hasExceptions: z.boolean().optional(),
  }),
  applyBatchPolicy: z.object({
    envelope: commandEnvelopeSchema,
    ids: z.array(z.string().min(1)).min(1),
    status: z.string().min(1),
    resolvedAction: z.string().default('batch-policy'),
  }),
  executeChain: z.object({
    envelope: commandEnvelopeSchema,
    chain: z.string().min(1),
    assignee: z.string().min(1).optional(),
    ...executionOptionsSchema.shape,
    executionMode: z.enum(executionModes).default('live'),
  }),
  rollbackPlaybookRun: z.object({
    envelope: commandEnvelopeSchema,
    runId: z.string().min(1),
    reason: z.string().max(512).optional(),
  }),
  rollbackCommandRun: z.object({
    envelope: commandEnvelopeSchema,
    runId: z.string().min(1),
    reason: z.string().max(512).optional(),
  }),
  listCommandRuns: z.object({
    limit: z.number().int().min(1).max(200).default(20),
    actorId: z.string().min(1).optional(),
    sourceSurface: z.string().min(1).optional(),
    executionMode: z.enum(executionModes).optional(),
    status: z.enum(runStatuses).optional(),
    idempotencyKey: z.string().min(8).max(128).optional(),
    hasErrors: z.boolean().optional(),
  }),
  listCommandRunsByIds: z.object({
    runIds: z.array(z.string().min(1)).min(1).max(200),
  }),
  listOpsActivity: z.object({
    limit: z.number().int().min(1).max(250).default(60),
    kinds: z.array(z.enum(opsActivityKinds)).default([]),
    severities: z.array(z.enum(opsActivitySeverities)).default([]),
    cursor: z.string().min(1).optional(),
  }),
  backfillOpsActivity: z.object({
    limitPerPlane: z.number().int().min(1).max(5000).default(500),
  }),
  runOpsActivityMaintenance: z.object({
    retentionDays: z.number().min(0).default(90),
    maxRows: z.number().int().min(0).default(50000),
  }),
  startOpsActivityPipeline: z.object({
    runBackfill: z.boolean().default(true),
    runMaintenance: z.boolean().default(true),
    limitPerPlane: z.number().int().min(1).max(5000).default(500),
    retentionDays: z.number().min(0).default(90),
    maxRows: z.number().int().min(0).default(50000),
    waitForCompletion: z.boolean().default(false),
  }),
  claimQueueJobs: z.object({
    workerId: z.string().min(1).default('worker'),
    maxJobs: z.number().int().min(1).max(200).default(25),
    visibilityTimeoutMs: z
      .number()
      .int()
      .min(1000)
      .max(600_000)
      .default(60_000),
  }),
  claimWorkerJobFingerprint: z.object({
    workerId: z.string().min(1).default('worker'),
    fingerprint: z.string().min(1),
    ttlMs: z.number().int().min(1000).max(600_000).default(60_000),
  }),
  ackQueueJob: z.object({
    workerId: z.string().min(1).default('worker'),
    receipt: z.string().min(1),
    success: z.boolean().default(true),
    requeue: z.boolean().default(true),
    jobId: z.string().min(1).optional(),
    jobName: z.string().min(1).optional(),
    jobFingerprint: z.string().min(1).optional(),
    attempt: z.number().int().min(1).optional(),
    processingMs: z.number().int().min(0).optional(),
    errorMessage: z.string().min(1).optional(),
    payload: z.record(z.string(), z.unknown()).optional(),
  }),
  checkWorkerJobFingerprint: z.object({
    fingerprint: z.string().min(1),
  }),
  requeueExpiredQueueJobs: z.object({
    limit: z.number().int().min(1).max(1000).default(100),
  }),
  listWorkerDeadLetters: z.object({
    limit: z.number().int().min(1).max(200).default(50),
    status: z.enum(['open', 'replayed', 'resolved']).optional(),
    workerId: z.string().min(1).optional(),
    jobName: z.string().min(1).optional(),
  }),
  replayWorkerDeadLetters: z.object({
    deadLetterIds: z.array(z.string().min(1)).max(100).optional(),
    limit: z.number().int().min(1).max(100).default(20),
    maxAttempt: z.number().int().min(1).max(20).default(6),
    jobName: z.string().min(1).optional(),
    operatorId: z.string().min(1).default('operator-replay'),
  }),
  resolveWorkerDeadLetter: z.object({
    deadLetterId: z.string().min(1),
    operatorId: z.string().min(1).default('operator'),
    resolutionNote: z.string().min(1).optional(),
  }),
  reopenWorkerDeadLetter: z.object({
    deadLetterId: z.string().min(1),
    operatorId: z.string().min(1).default('operator'),
    note: z.string().min(1).optional(),
  }),
  workerQueueHealth: z.object({
    windowMs: z.number().int().min(60_000).max(604_800_000).default(3_600_000),
    sampleLimit: z.number().int().min(1).max(20_000).default(5000),
    workerId: z.string().min(1).optional(),
    jobName: z.string().min(1).optional(),
  }),
  acquireWorkerQueueLease: z.object({
    workerId: z.string().min(1),
    ttlMs: z.number().int().min(1000).max(300_000).default(15_000),
    leaseKey: z.string().min(1).default('worker-queue-drain'),
  }),
  releaseWorkerQueueLease: z.object({
    workerId: z.string().min(1),
    leaseKey: z.string().min(1).default('worker-queue-drain'),
  }),
};

export async function registerWorkflowRoutes(
  app: FastifyInstance,
  service: GatewayService,
  options?: {
    internalToken?: string;
  },
) {
  app.get('/money-pulse', async () => {
    return service.getMoneyPulse();
  });

  app.get('/narrative-pulse', async () => {
    return service.getNarrativePulse();
  });

  app.get('/runtime-metrics', async () => {
    return service.getRuntimeMetrics();
  });

  app.get('/ops-activity-pipeline-status', async () => {
    return service.getOpsActivityPipelineStatus();
  });

  app.post('/get-narrative-pulse', async (request, reply) => {
    const payload = parseRequestBody(
      workflowSchemas.getNarrativePulse,
      (request as RequestLike).body || {},
      reply,
    );
    if (!payload) return;
    return service.getNarrativePulse();
  });

  app.get('/close-runs', async request => {
    const query = ((request as QueryLike).query || {}) as Record<
      string,
      unknown
    >;
    const parsed = workflowSchemas.listCloseRuns.safeParse({
      limit:
        typeof query.limit === 'string'
          ? Number(query.limit)
          : typeof query.limit === 'number'
            ? query.limit
            : 20,
      period: typeof query.period === 'string' ? query.period : undefined,
      hasExceptions:
        typeof query.hasExceptions === 'string'
          ? query.hasExceptions === 'true'
          : typeof query.hasExceptions === 'boolean'
            ? query.hasExceptions
            : undefined,
    });
    if (!parsed.success) {
      return service.listCloseRuns(20);
    }
    return service.listCloseRuns(parsed.data.limit, {
      period: parsed.data.period,
      hasExceptions: parsed.data.hasExceptions,
    });
  });

  app.post('/list-close-runs', async (request, reply) => {
    const payload = parseRequestBody(
      workflowSchemas.listCloseRuns,
      (request as RequestLike).body,
      reply,
    );
    if (!payload) return;
    return service.listCloseRuns(payload.limit, {
      period: payload.period,
      hasExceptions: payload.hasExceptions,
    });
  });

  app.post('/resolve-next-action', async (request, reply) => {
    const payload = parseRequestBody(
      workflowSchemas.resolveNextAction,
      (request as RequestLike).body,
      reply,
    );
    if (!payload) return;

    return service.resolveNextAction();
  });

  app.get('/playbooks', async () => {
    return service.listPlaybooks();
  });

  app.get('/playbook-runs', async request => {
    const query = ((request as QueryLike).query || {}) as Record<
      string,
      unknown
    >;
    const parsed = workflowSchemas.listPlaybookRuns.safeParse({
      limit:
        typeof query.limit === 'string'
          ? Number(query.limit)
          : typeof query.limit === 'number'
            ? query.limit
            : 20,
      playbookId:
        typeof query.playbookId === 'string' && query.playbookId.trim()
          ? query.playbookId.trim()
          : undefined,
      actorId:
        typeof query.actorId === 'string' && query.actorId.trim()
          ? query.actorId.trim()
          : undefined,
      sourceSurface:
        typeof query.sourceSurface === 'string' && query.sourceSurface.trim()
          ? query.sourceSurface.trim()
          : undefined,
      executionMode:
        typeof query.executionMode === 'string' && query.executionMode.trim()
          ? query.executionMode.trim()
          : undefined,
      status:
        typeof query.status === 'string' && query.status.trim()
          ? query.status.trim()
          : undefined,
      idempotencyKey:
        typeof query.idempotencyKey === 'string' && query.idempotencyKey.trim()
          ? query.idempotencyKey.trim()
          : undefined,
      hasErrors:
        typeof query.hasErrors === 'string'
          ? query.hasErrors === 'true'
          : typeof query.hasErrors === 'boolean'
            ? query.hasErrors
            : undefined,
    });

    if (!parsed.success) {
      return service.listPlaybookRuns(20);
    }

    return service.listPlaybookRuns(parsed.data.limit, {
      playbookId: parsed.data.playbookId,
      actorId: parsed.data.actorId,
      sourceSurface: parsed.data.sourceSurface,
      executionMode: parsed.data.executionMode,
      status: parsed.data.status,
      idempotencyKey: parsed.data.idempotencyKey,
      hasErrors: parsed.data.hasErrors,
    });
  });

  app.post('/list-playbook-runs', async (request, reply) => {
    const payload = parseRequestBody(
      workflowSchemas.listPlaybookRuns,
      (request as RequestLike).body,
      reply,
    );
    if (!payload) return;
    return service.listPlaybookRuns(payload.limit, {
      playbookId: payload.playbookId,
      actorId: payload.actorId,
      sourceSurface: payload.sourceSurface,
      executionMode: payload.executionMode,
      status: payload.status,
      idempotencyKey: payload.idempotencyKey,
      hasErrors: payload.hasErrors,
    });
  });

  app.get('/command-runs', async request => {
    const query = ((request as QueryLike).query || {}) as Record<
      string,
      unknown
    >;
    const parsed = workflowSchemas.listCommandRuns.safeParse({
      limit:
        typeof query.limit === 'string'
          ? Number(query.limit)
          : typeof query.limit === 'number'
            ? query.limit
            : 20,
      actorId:
        typeof query.actorId === 'string' && query.actorId.trim()
          ? query.actorId.trim()
          : undefined,
      sourceSurface:
        typeof query.sourceSurface === 'string' && query.sourceSurface.trim()
          ? query.sourceSurface.trim()
          : undefined,
      executionMode:
        typeof query.executionMode === 'string' && query.executionMode.trim()
          ? query.executionMode.trim()
          : undefined,
      status:
        typeof query.status === 'string' && query.status.trim()
          ? query.status.trim()
          : undefined,
      idempotencyKey:
        typeof query.idempotencyKey === 'string' && query.idempotencyKey.trim()
          ? query.idempotencyKey.trim()
          : undefined,
      hasErrors:
        typeof query.hasErrors === 'string'
          ? query.hasErrors === 'true'
          : typeof query.hasErrors === 'boolean'
            ? query.hasErrors
            : undefined,
    });

    if (!parsed.success) {
      return service.listWorkflowCommandRuns(20);
    }

    return service.listWorkflowCommandRuns(parsed.data.limit, {
      actorId: parsed.data.actorId,
      sourceSurface: parsed.data.sourceSurface,
      executionMode: parsed.data.executionMode,
      status: parsed.data.status,
      idempotencyKey: parsed.data.idempotencyKey,
      hasErrors: parsed.data.hasErrors,
    });
  });

  app.get('/ops-activity', async request => {
    const query = ((request as QueryLike).query || {}) as Record<
      string,
      unknown
    >;
    const parsed = workflowSchemas.listOpsActivity.safeParse({
      limit:
        typeof query.limit === 'string'
          ? Number(query.limit)
          : typeof query.limit === 'number'
            ? query.limit
            : 60,
      kinds: parseCsvList(query.kinds),
      severities: parseCsvList(query.severities),
      cursor:
        typeof query.cursor === 'string' && query.cursor.trim()
          ? query.cursor.trim()
          : undefined,
    });

    if (!parsed.success) {
      return service.listOpsActivity({ limit: 60 });
    }

    return service.listOpsActivity({
      limit: parsed.data.limit,
      kinds: parsed.data.kinds,
      severities: parsed.data.severities,
      cursor: parsed.data.cursor,
    });
  });

  app.post('/list-command-runs', async (request, reply) => {
    const payload = parseRequestBody(
      workflowSchemas.listCommandRuns,
      (request as RequestLike).body,
      reply,
    );
    if (!payload) return;
    return service.listWorkflowCommandRuns(payload.limit, {
      actorId: payload.actorId,
      sourceSurface: payload.sourceSurface,
      executionMode: payload.executionMode,
      status: payload.status,
      idempotencyKey: payload.idempotencyKey,
      hasErrors: payload.hasErrors,
    });
  });

  app.post('/list-command-runs-by-ids', async (request, reply) => {
    const payload = parseRequestBody(
      workflowSchemas.listCommandRunsByIds,
      (request as RequestLike).body,
      reply,
    );
    if (!payload) return;
    return service.listWorkflowCommandRunsByIds(payload.runIds);
  });

  app.post('/list-ops-activity', async (request, reply) => {
    const payload = parseRequestBody(
      workflowSchemas.listOpsActivity,
      (request as RequestLike).body,
      reply,
    );
    if (!payload) return;
    return service.listOpsActivity({
      limit: payload.limit,
      kinds: payload.kinds,
      severities: payload.severities,
      cursor: payload.cursor,
    });
  });

  app.post('/backfill-ops-activity', async (request, reply) => {
    const payload = parseRequestBody(
      workflowSchemas.backfillOpsActivity,
      (request as RequestLike).body,
      reply,
    );
    if (!payload) return;
    try {
      return await service.backfillOpsActivity({
        limitPerPlane: payload.limitPerPlane,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('ops-activity-backfill-running')) {
        return sendConflict(reply, 'ops-activity-backfill-running');
      }
      throw error;
    }
  });

  app.post('/run-ops-activity-maintenance', async (request, reply) => {
    const payload = parseRequestBody(
      workflowSchemas.runOpsActivityMaintenance,
      (request as RequestLike).body,
      reply,
    );
    if (!payload) return;
    try {
      return await service.runOpsActivityMaintenance({
        retentionDays: payload.retentionDays,
        maxRows: payload.maxRows,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('ops-activity-maintenance-running')) {
        return sendConflict(reply, 'ops-activity-maintenance-running');
      }
      throw error;
    }
  });

  app.post('/start-ops-activity-pipeline', async (request, reply) => {
    const payload = parseRequestBody(
      workflowSchemas.startOpsActivityPipeline,
      (request as RequestLike).body,
      reply,
    );
    if (!payload) return;
    const started = await service.startOpsActivityPipeline(payload);
    if (!started.started) {
      return sendConflict(reply, 'ops-activity-pipeline-running');
    }
    return started;
  });

  app.post('/claim-queue-jobs', async (request, reply) => {
    if (!hasValidInternalToken(request as HeaderLike, options?.internalToken)) {
      return sendUnauthorized(reply, 'invalid-internal-token');
    }

    const payload = parseRequestBody(
      workflowSchemas.claimQueueJobs,
      (request as RequestLike).body || {},
      reply,
    );
    if (!payload) return;

    return service.claimQueueJobs({
      maxJobs: payload.maxJobs,
      visibilityTimeoutMs: payload.visibilityTimeoutMs,
    });
  });

  app.post('/claim-worker-job-fingerprint', async (request, reply) => {
    if (!hasValidInternalToken(request as HeaderLike, options?.internalToken)) {
      return sendUnauthorized(reply, 'invalid-internal-token');
    }

    const payload = parseRequestBody(
      workflowSchemas.claimWorkerJobFingerprint,
      (request as RequestLike).body,
      reply,
    );
    if (!payload) return;

    return service.claimWorkerJobFingerprint({
      workerId: payload.workerId,
      fingerprint: payload.fingerprint,
      ttlMs: payload.ttlMs,
    });
  });

  app.post('/ack-queue-job', async (request, reply) => {
    if (!hasValidInternalToken(request as HeaderLike, options?.internalToken)) {
      return sendUnauthorized(reply, 'invalid-internal-token');
    }

    const payload = parseRequestBody(
      workflowSchemas.ackQueueJob,
      (request as RequestLike).body,
      reply,
    );
    if (!payload) return;

    return service.ackQueueJob({
      workerId: payload.workerId,
      receipt: payload.receipt,
      success: payload.success,
      requeue: payload.requeue,
      jobId: payload.jobId,
      jobName: payload.jobName,
      jobFingerprint: payload.jobFingerprint,
      attempt: payload.attempt,
      processingMs: payload.processingMs,
      errorMessage: payload.errorMessage,
      payload: payload.payload,
    });
  });

  app.post('/check-worker-job-fingerprint', async (request, reply) => {
    if (!hasValidInternalToken(request as HeaderLike, options?.internalToken)) {
      return sendUnauthorized(reply, 'invalid-internal-token');
    }

    const payload = parseRequestBody(
      workflowSchemas.checkWorkerJobFingerprint,
      (request as RequestLike).body,
      reply,
    );
    if (!payload) return;

    return service.checkWorkerJobFingerprint({
      fingerprint: payload.fingerprint,
    });
  });

  app.post('/requeue-expired-queue-jobs', async (request, reply) => {
    if (!hasValidInternalToken(request as HeaderLike, options?.internalToken)) {
      return sendUnauthorized(reply, 'invalid-internal-token');
    }

    const payload = parseRequestBody(
      workflowSchemas.requeueExpiredQueueJobs,
      (request as RequestLike).body || {},
      reply,
    );
    if (!payload) return;

    return service.requeueExpiredQueueJobs({
      limit: payload.limit,
    });
  });

  app.post('/list-worker-dead-letters', async (request, reply) => {
    if (!hasValidInternalToken(request as HeaderLike, options?.internalToken)) {
      return sendUnauthorized(reply, 'invalid-internal-token');
    }

    const payload = parseRequestBody(
      workflowSchemas.listWorkerDeadLetters,
      (request as RequestLike).body || {},
      reply,
    );
    if (!payload) return;

    return service.listWorkerDeadLetters({
      limit: payload.limit,
      status: payload.status,
      workerId: payload.workerId,
      jobName: payload.jobName,
    });
  });

  app.post('/replay-worker-dead-letters', async (request, reply) => {
    if (!hasValidInternalToken(request as HeaderLike, options?.internalToken)) {
      return sendUnauthorized(reply, 'invalid-internal-token');
    }

    const payload = parseRequestBody(
      workflowSchemas.replayWorkerDeadLetters,
      (request as RequestLike).body || {},
      reply,
    );
    if (!payload) return;

    return service.replayWorkerDeadLetters({
      deadLetterIds: payload.deadLetterIds,
      limit: payload.limit,
      maxAttempt: payload.maxAttempt,
      jobName: payload.jobName,
      operatorId: payload.operatorId,
    });
  });

  app.post('/resolve-worker-dead-letter', async (request, reply) => {
    if (!hasValidInternalToken(request as HeaderLike, options?.internalToken)) {
      return sendUnauthorized(reply, 'invalid-internal-token');
    }

    const payload = parseRequestBody(
      workflowSchemas.resolveWorkerDeadLetter,
      (request as RequestLike).body,
      reply,
    );
    if (!payload) return;

    const resolved = await service.resolveWorkerDeadLetter(payload);
    if (!resolved) {
      return sendNotFound(reply, 'worker-dead-letter-not-found');
    }
    return resolved;
  });

  app.post('/reopen-worker-dead-letter', async (request, reply) => {
    if (!hasValidInternalToken(request as HeaderLike, options?.internalToken)) {
      return sendUnauthorized(reply, 'invalid-internal-token');
    }

    const payload = parseRequestBody(
      workflowSchemas.reopenWorkerDeadLetter,
      (request as RequestLike).body,
      reply,
    );
    if (!payload) return;

    const reopened = await service.reopenWorkerDeadLetter(payload);
    if (!reopened) {
      return sendNotFound(reply, 'worker-dead-letter-not-found');
    }
    return reopened;
  });

  app.post('/worker-queue-health', async (request, reply) => {
    if (!hasValidInternalToken(request as HeaderLike, options?.internalToken)) {
      return sendUnauthorized(reply, 'invalid-internal-token');
    }

    const payload = parseRequestBody(
      workflowSchemas.workerQueueHealth,
      (request as RequestLike).body || {},
      reply,
    );
    if (!payload) return;

    return service.getWorkerQueueHealth({
      windowMs: payload.windowMs,
      sampleLimit: payload.sampleLimit,
      workerId: payload.workerId,
      jobName: payload.jobName,
    });
  });

  app.post('/acquire-worker-queue-lease', async (request, reply) => {
    if (!hasValidInternalToken(request as HeaderLike, options?.internalToken)) {
      return sendUnauthorized(reply, 'invalid-internal-token');
    }

    const payload = parseRequestBody(
      workflowSchemas.acquireWorkerQueueLease,
      (request as RequestLike).body,
      reply,
    );
    if (!payload) return;

    return service.acquireWorkerQueueLease({
      workerId: payload.workerId,
      ttlMs: payload.ttlMs,
      leaseKey: payload.leaseKey,
    });
  });

  app.post('/release-worker-queue-lease', async (request, reply) => {
    if (!hasValidInternalToken(request as HeaderLike, options?.internalToken)) {
      return sendUnauthorized(reply, 'invalid-internal-token');
    }

    const payload = parseRequestBody(
      workflowSchemas.releaseWorkerQueueLease,
      (request as RequestLike).body,
      reply,
    );
    if (!payload) return;

    return service.releaseWorkerQueueLease({
      workerId: payload.workerId,
      leaseKey: payload.leaseKey,
    });
  });

  app.post('/playbooks', async (request, reply) => {
    const payload = parseRequestBody(
      workflowSchemas.createPlaybook,
      (request as RequestLike).body,
      reply,
    );
    if (!payload) return;
    return service.createPlaybook(payload);
  });

  app.post('/run-playbook', async (request, reply) => {
    const payload = parseRequestBody(
      workflowSchemas.runPlaybook,
      (request as RequestLike).body,
      reply,
    );
    if (!payload) return;

    const run = await service.runPlaybook(
      payload.playbookId,
      {
        executionMode: payload.executionMode,
        guardrailProfile: payload.guardrailProfile,
        rollbackWindowMinutes: payload.rollbackWindowMinutes,
        idempotencyKey: payload.idempotencyKey,
        rollbackOnFailure: payload.rollbackOnFailure,
      },
      payload.envelope.actorId,
      payload.envelope.sourceSurface,
    );
    if (!run) {
      return sendNotFound(reply, 'playbook-not-found');
    }

    return run;
  });

  app.post('/replay-playbook-run', async (request, reply) => {
    const payload = parseRequestBody(
      workflowSchemas.replayPlaybookRun,
      (request as RequestLike).body,
      reply,
    );
    if (!payload) return;

    const run = await service.replayPlaybookRun({
      runId: payload.runId,
      executionMode: payload.executionMode,
      guardrailProfile: payload.guardrailProfile,
      rollbackWindowMinutes: payload.rollbackWindowMinutes,
      idempotencyKey: payload.idempotencyKey,
      rollbackOnFailure: payload.rollbackOnFailure,
      actorId: payload.envelope.actorId,
      sourceSurface: payload.envelope.sourceSurface,
    });
    if (!run) {
      return sendNotFound(reply, 'run-not-found');
    }
    return run;
  });

  app.post('/run-close-routine', async (request, reply) => {
    const payload = parseRequestBody(
      workflowSchemas.runCloseRoutine,
      (request as RequestLike).body,
      reply,
    );
    if (!payload) return;
    return service.runCloseRoutine(payload.period);
  });

  app.post('/apply-batch-policy', async (request, reply) => {
    const payload = parseRequestBody(
      workflowSchemas.applyBatchPolicy,
      (request as RequestLike).body,
      reply,
    );
    if (!payload) return;

    return service.applyBatchPolicy(
      payload.ids,
      payload.status,
      payload.resolvedAction,
    );
  });

  app.post('/execute-chain', async (request, reply) => {
    const payload = parseRequestBody(
      workflowSchemas.executeChain,
      (request as RequestLike).body,
      reply,
    );
    if (!payload) return;

    return service.executeWorkflowCommandChain({
      chain: payload.chain,
      assignee: payload.assignee,
      options: {
        executionMode: payload.executionMode,
        guardrailProfile: payload.guardrailProfile,
        rollbackWindowMinutes: payload.rollbackWindowMinutes,
        idempotencyKey: payload.idempotencyKey,
        rollbackOnFailure: payload.rollbackOnFailure,
      },
      actorId: payload.envelope.actorId,
      sourceSurface: payload.envelope.sourceSurface,
    });
  });

  app.post('/rollback-playbook-run', async (request, reply) => {
    const payload = parseRequestBody(
      workflowSchemas.rollbackPlaybookRun,
      (request as RequestLike).body,
      reply,
    );
    if (!payload) return;

    try {
      const rollbackRun = await service.rollbackPlaybookRun({
        runId: payload.runId,
        reason: payload.reason,
        actorId: payload.envelope.actorId,
        sourceSurface: payload.envelope.sourceSurface,
      });
      if (!rollbackRun) {
        return sendNotFound(reply, 'run-not-found');
      }
      return rollbackRun;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.includes('run-status-not-rollbackable') ||
        message.includes('run-not-rollback-eligible') ||
        message.includes('rollback-window-expired')
      ) {
        return sendConflict(reply, message);
      }
      throw error;
    }
  });

  app.post('/rollback-command-run', async (request, reply) => {
    const payload = parseRequestBody(
      workflowSchemas.rollbackCommandRun,
      (request as RequestLike).body,
      reply,
    );
    if (!payload) return;

    try {
      const rollbackRun = await service.rollbackCommandRun({
        runId: payload.runId,
        reason: payload.reason,
        actorId: payload.envelope.actorId,
        sourceSurface: payload.envelope.sourceSurface,
      });
      if (!rollbackRun) {
        return sendNotFound(reply, 'run-not-found');
      }
      return rollbackRun;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.includes('run-status-not-rollbackable') ||
        message.includes('run-not-rollback-eligible') ||
        message.includes('rollback-window-expired')
      ) {
        return sendConflict(reply, message);
      }
      throw error;
    }
  });
}

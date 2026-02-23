import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { commandEnvelopeSchema } from '@finance-os/domain-kernel';

import { parseRequestBody, sendNotFound } from '../http/route-utils';
import type { GatewayService } from '../services/gateway-service';

type RequestLike = { body?: unknown };
type QueryLike = { query?: Record<string, unknown> };

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
    dryRun: z.boolean().default(true),
  }),
  listPlaybookRuns: z.object({
    limit: z.number().int().min(1).max(200).default(20),
    playbookId: z.string().min(1).optional(),
    actorId: z.string().min(1).optional(),
    sourceSurface: z.string().min(1).optional(),
    dryRun: z.boolean().optional(),
    hasErrors: z.boolean().optional(),
  }),
  replayPlaybookRun: z.object({
    envelope: commandEnvelopeSchema,
    runId: z.string().min(1),
    dryRun: z.boolean().optional(),
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
    dryRun: z.boolean().default(false),
  }),
  listCommandRuns: z.object({
    limit: z.number().int().min(1).max(200).default(20),
    actorId: z.string().min(1).optional(),
    sourceSurface: z.string().min(1).optional(),
    dryRun: z.boolean().optional(),
    hasErrors: z.boolean().optional(),
  }),
};

export async function registerWorkflowRoutes(
  app: FastifyInstance,
  service: GatewayService,
) {
  app.get('/money-pulse', async () => {
    return service.getMoneyPulse();
  });

  app.get('/narrative-pulse', async () => {
    return service.getNarrativePulse();
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
    const query = ((request as QueryLike).query || {}) as Record<string, unknown>;
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
    const query = ((request as QueryLike).query || {}) as Record<string, unknown>;
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
      dryRun:
        typeof query.dryRun === 'string'
          ? query.dryRun === 'true'
          : typeof query.dryRun === 'boolean'
            ? query.dryRun
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
      dryRun: parsed.data.dryRun,
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
      dryRun: payload.dryRun,
      hasErrors: payload.hasErrors,
    });
  });

  app.get('/command-runs', async request => {
    const query = ((request as QueryLike).query || {}) as Record<string, unknown>;
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
      dryRun:
        typeof query.dryRun === 'string'
          ? query.dryRun === 'true'
          : typeof query.dryRun === 'boolean'
            ? query.dryRun
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
      dryRun: parsed.data.dryRun,
      hasErrors: parsed.data.hasErrors,
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
      dryRun: payload.dryRun,
      hasErrors: payload.hasErrors,
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
      payload.dryRun,
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
      dryRun: payload.dryRun,
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
      dryRun: payload.dryRun,
      actorId: payload.envelope.actorId,
      sourceSurface: payload.envelope.sourceSurface,
    });
  });
}

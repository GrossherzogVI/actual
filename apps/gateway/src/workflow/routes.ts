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
  runPlaybook: z.object({
    envelope: commandEnvelopeSchema,
    playbookId: z.string().min(1),
    dryRun: z.boolean().default(true),
  }),
  runCloseRoutine: z.object({
    envelope: commandEnvelopeSchema,
    period: z.enum(['weekly', 'monthly']),
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
  }),
};

export async function registerWorkflowRoutes(
  app: FastifyInstance,
  service: GatewayService,
) {
  app.get('/money-pulse', async () => {
    return service.getMoneyPulse();
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

  app.get('/command-runs', async request => {
    const query = ((request as QueryLike).query || {}) as Record<string, unknown>;
    const limitRaw = query.limit;
    const limit =
      typeof limitRaw === 'string'
        ? Number(limitRaw)
        : typeof limitRaw === 'number'
          ? limitRaw
          : 20;
    return service.listWorkflowCommandRuns(Number.isFinite(limit) ? limit : 20);
  });

  app.post('/list-command-runs', async (request, reply) => {
    const payload = parseRequestBody(
      workflowSchemas.listCommandRuns,
      (request as RequestLike).body,
      reply,
    );
    if (!payload) return;
    return service.listWorkflowCommandRuns(payload.limit);
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

    const run = await service.runPlaybook(payload.playbookId, payload.dryRun);
    if (!run) {
      return sendNotFound(reply, 'playbook-not-found');
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
    });
  });
}

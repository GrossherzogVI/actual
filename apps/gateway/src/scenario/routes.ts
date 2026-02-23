import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { commandEnvelopeSchema } from '@finance-os/domain-kernel';

import { parseRequestBody, sendNotFound } from '../http/route-utils';
import type { GatewayService } from '../services/gateway-service';

type RequestLike = { body?: unknown };

export const scenarioSchemas = {
  createBranch: z.object({
    envelope: commandEnvelopeSchema,
    name: z.string().min(1),
    baseBranchId: z.string().optional(),
    notes: z.string().optional(),
  }),
  applyMutation: z.object({
    envelope: commandEnvelopeSchema,
    branchId: z.string().min(1),
    mutationKind: z.string().min(1),
    payload: z.record(z.string(), z.unknown()),
  }),
  compareOutcomes: z.object({
    branchId: z.string().min(1),
    againstBranchId: z.string().optional(),
  }),
  adoptBranch: z.object({
    envelope: commandEnvelopeSchema,
    branchId: z.string().min(1),
  }),
};

export async function registerScenarioRoutes(
  app: FastifyInstance,
  service: GatewayService,
) {
  app.get('/branches', async () => {
    return service.listScenarioBranches();
  });

  app.post('/create-branch', async (request, reply) => {
    const payload = parseRequestBody(
      scenarioSchemas.createBranch,
      (request as RequestLike).body,
      reply,
    );
    if (!payload) return;
    return service.createScenarioBranch(payload);
  });

  app.post('/apply-mutation', async (request, reply) => {
    const payload = parseRequestBody(
      scenarioSchemas.applyMutation,
      (request as RequestLike).body,
      reply,
    );
    if (!payload) return;
    const mutation = await service.applyScenarioMutation(payload);
    if (!mutation) {
      return sendNotFound(reply, 'branch-not-found');
    }
    return mutation;
  });

  app.post('/compare-outcomes', async (request, reply) => {
    const payload = parseRequestBody(
      scenarioSchemas.compareOutcomes,
      (request as RequestLike).body,
      reply,
    );
    if (!payload) return;
    const comparison = await service.compareScenarioOutcomes(
      payload.branchId,
      payload.againstBranchId,
    );

    if (!comparison) {
      return sendNotFound(reply, 'branch-not-found');
    }

    return comparison;
  });

  app.post('/adopt-branch', async (request, reply) => {
    const payload = parseRequestBody(
      scenarioSchemas.adoptBranch,
      (request as RequestLike).body,
      reply,
    );
    if (!payload) return;
    const branch = await service.adoptScenarioBranch(payload.branchId);
    if (!branch) {
      return sendNotFound(reply, 'branch-not-found');
    }
    return branch;
  });
}

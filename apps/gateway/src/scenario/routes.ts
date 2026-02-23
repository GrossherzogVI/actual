import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { commandEnvelopeSchema } from '@finance-os/domain-kernel';

import { parseRequestBody, sendNotFound } from '../http/route-utils';
import type { GatewayService } from '../services/gateway-service';

type RequestLike = { body?: unknown };
type QueryLike = { query?: Record<string, unknown> };

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
  adoptionCheck: z.object({
    branchId: z.string().min(1),
    againstBranchId: z.string().optional(),
  }),
  adoptBranch: z.object({
    envelope: commandEnvelopeSchema,
    branchId: z.string().min(1),
    force: z.boolean().default(false),
    againstBranchId: z.string().optional(),
  }),
  listMutations: z.object({
    branchId: z.string().min(1),
  }),
  lineage: z.object({
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

  app.get('/mutations', async request => {
    const query = ((request as QueryLike).query || {}) as Record<string, unknown>;
    const parsed = scenarioSchemas.listMutations.safeParse({
      branchId:
        typeof query.branchId === 'string' ? query.branchId : '',
    });
    if (!parsed.success) {
      return [];
    }
    return service.listScenarioMutations(parsed.data.branchId);
  });

  app.post('/list-mutations', async (request, reply) => {
    const payload = parseRequestBody(
      scenarioSchemas.listMutations,
      (request as RequestLike).body,
      reply,
    );
    if (!payload) return;
    return service.listScenarioMutations(payload.branchId);
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

  app.get('/adoption-check', async request => {
    const query = ((request as QueryLike).query || {}) as Record<string, unknown>;
    const parsed = scenarioSchemas.adoptionCheck.safeParse({
      branchId: typeof query.branchId === 'string' ? query.branchId : '',
      againstBranchId:
        typeof query.againstBranchId === 'string' && query.againstBranchId.trim()
          ? query.againstBranchId.trim()
          : undefined,
    });
    if (!parsed.success) {
      return null;
    }
    return service.getScenarioAdoptionCheck(parsed.data);
  });

  app.post('/adoption-check', async (request, reply) => {
    const payload = parseRequestBody(
      scenarioSchemas.adoptionCheck,
      (request as RequestLike).body,
      reply,
    );
    if (!payload) return;
    return service.getScenarioAdoptionCheck(payload);
  });

  app.get('/lineage', async request => {
    const query = ((request as QueryLike).query || {}) as Record<string, unknown>;
    const parsed = scenarioSchemas.lineage.safeParse({
      branchId: typeof query.branchId === 'string' ? query.branchId : '',
    });
    if (!parsed.success) {
      return null;
    }
    return service.getScenarioLineage(parsed.data.branchId);
  });

  app.post('/lineage', async (request, reply) => {
    const payload = parseRequestBody(
      scenarioSchemas.lineage,
      (request as RequestLike).body,
      reply,
    );
    if (!payload) return;
    return service.getScenarioLineage(payload.branchId);
  });

  app.post('/adopt-branch', async (request, reply) => {
    const payload = parseRequestBody(
      scenarioSchemas.adoptBranch,
      (request as RequestLike).body,
      reply,
    );
    if (!payload) return;
    const result = await service.adoptScenarioBranch({
      branchId: payload.branchId,
      force: payload.force,
      actorId: payload.envelope.actorId,
      againstBranchId: payload.againstBranchId,
    });
    if (!result.ok && result.error === 'branch-not-found') {
      return sendNotFound(reply, 'branch-not-found');
    }
    if (!result.ok && result.error === 'adoption-blocked') {
      reply.code(409).send({
        error: 'adoption-blocked',
        check: result.check,
      });
      return;
    }
    return result.branch;
  });
}

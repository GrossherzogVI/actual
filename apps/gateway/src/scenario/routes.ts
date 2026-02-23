import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { commandEnvelopeSchema } from '@finance-os/domain-kernel';

import { gatewayState } from '../state/gateway-state';

const createBranchSchema = z.object({
  envelope: commandEnvelopeSchema,
  name: z.string().min(1),
  baseBranchId: z.string().optional(),
  notes: z.string().optional(),
});

const mutationSchema = z.object({
  envelope: commandEnvelopeSchema,
  branchId: z.string().min(1),
  mutationKind: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
});

const compareSchema = z.object({
  branchId: z.string().min(1),
  againstBranchId: z.string().optional(),
});

const adoptSchema = z.object({
  envelope: commandEnvelopeSchema,
  branchId: z.string().min(1),
});

export async function registerScenarioRoutes(app: FastifyInstance) {
  app.get('/branches', async () => {
    return [...gatewayState.scenarioBranches.values()];
  });

  app.post('/create-branch', async request => {
    const payload = createBranchSchema.parse(request.body);
    return gatewayState.createScenarioBranch(payload);
  });

  app.post('/apply-mutation', async request => {
    const payload = mutationSchema.parse(request.body);
    const mutation = gatewayState.addScenarioMutation({
      branchId: payload.branchId,
      kind: payload.mutationKind,
      payload: payload.payload,
    });

    if (!mutation) {
      return { error: 'branch-not-found' };
    }
    return mutation;
  });

  app.post('/compare-outcomes', async request => {
    const payload = compareSchema.parse(request.body);
    const comparison = gatewayState.compareScenarioOutcomes(
      payload.branchId,
      payload.againstBranchId,
    );
    if (!comparison) {
      return { error: 'branch-not-found' };
    }
    return comparison;
  });

  app.post('/adopt-branch', async request => {
    const payload = adoptSchema.parse(request.body);
    const branch = gatewayState.adoptScenarioBranch(payload.branchId);
    if (!branch) {
      return { error: 'branch-not-found' };
    }
    return branch;
  });
}

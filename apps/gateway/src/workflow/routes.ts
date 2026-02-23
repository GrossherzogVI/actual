import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { commandEnvelopeSchema } from '@finance-os/domain-kernel';

import { gatewayState } from '../state/gateway-state';

const createPlaybookSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(''),
  commands: z.array(z.record(z.string(), z.unknown())).default([]),
});

const runPlaybookSchema = z.object({
  envelope: commandEnvelopeSchema,
  playbookId: z.string().min(1),
  dryRun: z.boolean().default(true),
});

const closeSchema = z.object({
  envelope: commandEnvelopeSchema,
  period: z.enum(['weekly', 'monthly']),
});

const applyBatchPolicySchema = z.object({
  envelope: commandEnvelopeSchema,
  ids: z.array(z.string().min(1)).min(1),
  status: z.string().min(1),
  resolvedAction: z.string().default('batch-policy'),
});

export async function registerWorkflowRoutes(app: FastifyInstance) {
  app.get('/money-pulse', async () => {
    return {
      pendingReviews: gatewayState.pendingReviews,
      urgentReviews: gatewayState.urgentReviews,
      expiringContracts: gatewayState.expiringContracts,
      generatedAtMs: Date.now(),
    };
  });

  app.post('/resolve-next-action', async request => {
    commandEnvelopeSchema.parse((request.body as Record<string, unknown>)?.envelope);
    return gatewayState.resolveNextAction();
  });

  app.get('/playbooks', async () => {
    return gatewayState.listPlaybooks();
  });

  app.post('/playbooks', async request => {
    const payload = createPlaybookSchema.parse(request.body);
    return gatewayState.createPlaybook(payload);
  });

  app.post('/run-playbook', async request => {
    const payload = runPlaybookSchema.parse(request.body);
    const run = gatewayState.runPlaybook(payload.playbookId, payload.dryRun);
    if (!run) {
      return { error: 'playbook-not-found' };
    }
    return run;
  });

  app.post('/run-close-routine', async request => {
    const payload = closeSchema.parse(request.body);
    return gatewayState.runClose(payload.period);
  });

  app.post('/apply-batch-policy', async request => {
    const payload = applyBatchPolicySchema.parse(request.body);
    return gatewayState.applyBatchPolicy(
      payload.ids,
      payload.status,
      payload.resolvedAction,
    );
  });
}

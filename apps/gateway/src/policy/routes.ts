import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { commandEnvelopeSchema } from '@finance-os/domain-kernel';

import { gatewayState } from '../state/gateway-state';

const setPolicySchema = z.object({
  envelope: commandEnvelopeSchema,
  policy: z.object({
    allowCloud: z.boolean(),
    allowedProviders: z.array(z.string()),
    redactionMode: z.enum(['strict', 'balanced', 'off']),
  }),
});

const listAuditSchema = z.object({
  limit: z.number().int().min(1).max(200).default(50),
});

const recordAuditSchema = z.object({
  envelope: commandEnvelopeSchema,
  eventType: z.string().min(1),
  provider: z.string().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export async function registerPolicyRoutes(app: FastifyInstance) {
  app.get('/egress-policy', async () => {
    return gatewayState.egressPolicy;
  });

  app.post('/set-egress-policy', async request => {
    const payload = setPolicySchema.parse(request.body);
    return gatewayState.setEgressPolicy(payload.policy);
  });

  app.post('/list-egress-audit', async request => {
    const payload = listAuditSchema.parse(request.body || {});
    return gatewayState.listEgressAudit(payload.limit);
  });

  app.post('/record-egress-audit', async request => {
    const payload = recordAuditSchema.parse(request.body);
    return gatewayState.recordEgressAudit(payload);
  });
}

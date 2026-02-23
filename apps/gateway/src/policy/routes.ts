import { commandEnvelopeSchema } from '@finance-os/domain-kernel';
import type { FastifyInstance } from 'fastify';
import * as z from 'zod';

import { parseRequestBody } from '../http/route-utils';
import type { GatewayService } from '../services/gateway-service';

type RequestLike = { body?: unknown };

export const policySchemas = {
  setEgressPolicy: z.object({
    envelope: commandEnvelopeSchema,
    policy: z.object({
      allowCloud: z.boolean(),
      allowedProviders: z.array(z.string()),
      redactionMode: z.enum(['strict', 'balanced', 'off']),
    }),
  }),
  listEgressAudit: z.object({
    limit: z.number().int().min(1).max(200).default(50),
  }),
  recordEgressAudit: z.object({
    envelope: commandEnvelopeSchema,
    eventType: z.string().min(1),
    provider: z.string().optional(),
    payload: z.record(z.string(), z.unknown()).optional(),
  }),
};

export async function registerPolicyRoutes(
  app: FastifyInstance,
  service: GatewayService,
) {
  app.get('/egress-policy', async () => {
    return service.getEgressPolicy();
  });

  app.post('/set-egress-policy', async (request, reply) => {
    const payload = parseRequestBody(
      policySchemas.setEgressPolicy,
      (request as RequestLike).body,
      reply,
    );
    if (!payload) return;
    return service.setEgressPolicy(payload.policy);
  });

  app.post('/list-egress-audit', async (request, reply) => {
    const payload = parseRequestBody(
      policySchemas.listEgressAudit,
      (request as RequestLike).body || {},
      reply,
    );
    if (!payload) return;
    return service.listEgressAudit(payload.limit);
  });

  app.post('/record-egress-audit', async (request, reply) => {
    const payload = parseRequestBody(
      policySchemas.recordEgressAudit,
      (request as RequestLike).body,
      reply,
    );
    if (!payload) return;
    return service.recordEgressAudit(payload);
  });
}

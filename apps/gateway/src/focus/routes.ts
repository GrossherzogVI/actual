import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { commandEnvelopeSchema } from '@finance-os/domain-kernel';

import { parseRequestBody } from '../http/route-utils';
import type { GatewayService } from '../services/gateway-service';

type RequestLike = { body?: unknown };

export const focusSchemas = {
  recordActionOutcome: z.object({
    envelope: commandEnvelopeSchema,
    actionId: z.string().min(1),
    outcome: z.string().min(1),
    notes: z.string().optional(),
  }),
};

export async function registerFocusRoutes(
  app: FastifyInstance,
  service: GatewayService,
) {
  app.get('/adaptive-panel', async () => {
    return service.getAdaptiveFocusPanel();
  });

  app.post('/record-action-outcome', async (request, reply) => {
    const payload = parseRequestBody(
      focusSchemas.recordActionOutcome,
      (request as RequestLike).body,
      reply,
    );
    if (!payload) return;

    return service.recordActionOutcome({
      actionId: payload.actionId,
      outcome: payload.outcome,
      notes: payload.notes,
    });
  });
}

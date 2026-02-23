import { commandEnvelopeSchema } from '@finance-os/domain-kernel';
import type { FastifyInstance } from 'fastify';
import * as z from 'zod';

import { parseRequestBody } from '../http/route-utils';
import type { GatewayService } from '../services/gateway-service';

type RequestLike = { body?: unknown };
type QueryLike = { query?: Record<string, unknown> };

export const focusSchemas = {
  recordActionOutcome: z.object({
    envelope: commandEnvelopeSchema,
    actionId: z.string().min(1),
    outcome: z.string().min(1),
    notes: z.string().optional(),
  }),
  listActionOutcomes: z.object({
    limit: z.number().int().min(1).max(200).default(50),
    actionId: z.string().min(1).optional(),
  }),
};

export async function registerFocusRoutes(
  app: FastifyInstance,
  service: GatewayService,
) {
  app.get('/adaptive-panel', async () => {
    return service.getAdaptiveFocusPanel();
  });

  app.get('/action-outcomes', async request => {
    const query = ((request as QueryLike).query || {}) as Record<
      string,
      unknown
    >;
    const parsed = focusSchemas.listActionOutcomes.safeParse({
      limit:
        typeof query.limit === 'string'
          ? Number(query.limit)
          : typeof query.limit === 'number'
            ? query.limit
            : 50,
      actionId:
        typeof query.actionId === 'string' && query.actionId.trim()
          ? query.actionId.trim()
          : undefined,
    });
    if (!parsed.success) {
      return service.listActionOutcomes({ limit: 50 });
    }
    return service.listActionOutcomes(parsed.data);
  });

  app.post('/list-action-outcomes', async (request, reply) => {
    const payload = parseRequestBody(
      focusSchemas.listActionOutcomes,
      (request as RequestLike).body,
      reply,
    );
    if (!payload) return;
    return service.listActionOutcomes(payload);
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

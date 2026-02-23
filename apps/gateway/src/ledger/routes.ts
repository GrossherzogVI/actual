import { commandEnvelopeSchema } from '@finance-os/domain-kernel';
import type { FastifyInstance } from 'fastify';
import * as z from 'zod';

import { parseRequestBody } from '../http/route-utils';
import type { GatewayService } from '../services/gateway-service';

type RequestLike = { body?: unknown };

export const ledgerSchemas = {
  submitCommand: z.object({
    envelope: commandEnvelopeSchema,
    commandType: z.string().min(1),
    aggregateId: z.string().min(1),
    aggregateType: z.string().min(1),
    payload: z.record(z.string(), z.unknown()).default({}),
  }),
  streamEvents: z.object({
    workspaceId: z.string().min(1),
    cursor: z.string().optional(),
    limit: z.number().int().min(1).max(500).default(100),
  }),
  projectionSnapshot: z.object({
    workspaceId: z.string().min(1),
    projectionName: z.string().min(1),
  }),
};

export async function registerLedgerRoutes(
  app: FastifyInstance,
  service: GatewayService,
) {
  app.post('/submit-command', async (request, reply) => {
    const payload = parseRequestBody(
      ledgerSchemas.submitCommand,
      (request as RequestLike).body,
      reply,
    );
    if (!payload) return;

    const event = await service.submitLedgerCommand({
      workspaceId: payload.envelope.workspaceId,
      actorId: payload.envelope.actorId,
      commandType: payload.commandType,
      aggregateId: payload.aggregateId,
      aggregateType: payload.aggregateType,
      payload: payload.payload,
    });

    return {
      eventId: event.eventId,
      committedAtMs: event.occurredAtMs,
    };
  });

  app.post('/stream-events', async (request, reply) => {
    const payload = parseRequestBody(
      ledgerSchemas.streamEvents,
      (request as RequestLike).body,
      reply,
    );
    if (!payload) return;
    return service.streamLedgerEvents({
      workspaceId: payload.workspaceId,
      cursor: payload.cursor,
      limit: payload.limit,
    });
  });

  app.post('/projection-snapshot', async (request, reply) => {
    const payload = parseRequestBody(
      ledgerSchemas.projectionSnapshot,
      (request as RequestLike).body,
      reply,
    );
    if (!payload) return;
    return service.getProjectionSnapshot(payload);
  });
}

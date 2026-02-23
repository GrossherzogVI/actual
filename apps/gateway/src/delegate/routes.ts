import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { commandEnvelopeSchema } from '@finance-os/domain-kernel';

import { parseRequestBody, sendNotFound } from '../http/route-utils';
import type { GatewayService } from '../services/gateway-service';

type RequestLike = { body?: unknown };

export const delegateSchemas = {
  assignLane: z.object({
    envelope: commandEnvelopeSchema,
    title: z.string().min(1),
    assignee: z.string().min(1),
    assignedBy: z.string().min(1),
    payload: z.record(z.string(), z.unknown()).default({}),
  }),
  transitionLane: z.object({
    envelope: commandEnvelopeSchema,
    laneId: z.string().min(1),
  }),
};

export async function registerDelegateRoutes(
  app: FastifyInstance,
  service: GatewayService,
) {
  app.get('/lanes', async () => {
    return service.listDelegateLanes();
  });

  app.post('/assign-lane', async (request, reply) => {
    const payload = parseRequestBody(
      delegateSchemas.assignLane,
      (request as RequestLike).body,
      reply,
    );
    if (!payload) return;
    return service.assignDelegateLane(payload);
  });

  app.post('/accept-lane', async (request, reply) => {
    const payload = parseRequestBody(
      delegateSchemas.transitionLane,
      (request as RequestLike).body,
      reply,
    );
    if (!payload) return;
    const lane = await service.transitionDelegateLane(payload.laneId, 'accepted');
    if (!lane) return sendNotFound(reply, 'lane-not-found');
    return lane;
  });

  app.post('/complete-lane', async (request, reply) => {
    const payload = parseRequestBody(
      delegateSchemas.transitionLane,
      (request as RequestLike).body,
      reply,
    );
    if (!payload) return;
    const lane = await service.transitionDelegateLane(payload.laneId, 'completed');
    if (!lane) return sendNotFound(reply, 'lane-not-found');
    return lane;
  });

  app.post('/reject-lane', async (request, reply) => {
    const payload = parseRequestBody(
      delegateSchemas.transitionLane,
      (request as RequestLike).body,
      reply,
    );
    if (!payload) return;
    const lane = await service.transitionDelegateLane(payload.laneId, 'rejected');
    if (!lane) return sendNotFound(reply, 'lane-not-found');
    return lane;
  });
}

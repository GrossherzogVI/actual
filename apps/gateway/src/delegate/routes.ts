import type { FastifyInstance } from 'fastify';
import * as z from 'zod';

import { commandEnvelopeSchema } from '@finance-os/domain-kernel';

import { parseRequestBody, sendConflict, sendNotFound } from '../http/route-utils';
import type { GatewayService } from '../services/gateway-service';

type RequestLike = { body?: unknown };
type QueryLike = { query?: Record<string, unknown> };

export const delegateSchemas = {
  assignLane: z.object({
    envelope: commandEnvelopeSchema,
    title: z.string().min(1),
    assignee: z.string().min(1),
    assignedBy: z.string().min(1),
    payload: z.record(z.string(), z.unknown()).default({}),
    priority: z.enum(['low', 'normal', 'high', 'critical']).default('normal'),
    dueAtMs: z.number().int().positive().optional(),
  }),
  listLanes: z.object({
    limit: z.number().int().min(1).max(200).default(50),
    status: z.enum(['assigned', 'accepted', 'completed', 'rejected']).optional(),
    assignee: z.string().min(1).optional(),
    assignedBy: z.string().min(1).optional(),
    priority: z.enum(['low', 'normal', 'high', 'critical']).optional(),
  }),
  transitionLane: z.object({
    envelope: commandEnvelopeSchema,
    laneId: z.string().min(1),
    message: z.string().min(1).optional(),
  }),
  commentLane: z.object({
    envelope: commandEnvelopeSchema,
    laneId: z.string().min(1),
    message: z.string().min(1),
    payload: z.record(z.string(), z.unknown()).optional(),
  }),
  listLaneEvents: z.object({
    laneId: z.string().min(1),
    limit: z.number().int().min(1).max(200).default(50),
  }),
};

export async function registerDelegateRoutes(
  app: FastifyInstance,
  service: GatewayService,
) {
  app.get('/lanes', async request => {
    const query = ((request as QueryLike).query || {}) as Record<string, unknown>;
    const parsed = delegateSchemas.listLanes.safeParse({
      limit:
        typeof query.limit === 'string'
          ? Number(query.limit)
          : typeof query.limit === 'number'
            ? query.limit
            : 50,
      status: typeof query.status === 'string' ? query.status : undefined,
      assignee:
        typeof query.assignee === 'string' && query.assignee.trim()
          ? query.assignee.trim()
          : undefined,
      assignedBy:
        typeof query.assignedBy === 'string' && query.assignedBy.trim()
          ? query.assignedBy.trim()
          : undefined,
      priority: typeof query.priority === 'string' ? query.priority : undefined,
    });
    if (!parsed.success) {
      return service.listDelegateLanes();
    }
    return service.listDelegateLanes(parsed.data);
  });

  app.post('/list-lanes', async (request, reply) => {
    const payload = parseRequestBody(
      delegateSchemas.listLanes,
      (request as RequestLike).body,
      reply,
    );
    if (!payload) return;
    return service.listDelegateLanes(payload);
  });

  app.get('/lane-events', async request => {
    const query = ((request as QueryLike).query || {}) as Record<string, unknown>;
    const parsed = delegateSchemas.listLaneEvents.safeParse({
      laneId: typeof query.laneId === 'string' ? query.laneId : '',
      limit:
        typeof query.limit === 'string'
          ? Number(query.limit)
          : typeof query.limit === 'number'
            ? query.limit
            : 50,
    });

    if (!parsed.success) {
      return [];
    }

    return service.listDelegateLaneEvents(parsed.data);
  });

  app.post('/list-lane-events', async (request, reply) => {
    const payload = parseRequestBody(
      delegateSchemas.listLaneEvents,
      (request as RequestLike).body,
      reply,
    );
    if (!payload) return;
    return service.listDelegateLaneEvents(payload);
  });

  app.post('/assign-lane', async (request, reply) => {
    const payload = parseRequestBody(
      delegateSchemas.assignLane,
      (request as RequestLike).body,
      reply,
    );
    if (!payload) return;
    return service.assignDelegateLane({
      title: payload.title,
      assignee: payload.assignee,
      assignedBy: payload.assignedBy,
      payload: payload.payload,
      priority: payload.priority,
      dueAtMs: payload.dueAtMs,
      actorId: payload.envelope.actorId,
    });
  });

  app.post('/accept-lane', async (request, reply) => {
    const payload = parseRequestBody(
      delegateSchemas.transitionLane,
      (request as RequestLike).body,
      reply,
    );
    if (!payload) return;
    const result = await service.transitionDelegateLane({
      laneId: payload.laneId,
      status: 'accepted',
      actorId: payload.envelope.actorId,
      message: payload.message,
    });
    if (!result.ok) {
      if (result.error === 'lane-not-found') {
        return sendNotFound(reply, 'lane-not-found');
      }
      return sendConflict(reply, 'invalid-lane-transition');
    }
    return result.lane;
  });

  app.post('/complete-lane', async (request, reply) => {
    const payload = parseRequestBody(
      delegateSchemas.transitionLane,
      (request as RequestLike).body,
      reply,
    );
    if (!payload) return;
    const result = await service.transitionDelegateLane({
      laneId: payload.laneId,
      status: 'completed',
      actorId: payload.envelope.actorId,
      message: payload.message,
    });
    if (!result.ok) {
      if (result.error === 'lane-not-found') {
        return sendNotFound(reply, 'lane-not-found');
      }
      return sendConflict(reply, 'invalid-lane-transition');
    }
    return result.lane;
  });

  app.post('/reject-lane', async (request, reply) => {
    const payload = parseRequestBody(
      delegateSchemas.transitionLane,
      (request as RequestLike).body,
      reply,
    );
    if (!payload) return;
    const result = await service.transitionDelegateLane({
      laneId: payload.laneId,
      status: 'rejected',
      actorId: payload.envelope.actorId,
      message: payload.message,
    });
    if (!result.ok) {
      if (result.error === 'lane-not-found') {
        return sendNotFound(reply, 'lane-not-found');
      }
      return sendConflict(reply, 'invalid-lane-transition');
    }
    return result.lane;
  });

  app.post('/reopen-lane', async (request, reply) => {
    const payload = parseRequestBody(
      delegateSchemas.transitionLane,
      (request as RequestLike).body,
      reply,
    );
    if (!payload) return;
    const result = await service.transitionDelegateLane({
      laneId: payload.laneId,
      status: 'assigned',
      actorId: payload.envelope.actorId,
      message: payload.message,
    });
    if (!result.ok) {
      if (result.error === 'lane-not-found') {
        return sendNotFound(reply, 'lane-not-found');
      }
      return sendConflict(reply, 'invalid-lane-transition');
    }
    return result.lane;
  });

  app.post('/comment-lane', async (request, reply) => {
    const payload = parseRequestBody(
      delegateSchemas.commentLane,
      (request as RequestLike).body,
      reply,
    );
    if (!payload) return;
    const event = await service.commentDelegateLane({
      laneId: payload.laneId,
      actorId: payload.envelope.actorId,
      message: payload.message,
      payload: payload.payload,
    });
    if (!event) {
      return sendNotFound(reply, 'lane-not-found');
    }
    return event;
  });
}

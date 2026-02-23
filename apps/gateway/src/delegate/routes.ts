import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { commandEnvelopeSchema } from '@finance-os/domain-kernel';

import { gatewayState } from '../state/gateway-state';

const assignSchema = z.object({
  envelope: commandEnvelopeSchema,
  title: z.string().min(1),
  assignee: z.string().min(1),
  assignedBy: z.string().min(1),
  payload: z.record(z.string(), z.unknown()).default({}),
});

const transitionSchema = z.object({
  envelope: commandEnvelopeSchema,
  laneId: z.string().min(1),
});

export async function registerDelegateRoutes(app: FastifyInstance) {
  app.get('/lanes', async () => {
    return gatewayState.listDelegateLanes();
  });

  app.post('/assign-lane', async request => {
    const payload = assignSchema.parse(request.body);
    return gatewayState.assignDelegateLane(payload);
  });

  app.post('/accept-lane', async request => {
    const payload = transitionSchema.parse(request.body);
    const lane = gatewayState.transitionDelegateLane(payload.laneId, 'accepted');
    if (!lane) return { error: 'lane-not-found' };
    return lane;
  });

  app.post('/complete-lane', async request => {
    const payload = transitionSchema.parse(request.body);
    const lane = gatewayState.transitionDelegateLane(payload.laneId, 'completed');
    if (!lane) return { error: 'lane-not-found' };
    return lane;
  });

  app.post('/reject-lane', async request => {
    const payload = transitionSchema.parse(request.body);
    const lane = gatewayState.transitionDelegateLane(payload.laneId, 'rejected');
    if (!lane) return { error: 'lane-not-found' };
    return lane;
  });
}

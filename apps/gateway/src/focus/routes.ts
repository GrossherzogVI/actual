import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { commandEnvelopeSchema } from '@finance-os/domain-kernel';

import { gatewayState } from '../state/gateway-state';

const actionOutcomeSchema = z.object({
  envelope: commandEnvelopeSchema,
  actionId: z.string().min(1),
  outcome: z.string().min(1),
  notes: z.string().optional(),
});

export async function registerFocusRoutes(app: FastifyInstance) {
  app.get('/adaptive-panel', async () => {
    return {
      actions: gatewayState.getFocusActions(),
      generatedAtMs: Date.now(),
    };
  });

  app.post('/record-action-outcome', async request => {
    const payload = actionOutcomeSchema.parse(request.body);
    const id = `outcome-${Date.now()}`;
    gatewayState.actionOutcomes.set(id, {
      id,
      actionId: payload.actionId,
      outcome: payload.outcome,
      notes: payload.notes,
      recordedAtMs: Date.now(),
    });
    return gatewayState.actionOutcomes.get(id);
  });
}

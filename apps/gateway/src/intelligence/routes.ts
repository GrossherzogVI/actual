import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { commandEnvelopeSchema } from '@finance-os/domain-kernel';

import { gatewayState } from '../state/gateway-state';

const explainSchema = z.object({
  envelope: commandEnvelopeSchema,
  recommendation: z.object({
    id: z.string(),
    title: z.string(),
    confidence: z.number(),
    provenance: z.string(),
    expectedImpact: z.string(),
    reversible: z.boolean(),
    rationale: z.string(),
  }),
});

const classifySchema = z.object({
  envelope: commandEnvelopeSchema,
  payee: z.string().min(1),
  amount: z.number().int().optional(),
});

const forecastSchema = z.object({
  envelope: commandEnvelopeSchema,
  months: z.number().int().min(1).max(24).default(6),
});

const correctionSchema = z.object({
  envelope: commandEnvelopeSchema,
  input: z.record(z.string(), z.unknown()),
  correctOutput: z.record(z.string(), z.unknown()),
});

export async function registerIntelligenceRoutes(app: FastifyInstance) {
  app.post('/recommend', async () => {
    return gatewayState.recommend();
  });

  app.post('/explain', async request => {
    const payload = explainSchema.parse(request.body);
    return gatewayState.explain(payload.recommendation);
  });

  app.post('/classify', async request => {
    const payload = classifySchema.parse(request.body);
    return gatewayState.classify(payload.payee);
  });

  app.post('/forecast', async request => {
    const payload = forecastSchema.parse(request.body);
    return gatewayState.forecast(payload.months);
  });

  app.post('/learn-correction', async request => {
    const payload = correctionSchema.parse(request.body);
    return gatewayState.learnCorrection(payload.input, payload.correctOutput);
  });
}

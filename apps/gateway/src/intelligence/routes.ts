import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { commandEnvelopeSchema } from '@finance-os/domain-kernel';

import { parseRequestBody } from '../http/route-utils';
import type { GatewayService } from '../services/gateway-service';

type RequestLike = { body?: unknown };

export const intelligenceSchemas = {
  recommend: z.object({
    envelope: commandEnvelopeSchema,
    context: z.record(z.string(), z.unknown()).optional(),
  }),
  explain: z.object({
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
  }),
  classify: z.object({
    envelope: commandEnvelopeSchema,
    payee: z.string().min(1),
    amount: z.number().int().optional(),
  }),
  forecast: z.object({
    envelope: commandEnvelopeSchema,
    months: z.number().int().min(1).max(24).default(6),
  }),
  learnCorrection: z.object({
    envelope: commandEnvelopeSchema,
    input: z.record(z.string(), z.unknown()),
    correctOutput: z.record(z.string(), z.unknown()),
  }),
};

export async function registerIntelligenceRoutes(
  app: FastifyInstance,
  service: GatewayService,
) {
  app.post('/recommend', async (request, reply) => {
    const payload = parseRequestBody(
      intelligenceSchemas.recommend,
      (request as RequestLike).body,
      reply,
    );
    if (!payload) return;
    return service.recommend();
  });

  app.post('/explain', async (request, reply) => {
    const payload = parseRequestBody(
      intelligenceSchemas.explain,
      (request as RequestLike).body,
      reply,
    );
    if (!payload) return;
    return service.explain(payload.recommendation);
  });

  app.post('/classify', async (request, reply) => {
    const payload = parseRequestBody(
      intelligenceSchemas.classify,
      (request as RequestLike).body,
      reply,
    );
    if (!payload) return;
    return service.classify(payload.payee);
  });

  app.post('/forecast', async (request, reply) => {
    const payload = parseRequestBody(
      intelligenceSchemas.forecast,
      (request as RequestLike).body,
      reply,
    );
    if (!payload) return;
    return service.forecast(payload.months);
  });

  app.post('/learn-correction', async (request, reply) => {
    const payload = parseRequestBody(
      intelligenceSchemas.learnCorrection,
      (request as RequestLike).body,
      reply,
    );
    if (!payload) return;
    return service.learnCorrection(payload);
  });
}

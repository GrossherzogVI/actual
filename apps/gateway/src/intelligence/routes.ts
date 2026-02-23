import { commandEnvelopeSchema } from '@finance-os/domain-kernel';
import type { FastifyInstance } from 'fastify';
import * as z from 'zod';

import { parseRequestBody } from '../http/route-utils';
import type { GatewayService } from '../services/gateway-service';

type RequestLike = { body?: unknown };
type QueryLike = { query?: Record<string, unknown> };

const bundeslandCodes = [
  'BW',
  'BY',
  'BE',
  'BB',
  'HB',
  'HH',
  'HE',
  'MV',
  'NI',
  'NW',
  'RP',
  'SL',
  'SN',
  'ST',
  'SH',
  'TH',
] as const;

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
  temporalSignalsQuery: z.object({
    bundesland: z.enum(bundeslandCodes).optional(),
    horizonDays: z.number().int().min(7).max(45).default(14),
  }),
};

export async function registerIntelligenceRoutes(
  app: FastifyInstance,
  service: GatewayService,
) {
  app.get('/temporal-signals', async request => {
    const query = ((request as QueryLike).query || {}) as Record<
      string,
      unknown
    >;
    const parsed = intelligenceSchemas.temporalSignalsQuery.safeParse({
      bundesland:
        typeof query.bundesland === 'string'
          ? query.bundesland.toUpperCase()
          : undefined,
      horizonDays:
        typeof query.horizonDays === 'string'
          ? Number(query.horizonDays)
          : typeof query.horizonDays === 'number'
            ? query.horizonDays
            : 14,
    });
    if (!parsed.success) {
      return service.getTemporalSignals();
    }
    return service.getTemporalSignals(parsed.data);
  });

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

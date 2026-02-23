import cors from '@fastify/cors';
import Fastify from 'fastify';
import * as z from 'zod';

type PolicyState = {
  allowCloud: boolean;
  allowedProviders: string[];
  redactionMode: 'strict' | 'balanced' | 'off';
};

type AuditEvent = {
  id: string;
  eventType: string;
  provider?: string;
  payload?: Record<string, unknown>;
  createdAtMs: number;
};

const state: PolicyState = {
  allowCloud: false,
  allowedProviders: [],
  redactionMode: 'strict',
};

const auditTrail: AuditEvent[] = [];

const routeRequestSchema = z.object({
  tenantId: z.string().min(1),
  workspaceId: z.string().min(1),
  providerHint: z.string().optional(),
  prompt: z.string().min(1),
  dataClass: z.enum(['public', 'sensitive', 'regulated']).default('sensitive'),
  allowCloudOverride: z.boolean().optional(),
});

const setPolicySchema = z.object({
  allowCloud: z.boolean(),
  allowedProviders: z.array(z.string()),
  redactionMode: z.enum(['strict', 'balanced', 'off']),
});

function redactPrompt(
  prompt: string,
  mode: PolicyState['redactionMode'],
): string {
  if (mode === 'off') return prompt;

  const ibanPattern = /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g;
  const cardPattern = /\b(?:\d[ -]*?){13,16}\b/g;

  const masked = prompt
    .replace(ibanPattern, '[REDACTED_IBAN]')
    .replace(cardPattern, '[REDACTED_CARD]');

  if (mode === 'strict') {
    return masked.replace(/\b\d{4,}\b/g, '[REDACTED_NUMBER]');
  }

  return masked;
}

function pushAudit(event: Omit<AuditEvent, 'id' | 'createdAtMs'>) {
  const record: AuditEvent = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    eventType: event.eventType,
    provider: event.provider,
    payload: event.payload,
    createdAtMs: Date.now(),
  };
  auditTrail.unshift(record);
  if (auditTrail.length > 1000) {
    auditTrail.pop();
  }
  return record;
}

async function main() {
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true, credentials: true });

  app.get('/health', async () => ({ status: 'ok', service: 'ai-policy' }));

  app.get('/v1/policy', async () => state);

  app.put('/v1/policy', async request => {
    const payload = setPolicySchema.parse(request.body);
    state.allowCloud = payload.allowCloud;
    state.allowedProviders = payload.allowedProviders;
    state.redactionMode = payload.redactionMode;

    pushAudit({
      eventType: 'policy-updated',
      payload,
    });

    return state;
  });

  app.get('/v1/audit', async request => {
    const limit = Math.min(
      200,
      Math.max(1, Number((request.query as { limit?: number }).limit || 50)),
    );
    return auditTrail.slice(0, limit);
  });

  app.post('/v1/route', async request => {
    const payload = routeRequestSchema.parse(request.body);
    const allowCloud = payload.allowCloudOverride ?? state.allowCloud;

    const redactedPrompt = redactPrompt(payload.prompt, state.redactionMode);
    const provider = payload.providerHint || 'local/ollama';
    const providerAllowed =
      !payload.providerHint || state.allowedProviders.includes(provider);

    const route =
      allowCloud && providerAllowed && payload.dataClass === 'public'
        ? 'cloud'
        : 'local';

    const decision = {
      route,
      provider: route === 'cloud' ? provider : 'local/ollama',
      redactedPrompt,
      reason:
        route === 'cloud'
          ? 'Cloud explicitly allowed and request classified as public.'
          : 'Local-first policy retained for sovereignty and auditability.',
      auditable: true,
    };

    pushAudit({
      eventType: 'route-decision',
      provider: decision.provider,
      payload: {
        tenantId: payload.tenantId,
        workspaceId: payload.workspaceId,
        route: decision.route,
        dataClass: payload.dataClass,
      },
    });

    return decision;
  });

  const host = process.env.AI_POLICY_HOST || '0.0.0.0';
  const port = Number(process.env.AI_POLICY_PORT || 7072);
  await app.listen({ host, port });
  app.log.info(`AI policy service listening on ${host}:${port}`);
}

void main();

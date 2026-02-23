import cors from '@fastify/cors';
import Fastify from 'fastify';

import type { GatewayContext } from './context';
import { registerDelegateRoutes } from './delegate/routes';
import { registerFocusRoutes } from './focus/routes';
import { registerIntelligenceRoutes } from './intelligence/routes';
import { registerLedgerRoutes } from './ledger/routes';
import { registerPolicyRoutes } from './policy/routes';
import { registerScenarioRoutes } from './scenario/routes';
import { registerWorkflowRoutes } from './workflow/routes';

export async function buildGatewayApp(context: GatewayContext) {
  const app = Fastify({
    logger: true,
    requestTimeout: 10_000,
  });

  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  app.get('/health', async () => ({
    status: 'ok',
    service: 'gateway',
    store: context.repository.kind,
    queue: context.queue.kind,
  }));

  app.get('/metrics', async () => {
    return context.service.getRuntimeMetrics();
  });

  await app.register(async scoped => {
    await registerLedgerRoutes(scoped, context.service);
  }, { prefix: '/ledger/v1' });

  await app.register(async scoped => {
    await registerWorkflowRoutes(scoped, context.service);
  }, { prefix: '/workflow/v1' });

  await app.register(async scoped => {
    await registerFocusRoutes(scoped, context.service);
  }, { prefix: '/focus/v1' });

  await app.register(async scoped => {
    await registerScenarioRoutes(scoped, context.service);
  }, { prefix: '/scenario/v1' });

  await app.register(async scoped => {
    await registerDelegateRoutes(scoped, context.service);
  }, { prefix: '/delegate/v1' });

  await app.register(async scoped => {
    await registerPolicyRoutes(scoped, context.service);
  }, { prefix: '/policy/v1' });

  await app.register(async scoped => {
    await registerIntelligenceRoutes(scoped, context.service);
  }, { prefix: '/intelligence/v1' });

  return app;
}

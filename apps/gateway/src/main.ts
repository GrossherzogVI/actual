import cors from '@fastify/cors';
import Fastify from 'fastify';

import { registerDelegateRoutes } from './delegate/routes';
import { registerFocusRoutes } from './focus/routes';
import { registerIntelligenceRoutes } from './intelligence/routes';
import { registerPolicyRoutes } from './policy/routes';
import { registerScenarioRoutes } from './scenario/routes';
import { gatewayState } from './state/gateway-state';
import { registerWorkflowRoutes } from './workflow/routes';

async function buildServer() {
  const app = Fastify({
    logger: true,
    requestTimeout: 10_000,
  });

  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  app.get('/health', async () => ({ status: 'ok', service: 'gateway' }));
  app.get('/metrics', async () => ({
    playbooks: gatewayState.playbooks.size,
    scenarioBranches: gatewayState.scenarioBranches.size,
    delegateLanes: gatewayState.delegateLanes.size,
    corrections: gatewayState.corrections.size,
  }));

  await app.register(registerWorkflowRoutes, { prefix: '/workflow/v1' });
  await app.register(registerFocusRoutes, { prefix: '/focus/v1' });
  await app.register(registerScenarioRoutes, { prefix: '/scenario/v1' });
  await app.register(registerDelegateRoutes, { prefix: '/delegate/v1' });
  await app.register(registerPolicyRoutes, { prefix: '/policy/v1' });
  await app.register(registerIntelligenceRoutes, { prefix: '/intelligence/v1' });

  return app;
}

async function main() {
  const app = await buildServer();
  const host = process.env.FINANCE_GATEWAY_HOST || '0.0.0.0';
  const port = Number(process.env.FINANCE_GATEWAY_PORT || 7070);

  await app.listen({ host, port });
  app.log.info(`Finance OS gateway listening on ${host}:${port}`);
}

void main();

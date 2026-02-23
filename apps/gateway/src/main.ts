import { buildGatewayApp } from './app';
import { createGatewayContext } from './context';

async function main() {
  const context = await createGatewayContext();
  const app = await buildGatewayApp(context);

  const host = context.config.FINANCE_GATEWAY_HOST;
  const port = context.config.FINANCE_GATEWAY_PORT;

  await app.listen({ host, port });
  app.log.info(`Finance OS gateway listening on ${host}:${port}`);

  const shutdown = async () => {
    await app.close();
    await context.close();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown();
  });

  process.on('SIGTERM', () => {
    void shutdown();
  });
}

void main();

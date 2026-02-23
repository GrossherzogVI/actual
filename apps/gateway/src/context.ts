import { loadGatewayConfig } from './config';
import { createGatewayQueue } from './queue/factory';
import { createGatewayRepository } from './repositories/factory';
import { createGatewayService } from './services/gateway-service';

export async function createGatewayContext() {
  const config = loadGatewayConfig();
  const repository = await createGatewayRepository(config);
  const queue = await createGatewayQueue(config);
  const service = createGatewayService(repository, queue);

  return {
    config,
    repository,
    queue,
    service,
    async close() {
      await Promise.all([repository.close(), queue.close()]);
    },
  };
}

export type GatewayContext = Awaited<ReturnType<typeof createGatewayContext>>;

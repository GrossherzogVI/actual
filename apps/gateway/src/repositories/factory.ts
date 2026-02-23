import type { GatewayConfig } from '../config';

import { InMemoryGatewayRepository } from './in-memory-repository';
import type { GatewayRepository } from './types';

async function createInMemoryRepository(): Promise<GatewayRepository> {
  const inMemoryRepository = new InMemoryGatewayRepository();
  await inMemoryRepository.init();
  return inMemoryRepository;
}

export async function createGatewayRepository(
  config: GatewayConfig,
): Promise<GatewayRepository> {
  if (config.FINANCE_GATEWAY_STORE === 'memory') {
    return createInMemoryRepository();
  }

  if (!config.FINANCE_GATEWAY_DATABASE_URL) {
    throw new Error(
      '[gateway] FINANCE_GATEWAY_DATABASE_URL is required when FINANCE_GATEWAY_STORE=postgres',
    );
  }

  try {
    const [{ Pool }, { PostgresGatewayRepository }] = await Promise.all([
      import('pg'),
      import('./postgres-repository'),
    ]);

    const pool = new Pool({
      connectionString: config.FINANCE_GATEWAY_DATABASE_URL,
      max: 10,
    });

    const postgresRepository = new PostgresGatewayRepository(pool);
    await postgresRepository.init();
    return postgresRepository;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[gateway] Failed to initialize postgres repository: ${message}`,
    );
  }
}

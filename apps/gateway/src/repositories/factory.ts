import { Pool } from 'pg';

import type { GatewayConfig } from '../config';

import { InMemoryGatewayRepository } from './in-memory-repository';
import { PostgresGatewayRepository } from './postgres-repository';
import type { GatewayRepository } from './types';

export async function createGatewayRepository(
  config: GatewayConfig,
): Promise<GatewayRepository> {
  if (config.FINANCE_GATEWAY_STORE === 'postgres') {
    if (!config.FINANCE_GATEWAY_DATABASE_URL) {
      console.warn(
        '[gateway] FINANCE_GATEWAY_STORE=postgres but FINANCE_GATEWAY_DATABASE_URL is missing; falling back to in-memory repository.',
      );
    } else {
      const pool = new Pool({
        connectionString: config.FINANCE_GATEWAY_DATABASE_URL,
        max: 10,
      });

      const postgresRepository = new PostgresGatewayRepository(pool);
      await postgresRepository.init();
      return postgresRepository;
    }
  }

  const inMemoryRepository = new InMemoryGatewayRepository();
  await inMemoryRepository.init();
  return inMemoryRepository;
}

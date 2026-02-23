import { z } from 'zod';

const boolFromEnv = z.union([z.boolean(), z.string()]).transform(value => {
  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off', ''].includes(normalized)) {
    return false;
  }

  throw new Error(`Invalid boolean value: ${value}`);
});

const configSchema = z.object({
  FINANCE_GATEWAY_HOST: z.string().default('0.0.0.0'),
  FINANCE_GATEWAY_PORT: z.coerce.number().int().min(1).max(65535).default(7070),
  FINANCE_GATEWAY_STORE: z.enum(['memory', 'postgres']).default('postgres'),
  FINANCE_GATEWAY_QUEUE: z.enum(['memory', 'redis']).default('redis'),
  FINANCE_GATEWAY_ALLOW_FALLBACK: boolFromEnv.default(false),
  FINANCE_GATEWAY_DATABASE_URL: z.string().optional(),
  FINANCE_GATEWAY_REDIS_URL: z.string().optional(),
  FINANCE_GATEWAY_QUEUE_KEY: z.string().default('financeos:gateway:jobs'),
});

export type GatewayConfig = z.infer<typeof configSchema>;

export function loadGatewayConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig {
  return configSchema.parse(env);
}

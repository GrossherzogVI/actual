import * as z from 'zod';

const booleanFromEnv = z.preprocess(value => {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
      return true;
    }
    if (normalized === 'false' || normalized === '0' || normalized === 'no') {
      return false;
    }
  }
  return value;
}, z.boolean());

const configSchema = z.object({
  FINANCE_GATEWAY_HOST: z.string().default('0.0.0.0'),
  FINANCE_GATEWAY_PORT: z.coerce.number().int().min(1).max(65535).default(7070),
  FINANCE_GATEWAY_STORE: z.enum(['memory', 'postgres']).default('postgres'),
  FINANCE_GATEWAY_QUEUE: z.enum(['memory', 'redis']).default('redis'),
  FINANCE_GATEWAY_DATABASE_URL: z.string().optional(),
  FINANCE_GATEWAY_REDIS_URL: z.string().optional(),
  FINANCE_GATEWAY_QUEUE_KEY: z.string().default('financeos:gateway:jobs'),
  FINANCE_GATEWAY_INTERNAL_TOKEN: z.string().default(''),
  FINANCE_GATEWAY_ACTIVITY_STARTUP_MODE: z
    .enum(['blocking', 'non-blocking', 'off'])
    .default('non-blocking'),
  FINANCE_GATEWAY_ACTIVITY_BACKFILL_ON_START: booleanFromEnv.default(true),
  FINANCE_GATEWAY_ACTIVITY_BACKFILL_LIMIT_PER_PLANE: z.coerce
    .number()
    .int()
    .min(1)
    .max(5000)
    .default(500),
  FINANCE_GATEWAY_ACTIVITY_MAINTENANCE_ON_START: booleanFromEnv.default(true),
  FINANCE_GATEWAY_ACTIVITY_RETENTION_DAYS: z.coerce.number().min(0).default(90),
  FINANCE_GATEWAY_ACTIVITY_MAX_ROWS: z.coerce
    .number()
    .int()
    .min(0)
    .default(50000),
  FINANCE_GATEWAY_ACTIVITY_MAINTENANCE_INTERVAL_MINUTES: z.coerce
    .number()
    .int()
    .min(0)
    .default(0),
});

export type GatewayConfig = z.infer<typeof configSchema>;

export function loadGatewayConfig(
  env: NodeJS.ProcessEnv = process.env,
): GatewayConfig {
  return configSchema.parse(env);
}

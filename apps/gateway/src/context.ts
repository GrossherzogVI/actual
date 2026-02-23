import { loadGatewayConfig } from './config';
import { createGatewayQueue } from './queue/factory';
import { createGatewayRepository } from './repositories/factory';
import { createGatewayService } from './services/gateway-service';

export async function createGatewayContext() {
  const config = loadGatewayConfig();
  const repository = await createGatewayRepository(config);
  const queue = await createGatewayQueue(config);
  const service = createGatewayService(repository, queue);
  let maintenanceInterval: NodeJS.Timeout | undefined;

  const shouldRunPipeline =
    config.FINANCE_GATEWAY_ACTIVITY_STARTUP_MODE !== 'off' &&
    (config.FINANCE_GATEWAY_ACTIVITY_BACKFILL_ON_START ||
      config.FINANCE_GATEWAY_ACTIVITY_MAINTENANCE_ON_START);

  if (shouldRunPipeline) {
    const startupInput = {
      runBackfill: config.FINANCE_GATEWAY_ACTIVITY_BACKFILL_ON_START,
      runMaintenance: config.FINANCE_GATEWAY_ACTIVITY_MAINTENANCE_ON_START,
      limitPerPlane: config.FINANCE_GATEWAY_ACTIVITY_BACKFILL_LIMIT_PER_PLANE,
      retentionDays: config.FINANCE_GATEWAY_ACTIVITY_RETENTION_DAYS,
      maxRows: config.FINANCE_GATEWAY_ACTIVITY_MAX_ROWS,
    };

    if (config.FINANCE_GATEWAY_ACTIVITY_STARTUP_MODE === 'blocking') {
      await service.startOpsActivityPipeline({
        ...startupInput,
        waitForCompletion: true,
      });
    } else {
      void service.startOpsActivityPipeline({
        ...startupInput,
        waitForCompletion: false,
      });
    }
  }

  if (config.FINANCE_GATEWAY_ACTIVITY_MAINTENANCE_INTERVAL_MINUTES > 0) {
    const intervalMs =
      config.FINANCE_GATEWAY_ACTIVITY_MAINTENANCE_INTERVAL_MINUTES * 60 * 1000;
    maintenanceInterval = setInterval(() => {
      void service.startOpsActivityPipeline({
        runBackfill: false,
        runMaintenance: true,
        retentionDays: config.FINANCE_GATEWAY_ACTIVITY_RETENTION_DAYS,
        maxRows: config.FINANCE_GATEWAY_ACTIVITY_MAX_ROWS,
        waitForCompletion: false,
      });
    }, intervalMs);
    maintenanceInterval.unref?.();
  }

  return {
    config,
    repository,
    queue,
    service,
    async close() {
      if (maintenanceInterval) {
        clearInterval(maintenanceInterval);
        maintenanceInterval = undefined;
      }
      await Promise.all([repository.close(), queue.close()]);
    },
  };
}

export type GatewayContext = Awaited<ReturnType<typeof createGatewayContext>>;

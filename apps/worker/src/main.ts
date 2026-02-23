type WorkerConfig = {
  gatewayUrl: string;
  aiPolicyUrl: string;
  projectionIntervalMs: number;
  anomalyIntervalMs: number;
  modelIntervalMs: number;
};

const config: WorkerConfig = {
  gatewayUrl: process.env.FINANCE_GATEWAY_URL || 'http://localhost:7070',
  aiPolicyUrl: process.env.AI_POLICY_URL || 'http://localhost:7072',
  projectionIntervalMs: Number(process.env.PROJECTION_INTERVAL_MS || 30_000),
  anomalyIntervalMs: Number(process.env.ANOMALY_INTERVAL_MS || 60_000),
  modelIntervalMs: Number(process.env.MODEL_INTERVAL_MS || 90_000),
};

type WorkerTask = {
  name: string;
  intervalMs: number;
  run: () => Promise<void>;
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  return response.json() as Promise<T>;
}

async function projectionTask() {
  const pulse = await fetchJson<{
    pendingReviews: number;
    urgentReviews: number;
    expiringContracts: number;
  }>(`${config.gatewayUrl}/workflow/v1/money-pulse`);

  console.log(
    `[worker:projection] pending=${pulse.pendingReviews} urgent=${pulse.urgentReviews} expiring=${pulse.expiringContracts}`,
  );
}

async function anomalyTask() {
  const pulse = await fetchJson<{
    pendingReviews: number;
    urgentReviews: number;
    expiringContracts: number;
  }>(`${config.gatewayUrl}/workflow/v1/money-pulse`);

  if (pulse.urgentReviews > 5 || pulse.expiringContracts > 10) {
    console.log(
      `[worker:anomaly] high-pressure detected urgent=${pulse.urgentReviews} expiring=${pulse.expiringContracts}`,
    );
  }
}

async function closeRoutineTask() {
  const dayOfWeek = new Date().getDay();
  if (dayOfWeek !== 1) {
    return;
  }

  const envelope = {
    commandId: `worker-close-${Date.now()}`,
    actorId: 'worker',
    tenantId: 'default',
    workspaceId: 'default',
    intent: 'run-close-routine',
    workflowId: 'close-loop',
    sourceSurface: 'worker',
    latencyBudgetMs: 10_000,
    clientTimestampMs: Date.now(),
  };

  const result = await fetchJson<Record<string, unknown>>(
    `${config.gatewayUrl}/workflow/v1/run-close-routine`,
    {
      method: 'POST',
      body: JSON.stringify({ envelope, period: 'weekly' }),
    },
  );

  console.log(`[worker:close] weekly close run`, result);
}

async function modelTask() {
  const payload = {
    tenantId: 'default',
    workspaceId: 'default',
    providerHint: 'local/ollama',
    prompt: 'Summarize top finance risks for this week.',
    dataClass: 'sensitive',
  };

  const decision = await fetchJson<Record<string, unknown>>(
    `${config.aiPolicyUrl}/v1/route`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );

  console.log(`[worker:model] policy decision`, decision);
}

function scheduleTask(task: WorkerTask): NodeJS.Timeout {
  const runner = async () => {
    try {
      await task.run();
    } catch (err) {
      console.error(`[worker:${task.name}]`, err);
    }
  };

  void runner();
  return setInterval(() => {
    void runner();
  }, task.intervalMs);
}

async function main() {
  const tasks: WorkerTask[] = [
    { name: 'projection', intervalMs: config.projectionIntervalMs, run: projectionTask },
    { name: 'anomaly', intervalMs: config.anomalyIntervalMs, run: anomalyTask },
    { name: 'close-routine', intervalMs: config.anomalyIntervalMs, run: closeRoutineTask },
    { name: 'model', intervalMs: config.modelIntervalMs, run: modelTask },
  ];

  const intervals = tasks.map(scheduleTask);

  const shutdown = () => {
    for (const interval of intervals) {
      clearInterval(interval);
    }
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.log('[worker] started', config);
}

void main();

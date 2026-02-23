import { createHash } from 'node:crypto';

type WorkerConfig = {
  workerId: string;
  gatewayUrl: string;
  gatewayInternalToken: string;
  aiPolicyUrl: string;
  projectionIntervalMs: number;
  anomalyIntervalMs: number;
  closeRoutineIntervalMs: number;
  modelIntervalMs: number;
  queuePollIntervalMs: number;
  queueRequeueIntervalMs: number;
  queueVisibilityTimeoutMs: number;
  queueMaxJobs: number;
  queueRequeueLimit: number;
  queueMaxAttempts: number;
  queueLeaseTtlMs: number;
  queueLeaseKey: string;
};

const config: WorkerConfig = {
  workerId:
    process.env.WORKER_ID || `worker-${Math.random().toString(16).slice(2, 8)}`,
  gatewayUrl: process.env.FINANCE_GATEWAY_URL || 'http://localhost:7070',
  gatewayInternalToken: process.env.FINANCE_GATEWAY_INTERNAL_TOKEN || '',
  aiPolicyUrl: process.env.AI_POLICY_URL || 'http://localhost:7072',
  projectionIntervalMs: Number(process.env.PROJECTION_INTERVAL_MS || 30_000),
  anomalyIntervalMs: Number(process.env.ANOMALY_INTERVAL_MS || 60_000),
  closeRoutineIntervalMs: Number(
    process.env.CLOSE_ROUTINE_INTERVAL_MS || 60_000,
  ),
  modelIntervalMs: Number(process.env.MODEL_INTERVAL_MS || 90_000),
  queuePollIntervalMs: Number(process.env.QUEUE_POLL_INTERVAL_MS || 1_500),
  queueRequeueIntervalMs: Number(
    process.env.QUEUE_REQUEUE_INTERVAL_MS || 5_000,
  ),
  queueVisibilityTimeoutMs: Number(
    process.env.QUEUE_VISIBILITY_TIMEOUT_MS || 30_000,
  ),
  queueMaxJobs: Number(process.env.QUEUE_MAX_JOBS || 25),
  queueRequeueLimit: Number(process.env.QUEUE_REQUEUE_LIMIT || 100),
  queueMaxAttempts: Number(process.env.QUEUE_MAX_ATTEMPTS || 6),
  queueLeaseTtlMs: Number(process.env.QUEUE_LEASE_TTL_MS || 15_000),
  queueLeaseKey: process.env.QUEUE_LEASE_KEY || 'worker-queue-drain',
};

type WorkerTask = {
  name: string;
  intervalMs: number;
  run: () => Promise<void>;
};

type ClaimedQueueJob = {
  id: string;
  name: string;
  payload: Record<string, unknown>;
  createdAtMs: number;
  receipt: string;
  attempt: number;
  claimedAtMs: number;
  visibleAtMs: number;
};

type QueueClaimResult = {
  jobs: ClaimedQueueJob[];
  queueSize: number;
  queueInFlight: number;
};

type QueueLeaseResult = {
  acquired: boolean;
  leaseKey: string;
  ownerId: string;
  ttlMs: number;
  expiresAtMs: number;
};

type QueueFingerprintClaimResult = {
  status: 'acquired' | 'already-processed' | 'already-claimed';
  fingerprint: string;
  leaseKey: string;
  ownerId: string;
  ttlMs: number;
  expiresAtMs?: number;
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

function nowIso(): string {
  return new Date().toISOString();
}

function internalGatewayHeaders(): Record<string, string> | undefined {
  if (!config.gatewayInternalToken) {
    return undefined;
  }
  return {
    'x-finance-internal-token': config.gatewayInternalToken,
  };
}

async function claimQueueJobs(): Promise<QueueClaimResult> {
  return fetchJson<QueueClaimResult>(
    `${config.gatewayUrl}/workflow/v1/claim-queue-jobs`,
    {
      method: 'POST',
      headers: internalGatewayHeaders(),
      body: JSON.stringify({
        workerId: config.workerId,
        maxJobs: config.queueMaxJobs,
        visibilityTimeoutMs: config.queueVisibilityTimeoutMs,
      }),
    },
  );
}

async function ackQueueJob(input: {
  receipt: string;
  success: boolean;
  requeue?: boolean;
  jobId: string;
  jobName: string;
  jobFingerprint?: string;
  attempt: number;
  processingMs: number;
  errorMessage?: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  await fetchJson<Record<string, unknown>>(
    `${config.gatewayUrl}/workflow/v1/ack-queue-job`,
    {
      method: 'POST',
      headers: internalGatewayHeaders(),
      body: JSON.stringify({
        workerId: config.workerId,
        receipt: input.receipt,
        success: input.success,
        requeue: input.requeue ?? true,
        jobId: input.jobId,
        jobName: input.jobName,
        jobFingerprint: input.jobFingerprint,
        attempt: input.attempt,
        processingMs: Math.max(0, Math.trunc(input.processingMs)),
        errorMessage: input.errorMessage,
        payload: input.payload,
      }),
    },
  );
}

async function requeueExpiredQueueJobs(): Promise<number> {
  const result = await fetchJson<{ moved: number }>(
    `${config.gatewayUrl}/workflow/v1/requeue-expired-queue-jobs`,
    {
      method: 'POST',
      headers: internalGatewayHeaders(),
      body: JSON.stringify({
        limit: config.queueRequeueLimit,
      }),
    },
  );
  return result.moved;
}

async function acquireQueueLease(): Promise<QueueLeaseResult> {
  return fetchJson<QueueLeaseResult>(
    `${config.gatewayUrl}/workflow/v1/acquire-worker-queue-lease`,
    {
      method: 'POST',
      headers: internalGatewayHeaders(),
      body: JSON.stringify({
        workerId: config.workerId,
        ttlMs: config.queueLeaseTtlMs,
        leaseKey: config.queueLeaseKey,
      }),
    },
  );
}

async function releaseQueueLease(): Promise<void> {
  await fetchJson<Record<string, unknown>>(
    `${config.gatewayUrl}/workflow/v1/release-worker-queue-lease`,
    {
      method: 'POST',
      headers: internalGatewayHeaders(),
      body: JSON.stringify({
        workerId: config.workerId,
        leaseKey: config.queueLeaseKey,
      }),
    },
  );
}

async function claimWorkerJobFingerprint(
  fingerprint: string,
): Promise<QueueFingerprintClaimResult> {
  return fetchJson<QueueFingerprintClaimResult>(
    `${config.gatewayUrl}/workflow/v1/claim-worker-job-fingerprint`,
    {
      method: 'POST',
      headers: internalGatewayHeaders(),
      body: JSON.stringify({
        workerId: config.workerId,
        fingerprint,
        ttlMs: config.queueVisibilityTimeoutMs,
      }),
    },
  );
}

async function projectionTask() {
  const pulse = await fetchJson<{
    pendingReviews: number;
    urgentReviews: number;
    expiringContracts: number;
  }>(`${config.gatewayUrl}/workflow/v1/money-pulse`);

  console.log(
    `[${nowIso()}][worker:projection] pending=${pulse.pendingReviews} urgent=${pulse.urgentReviews} expiring=${pulse.expiringContracts}`,
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
      `[${nowIso()}][worker:anomaly] high-pressure detected urgent=${pulse.urgentReviews} expiring=${pulse.expiringContracts}`,
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

  console.log(`[${nowIso()}][worker:close] weekly close run`, result);
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

  console.log(`[${nowIso()}][worker:model] policy decision`, decision);
}

function payloadString(
  payload: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = payload[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function stableStringify(value: unknown): string {
  if (value === null) {
    return 'null';
  }

  if (typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? JSON.stringify(value) : 'null';
  }

  if (Array.isArray(value)) {
    return `[${value.map(item => stableStringify(item)).join(',')}]`;
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const entries = keys.map(
      key => `${JSON.stringify(key)}:${stableStringify(record[key])}`,
    );
    return `{${entries.join(',')}}`;
  }

  return 'null';
}

function computeJobFingerprint(job: ClaimedQueueJob): string {
  const hash = createHash('sha256');
  hash.update(
    stableStringify({
      name: job.name,
      payload: job.payload,
    }),
  );
  return hash.digest('hex');
}

async function processQueueJob(job: ClaimedQueueJob) {
  switch (job.name) {
    case 'workflow.playbook.created':
    case 'workflow.playbook.run':
    case 'workflow.close.run':
    case 'workflow.batch-policy.applied':
    case 'scenario.branch.created':
    case 'scenario.mutation.applied':
    case 'scenario.branch.adopted':
    case 'delegate.lane.assigned':
    case 'delegate.lane.transitioned':
    case 'delegate.lane.commented':
      await projectionTask();
      return;
    case 'ledger.command.submitted': {
      const workspaceId =
        payloadString(job.payload, 'workspaceId') || 'default';
      await fetchJson<Record<string, unknown>>(
        `${config.gatewayUrl}/ledger/v1/projection-snapshot`,
        {
          method: 'POST',
          body: JSON.stringify({
            workspaceId,
            projectionName: 'ops-default',
          }),
        },
      );
      return;
    }
    case 'intelligence.correction.learned':
      await modelTask();
      return;
    default:
      return;
  }
}

async function queueDrainTask() {
  const lease = await acquireQueueLease();
  if (!lease.acquired) {
    return;
  }

  const claimed = await claimQueueJobs();
  if (claimed.jobs.length === 0) {
    return;
  }

  for (const job of claimed.jobs) {
    const startedAtMs = Date.now();
    const jobFingerprint = computeJobFingerprint(job);
    try {
      const claim = await claimWorkerJobFingerprint(jobFingerprint);
      if (claim.status === 'already-claimed') {
        continue;
      }

      if (claim.status === 'already-processed') {
        await ackQueueJob({
          receipt: job.receipt,
          success: true,
          requeue: false,
          jobId: job.id,
          jobName: job.name,
          jobFingerprint,
          attempt: job.attempt,
          processingMs: Date.now() - startedAtMs,
          errorMessage: 'skipped-duplicate-fingerprint',
          payload: job.payload,
        });
        continue;
      }

      await processQueueJob(job);
      await ackQueueJob({
        receipt: job.receipt,
        success: true,
        requeue: false,
        jobId: job.id,
        jobName: job.name,
        jobFingerprint,
        attempt: job.attempt,
        processingMs: Date.now() - startedAtMs,
        payload: job.payload,
      });
    } catch (error) {
      const shouldRequeue = job.attempt < config.queueMaxAttempts;
      const message = error instanceof Error ? error.message : String(error);
      await ackQueueJob({
        receipt: job.receipt,
        success: false,
        requeue: shouldRequeue,
        jobId: job.id,
        jobName: job.name,
        jobFingerprint,
        attempt: job.attempt,
        processingMs: Date.now() - startedAtMs,
        errorMessage: message,
        payload: job.payload,
      });
      console.error(
        `[${nowIso()}][worker:queue] job=${job.name} id=${job.id} attempt=${job.attempt} requeue=${shouldRequeue} error=${message}`,
      );
    }
  }

  console.log(
    `[${nowIso()}][worker:queue] processed=${claimed.jobs.length} ready=${claimed.queueSize} inflight=${claimed.queueInFlight}`,
  );
}

async function queueMaintenanceTask() {
  const lease = await acquireQueueLease();
  if (!lease.acquired) {
    return;
  }

  const moved = await requeueExpiredQueueJobs();
  if (moved > 0) {
    console.log(
      `[${nowIso()}][worker:queue] requeued expired claims moved=${moved}`,
    );
  }
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
    {
      name: 'queue-drain',
      intervalMs: config.queuePollIntervalMs,
      run: queueDrainTask,
    },
    {
      name: 'queue-requeue',
      intervalMs: config.queueRequeueIntervalMs,
      run: queueMaintenanceTask,
    },
    {
      name: 'projection',
      intervalMs: config.projectionIntervalMs,
      run: projectionTask,
    },
    { name: 'anomaly', intervalMs: config.anomalyIntervalMs, run: anomalyTask },
    {
      name: 'close-routine',
      intervalMs: config.closeRoutineIntervalMs,
      run: closeRoutineTask,
    },
    { name: 'model', intervalMs: config.modelIntervalMs, run: modelTask },
  ];

  const intervals = tasks.map(scheduleTask);

  const shutdown = async () => {
    for (const interval of intervals) {
      clearInterval(interval);
    }
    try {
      await releaseQueueLease();
    } catch {
      // best-effort lease release during shutdown
    }
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.log('[worker] started', config);
}

void main();

import { createCommandEnvelope } from '@finance-os/domain-kernel';
import { describe, expect, it } from 'vitest';

import { rpcRegistry } from '../contracts/rpc-registry';
import { registerDelegateRoutes } from '../delegate/routes';
import { registerFocusRoutes } from '../focus/routes';
import { registerIntelligenceRoutes } from '../intelligence/routes';
import { registerLedgerRoutes } from '../ledger/routes';
import { registerPolicyRoutes } from '../policy/routes';
import { InMemoryGatewayQueue } from '../queue/in-memory-queue';
import { InMemoryGatewayRepository } from '../repositories/in-memory-repository';
import { registerScenarioRoutes } from '../scenario/routes';
import { createGatewayService } from '../services/gateway-service';
import { registerWorkflowRoutes } from '../workflow/routes';

function envelope() {
  return createCommandEnvelope({
    commandId: 'cmd-http-contract',
    actorId: 'tester',
    tenantId: 'tenant-1',
    workspaceId: 'workspace-1',
    intent: 'contract-validation',
    workflowId: 'workflow-1',
    sourceSurface: 'vitest',
    confidenceContext: {
      score: 0.93,
      rationale: 'http-contract-suite',
    },
  });
}

type RuntimeSeeds = {
  playbookId: string;
  playbookRunId: string;
  commandRunId: string;
  laneId: string;
  branchId: string;
};

type CapturedRoute = {
  method: 'GET' | 'POST';
  path: string;
  handler: (
    request?: { body?: unknown; headers?: Record<string, unknown> },
    reply?: {
      code(statusCode: number): unknown;
      status(statusCode: number): unknown;
      send(payload: unknown): unknown;
    },
  ) => unknown;
};

type CapturedApp = {
  routes: Map<string, CapturedRoute>;
  prefixed(prefix: string): {
    get(path: string, handler: CapturedRoute['handler']): void;
    post(path: string, handler: CapturedRoute['handler']): void;
  };
};

function createCapturedApp(): CapturedApp {
  const routes = new Map<string, CapturedRoute>();

  return {
    routes,
    prefixed(prefix: string) {
      function add(method: 'GET' | 'POST', path: string, handler: CapturedRoute['handler']) {
        routes.set(`${method} ${prefix}${path}`, {
          method,
          path: `${prefix}${path}`,
          handler,
        });
      }

      return {
        get(path, handler) {
          add('GET', path, handler);
        },
        post(path, handler) {
          add('POST', path, handler);
        },
      };
    },
  };
}

function payloadFor(service: string, rpc: string, seeds: RuntimeSeeds) {
  const base = {
    envelope: envelope(),
    workspaceId: 'workspace-1',
    tenantId: 'tenant-1',
    commandType: 'ledger.transaction.created',
    aggregateId: 'txn-1',
    aggregateType: 'transaction',
    payload: { amount: 1234, riskDelta: -1, amountDelta: 10 },
    projectionName: 'ops-default',
    playbookId: seeds.playbookId,
    runId: seeds.playbookRunId,
    executionMode: 'dry-run',
    guardrailProfile: 'strict',
    rollbackWindowMinutes: 60,
    rollbackOnFailure: false,
    idempotencyKey: 'http-contract-idempotency',
    period: 'weekly',
    ids: ['id-1'],
    status: 'completed',
    resolvedAction: 'batch-policy',
    chain: 'triage -> close-weekly',
    name: 'Scenario A',
    baseBranchId: seeds.branchId,
    notes: 'runtime-seed',
    branchId: seeds.branchId,
    againstBranchId: seeds.branchId,
    mutationKind: 'amount-adjust',
    actionId: 'focus-1',
    outcome: 'completed',
    assignee: 'delegate',
    assignedBy: 'owner',
    title: 'lane title',
    laneId: seeds.laneId,
    message: 'status update',
    priority: 'normal',
    dueAtMs: Date.now() + 86_400_000,
    policy: {
      allowCloud: false,
      allowedProviders: [],
      redactionMode: 'strict',
    },
    limit: 20,
    recommendation: {
      id: 'rec-1',
      title: 'Rec',
      confidence: 0.8,
      provenance: 'engine',
      expectedImpact: 'risk-reduction',
      reversible: true,
      rationale: 'high confidence',
    },
    payee: 'Rewe',
    months: 6,
    input: { payee: 'Rewe' },
    correctOutput: { category: 'lebensmittel.supermarkt' },
    cursor: undefined,
    workerId: 'worker-test',
    maxJobs: 5,
    visibilityTimeoutMs: 5_000,
    ttlMs: 5_000,
    receipt: 'receipt-test',
    fingerprint: 'fingerprint-test',
    success: true,
    requeue: true,
    jobFingerprint: 'fingerprint-test',
  } as const;

  if (service === 'workflow.v1' && rpc === 'GetMoneyPulse') {
    return undefined;
  }

  if (service === 'workflow.v1' && rpc === 'GetRuntimeMetrics') {
    return undefined;
  }

  if (service === 'workflow.v1' && rpc === 'GetOpsActivityPipelineStatus') {
    return undefined;
  }

  if (service === 'focus.v1' && rpc === 'GetAdaptivePanel') {
    return undefined;
  }

  if (service === 'policy.v1' && rpc === 'GetEgressPolicy') {
    return undefined;
  }

  if (service === 'workflow.v1' && rpc === 'RollbackCommandRun') {
    return {
      ...base,
      runId: seeds.commandRunId,
    };
  }

  return { ...base };
}

async function invoke(
  app: CapturedApp,
  method: 'GET' | 'POST',
  path: string,
  payload?: unknown,
  options?: {
    headers?: Record<string, unknown>;
  },
): Promise<{ statusCode: number; body?: unknown }> {
  const route = app.routes.get(`${method} ${path}`);
  if (!route) {
    return { statusCode: 404 };
  }

  try {
    let statusCode = 200;
    let sentPayload: unknown = undefined;
    let wasSent = false;

    const reply = {
      code(nextStatusCode: number) {
        statusCode = nextStatusCode;
        return reply;
      },
      status(nextStatusCode: number) {
        statusCode = nextStatusCode;
        return reply;
      },
      send(payloadToSend: unknown) {
        sentPayload = payloadToSend;
        wasSent = true;
        return payloadToSend;
      },
    };

    const result = await route.handler(
      {
        body: payload,
        headers: options?.headers,
      },
      reply,
    );

    if (wasSent) {
      return {
        statusCode,
        body: sentPayload,
      };
    }

    return {
      statusCode,
      body: result,
    };
  } catch {
    return {
      statusCode: 500,
    };
  }
}

describe('gateway HTTP contract/runtime', () => {
  async function createHarness(options?: { internalToken?: string }) {
    const repository = new InMemoryGatewayRepository();
    await repository.init();
    const queue = new InMemoryGatewayQueue();
    await queue.init();

    const service = createGatewayService(repository, queue);
    const playbookId = (await service.listPlaybooks())[0]?.id ?? 'missing-playbook';
    const seededRun =
      (await service.runPlaybook(
        playbookId,
        { executionMode: 'dry-run' },
        'tester',
        'vitest',
      )) || null;
    const seededCommandRun = await service.executeWorkflowCommandChain({
      chain: 'triage -> open-review',
      actorId: 'tester',
      sourceSurface: 'vitest',
      options: {
        executionMode: 'live',
        guardrailProfile: 'strict',
        rollbackOnFailure: false,
      },
    });
    const laneId = (await service.listDelegateLanes())[0]?.id ?? 'missing-lane';
    const branch = await service.createScenarioBranch({
      name: 'Seed Branch',
      notes: 'for contract runtime tests',
    });

    const app = createCapturedApp();

    await registerLedgerRoutes(app.prefixed('/ledger/v1') as never, service);
    await registerWorkflowRoutes(app.prefixed('/workflow/v1') as never, service, {
      internalToken: options?.internalToken,
    });
    await registerFocusRoutes(app.prefixed('/focus/v1') as never, service);
    await registerScenarioRoutes(app.prefixed('/scenario/v1') as never, service);
    await registerDelegateRoutes(app.prefixed('/delegate/v1') as never, service);
    await registerPolicyRoutes(app.prefixed('/policy/v1') as never, service);
    await registerIntelligenceRoutes(app.prefixed('/intelligence/v1') as never, service);

    const seeds: RuntimeSeeds = {
      playbookId,
      playbookRunId: seededRun?.id || 'missing-playbook-run',
      commandRunId: seededCommandRun.id,
      laneId,
      branchId: branch.id,
    };

    return { app, seeds };
  }

  it('mounts every RPC registry endpoint and avoids 404/5xx for valid payloads', async () => {
    const { app, seeds } = await createHarness();

    for (const entry of rpcRegistry) {
      const payload = payloadFor(entry.service, entry.rpc, seeds);
      const response = await invoke(app, entry.method, entry.path, payload);
      expect(response.statusCode).not.toBe(404);
      expect(response.statusCode).toBeLessThan(500);
    }
  });

  it('returns 400 when required envelope is missing', async () => {
    const { app, seeds } = await createHarness();

    for (const entry of rpcRegistry.filter(item => item.requiresEnvelope)) {
      const payload = payloadFor(entry.service, entry.rpc, seeds) as
        | Record<string, unknown>
        | undefined;

      if (!payload) {
        continue;
      }

      const { envelope: _envelope, ...withoutEnvelope } = payload;
      const response = await invoke(app, entry.method, entry.path, withoutEnvelope);

      expect(response.statusCode).toBe(400);
    }
  });

  it('returns 404 for missing resource IDs on mutation endpoints', async () => {
    const { app } = await createHarness();

    const shared = {
      envelope: envelope(),
      laneId: 'missing-lane-id',
      branchId: 'missing-branch-id',
      playbookId: 'missing-playbook-id',
      mutationKind: 'amount-adjust',
      payload: {},
    };

    const runPlaybook = await invoke(app, 'POST', '/workflow/v1/run-playbook', {
      envelope: shared.envelope,
      playbookId: shared.playbookId,
      executionMode: 'dry-run',
    });
    expect(runPlaybook.statusCode).toBe(404);

    const replayPlaybookRun = await invoke(
      app,
      'POST',
      '/workflow/v1/replay-playbook-run',
      {
        envelope: shared.envelope,
        runId: 'missing-run-id',
      },
    );
    expect(replayPlaybookRun.statusCode).toBe(404);

    const rollbackPlaybookRun = await invoke(
      app,
      'POST',
      '/workflow/v1/rollback-playbook-run',
      {
        envelope: shared.envelope,
        runId: 'missing-run-id',
      },
    );
    expect(rollbackPlaybookRun.statusCode).toBe(404);

    const rollbackCommandRun = await invoke(
      app,
      'POST',
      '/workflow/v1/rollback-command-run',
      {
        envelope: shared.envelope,
        runId: 'missing-run-id',
      },
    );
    expect(rollbackCommandRun.statusCode).toBe(404);

    const applyMutation = await invoke(app, 'POST', '/scenario/v1/apply-mutation', {
      envelope: shared.envelope,
      branchId: shared.branchId,
      mutationKind: shared.mutationKind,
      payload: shared.payload,
    });
    expect(applyMutation.statusCode).toBe(404);

    const adoptBranch = await invoke(app, 'POST', '/scenario/v1/adopt-branch', {
      envelope: shared.envelope,
      branchId: shared.branchId,
    });
    expect(adoptBranch.statusCode).toBe(404);

    const acceptLane = await invoke(app, 'POST', '/delegate/v1/accept-lane', {
      envelope: shared.envelope,
      laneId: shared.laneId,
    });
    expect(acceptLane.statusCode).toBe(404);

    const commentLane = await invoke(app, 'POST', '/delegate/v1/comment-lane', {
      envelope: shared.envelope,
      laneId: shared.laneId,
      message: 'missing lane',
    });
    expect(commentLane.statusCode).toBe(404);
  });

  it('validates execution option bounds for workflow runs', async () => {
    const { app, seeds } = await createHarness();

    const invalidRollbackWindow = await invoke(
      app,
      'POST',
      '/workflow/v1/run-playbook',
      {
        envelope: envelope(),
        playbookId: seeds.playbookId,
        executionMode: 'live',
        rollbackWindowMinutes: 0,
      },
    );
    expect(invalidRollbackWindow.statusCode).toBe(400);

    const invalidIdempotency = await invoke(
      app,
      'POST',
      '/workflow/v1/execute-chain',
      {
        envelope: envelope(),
        chain: 'triage -> open-review',
        executionMode: 'live',
        idempotencyKey: 'short',
      },
    );
    expect(invalidIdempotency.statusCode).toBe(400);
  });

  it('returns command run history after execute-chain calls', async () => {
    const { app } = await createHarness();

    const execute = await invoke(app, 'POST', '/workflow/v1/execute-chain', {
      envelope: envelope(),
      chain: 'triage -> open-review',
      assignee: 'delegate',
    });
    expect(execute.statusCode).toBe(200);

    const history = await invoke(app, 'GET', '/workflow/v1/command-runs');
    expect(history.statusCode).toBe(200);
    expect(Array.isArray(history.body)).toBe(true);
    expect((history.body as Array<{ chain: string }>)[0]?.chain).toBeTruthy();
  });

  it('supports filtered command run queries via workflow RPC', async () => {
    const { app } = await createHarness();

    await invoke(app, 'POST', '/workflow/v1/execute-chain', {
      envelope: envelope(),
      chain: 'open-review',
      executionMode: 'live',
    });

    await invoke(app, 'POST', '/workflow/v1/execute-chain', {
      envelope: {
        ...envelope(),
        actorId: 'delegate',
        sourceSurface: 'desktop-client',
      },
      chain: 'triage -> open-review',
      executionMode: 'dry-run',
    });

    const filtered = await invoke(app, 'POST', '/workflow/v1/list-command-runs', {
      limit: 10,
      actorId: 'delegate',
      executionMode: 'dry-run',
    });

    expect(filtered.statusCode).toBe(200);
    expect(Array.isArray(filtered.body)).toBe(true);
    const runs = filtered.body as Array<{ actorId: string; executionMode: string }>;
    expect(runs.length).toBeGreaterThan(0);
    expect(runs.every(run => run.actorId === 'delegate')).toBe(true);
    expect(runs.every(run => run.executionMode === 'dry-run')).toBe(true);
  });

  it('returns paginated ops activity with stable cursor semantics', async () => {
    const { app } = await createHarness();

    await invoke(app, 'POST', '/workflow/v1/execute-chain', {
      envelope: envelope(),
      chain: 'triage -> open-review',
      executionMode: 'live',
    });
    await invoke(app, 'POST', '/workflow/v1/execute-chain', {
      envelope: envelope(),
      chain: 'unknown-command-token',
      executionMode: 'live',
    });
    await invoke(app, 'POST', '/workflow/v1/run-close-routine', {
      envelope: envelope(),
      period: 'weekly',
    });

    const firstPage = await invoke(app, 'POST', '/workflow/v1/list-ops-activity', {
      limit: 2,
    });
    expect(firstPage.statusCode).toBe(200);

    const firstBody = firstPage.body as {
      events: Array<{ id: string }>;
      nextCursor?: string;
    };
    expect(Array.isArray(firstBody.events)).toBe(true);
    expect(firstBody.events.length).toBe(2);
    expect(typeof firstBody.nextCursor).toBe('string');

    const secondPage = await invoke(app, 'POST', '/workflow/v1/list-ops-activity', {
      limit: 2,
      cursor: firstBody.nextCursor,
    });
    expect(secondPage.statusCode).toBe(200);
    const secondBody = secondPage.body as {
      events: Array<{ id: string }>;
    };
    expect(secondBody.events.length).toBeGreaterThan(0);

    const firstIds = new Set(firstBody.events.map(event => event.id));
    expect(secondBody.events.some(event => firstIds.has(event.id))).toBe(false);
  });

  it('exposes runtime metrics and ops activity maintenance controls', async () => {
    const { app } = await createHarness();

    const metrics = await invoke(app, 'GET', '/workflow/v1/runtime-metrics');
    expect(metrics.statusCode).toBe(200);
    const metricsBody = metrics.body as {
      repositoryKind: string;
      queueKind: string;
      opsActivityEvents: number;
      workerFingerprintClaimEvents: number;
    };
    expect(typeof metricsBody.repositoryKind).toBe('string');
    expect(typeof metricsBody.queueKind).toBe('string');
    expect(typeof metricsBody.opsActivityEvents).toBe('number');
    expect(typeof metricsBody.workerFingerprintClaimEvents).toBe('number');

    const backfill = await invoke(app, 'POST', '/workflow/v1/backfill-ops-activity', {
      limitPerPlane: 200,
    });
    expect(backfill.statusCode).toBe(200);
    const backfillBody = backfill.body as { attempted: number; total: number };
    expect(backfillBody.attempted).toBeGreaterThan(0);
    expect(backfillBody.total).toBeGreaterThan(0);

    const maintenance = await invoke(
      app,
      'POST',
      '/workflow/v1/run-ops-activity-maintenance',
      {
        retentionDays: 365,
        maxRows: 5,
      },
    );
    expect(maintenance.statusCode).toBe(200);
    const maintenanceBody = maintenance.body as { removed: number; total: number };
    expect(typeof maintenanceBody.removed).toBe('number');
    expect(maintenanceBody.total).toBeLessThanOrEqual(5);

    const startPipeline = await invoke(
      app,
      'POST',
      '/workflow/v1/start-ops-activity-pipeline',
      {
        runBackfill: true,
        runMaintenance: true,
        waitForCompletion: false,
      },
    );
    expect(startPipeline.statusCode).toBe(200);

    const startBody = startPipeline.body as { started: boolean };
    expect(typeof startBody.started).toBe('boolean');

    const pipelineStatus = await invoke(
      app,
      'GET',
      '/workflow/v1/ops-activity-pipeline-status',
    );
    expect(pipelineStatus.statusCode).toBe(200);
    const pipelineBody = pipelineStatus.body as {
      orchestrator: { runCount: number; running: boolean };
    };
    expect(typeof pipelineBody.orchestrator.runCount).toBe('number');
    expect(typeof pipelineBody.orchestrator.running).toBe('boolean');
  });

  it('supports queue claim, ack, and expired requeue controls', async () => {
    const { app } = await createHarness();

    await invoke(app, 'POST', '/workflow/v1/execute-chain', {
      envelope: envelope(),
      chain: 'close -> weekly',
      executionMode: 'live',
    });

    const claimed = await invoke(app, 'POST', '/workflow/v1/claim-queue-jobs', {
      workerId: 'worker-http',
      maxJobs: 10,
      visibilityTimeoutMs: 10_000,
    });
    expect(claimed.statusCode).toBe(200);
    const claimedBody = claimed.body as {
      jobs: Array<{ receipt: string }>;
    };
    expect(claimedBody.jobs.length).toBeGreaterThan(0);

    const firstReceipt = claimedBody.jobs[0]?.receipt;
    expect(typeof firstReceipt).toBe('string');
    if (!firstReceipt) {
      return;
    }

    const acked = await invoke(app, 'POST', '/workflow/v1/ack-queue-job', {
      workerId: 'worker-http',
      receipt: firstReceipt,
      success: true,
    });
    expect(acked.statusCode).toBe(200);
    const ackedBody = acked.body as { acknowledged: boolean; action: string };
    expect(ackedBody.acknowledged).toBe(true);
    expect(ackedBody.action).toBe('acked');

    const claimedFingerprint = await invoke(
      app,
      'POST',
      '/workflow/v1/claim-worker-job-fingerprint',
      {
        workerId: 'worker-http',
        fingerprint: 'http-fingerprint-claim',
        ttlMs: 5_000,
      },
    );
    expect(claimedFingerprint.statusCode).toBe(200);
    const claimedFingerprintBody = claimedFingerprint.body as { status: string };
    expect(claimedFingerprintBody.status).toBe('acquired');

    const fingerprintCheck = await invoke(
      app,
      'POST',
      '/workflow/v1/check-worker-job-fingerprint',
      {
        fingerprint: 'http-check-fp',
      },
    );
    expect(fingerprintCheck.statusCode).toBe(200);
    const fingerprintBody = fingerprintCheck.body as { alreadyProcessed: boolean };
    expect(fingerprintBody.alreadyProcessed).toBe(false);

    const requeueExpired = await invoke(
      app,
      'POST',
      '/workflow/v1/requeue-expired-queue-jobs',
      {
        limit: 100,
      },
    );
    expect(requeueExpired.statusCode).toBe(200);
    const requeueBody = requeueExpired.body as { moved: number };
    expect(typeof requeueBody.moved).toBe('number');
  });

  it('enforces internal token on queue control endpoints when configured', async () => {
    const { app } = await createHarness({ internalToken: 'internal-secret' });

    const unauthorized = await invoke(app, 'POST', '/workflow/v1/claim-queue-jobs', {
      workerId: 'worker-http',
      maxJobs: 1,
      visibilityTimeoutMs: 5_000,
    });
    expect(unauthorized.statusCode).toBe(401);

    const authorized = await invoke(
      app,
      'POST',
      '/workflow/v1/claim-queue-jobs',
      {
        workerId: 'worker-http',
        maxJobs: 1,
        visibilityTimeoutMs: 5_000,
      },
      {
        headers: {
          'x-finance-internal-token': 'internal-secret',
        },
      },
    );
    expect(authorized.statusCode).toBe(200);

    const unauthorizedReplay = await invoke(
      app,
      'POST',
      '/workflow/v1/replay-worker-dead-letters',
      {
        limit: 5,
      },
    );
    expect(unauthorizedReplay.statusCode).toBe(401);

    const unauthorizedHealth = await invoke(
      app,
      'POST',
      '/workflow/v1/worker-queue-health',
      {
        windowMs: 3_600_000,
      },
    );
    expect(unauthorizedHealth.statusCode).toBe(401);

    const unauthorizedClaimFingerprint = await invoke(
      app,
      'POST',
      '/workflow/v1/claim-worker-job-fingerprint',
      {
        workerId: 'worker-http',
        fingerprint: 'unauthorized-claim',
      },
    );
    expect(unauthorizedClaimFingerprint.statusCode).toBe(401);

    const unauthorizedFingerprintCheck = await invoke(
      app,
      'POST',
      '/workflow/v1/check-worker-job-fingerprint',
      {
        fingerprint: 'unauthorized-test',
      },
    );
    expect(unauthorizedFingerprintCheck.statusCode).toBe(401);

    const unauthorizedAcquireLease = await invoke(
      app,
      'POST',
      '/workflow/v1/acquire-worker-queue-lease',
      {
        workerId: 'worker-http',
        ttlMs: 15_000,
      },
    );
    expect(unauthorizedAcquireLease.statusCode).toBe(401);

    const unauthorizedReleaseLease = await invoke(
      app,
      'POST',
      '/workflow/v1/release-worker-queue-lease',
      {
        workerId: 'worker-http',
      },
    );
    expect(unauthorizedReleaseLease.statusCode).toBe(401);

    const unauthorizedResolveDeadLetter = await invoke(
      app,
      'POST',
      '/workflow/v1/resolve-worker-dead-letter',
      {
        deadLetterId: 'dead-letter-id',
      },
    );
    expect(unauthorizedResolveDeadLetter.statusCode).toBe(401);

    const unauthorizedReopenDeadLetter = await invoke(
      app,
      'POST',
      '/workflow/v1/reopen-worker-dead-letter',
      {
        deadLetterId: 'dead-letter-id',
      },
    );
    expect(unauthorizedReopenDeadLetter.statusCode).toBe(401);
  });

  it('returns 409 for invalid delegate status transitions', async () => {
    const { app, seeds } = await createHarness();

    const invalidTransition = await invoke(app, 'POST', '/delegate/v1/complete-lane', {
      envelope: envelope(),
      laneId: seeds.laneId,
    });

    expect(invalidTransition.statusCode).toBe(409);
  });

  it('returns 409 for blocked scenario adoption unless forced', async () => {
    const { app, seeds } = await createHarness();

    const mutation = await invoke(app, 'POST', '/scenario/v1/apply-mutation', {
      envelope: envelope(),
      branchId: seeds.branchId,
      mutationKind: 'manual-adjustment',
      payload: {
        amountDelta: -2500,
        riskDelta: 12,
      },
    });
    expect(mutation.statusCode).toBe(200);

    const blockedAdopt = await invoke(app, 'POST', '/scenario/v1/adopt-branch', {
      envelope: envelope(),
      branchId: seeds.branchId,
      force: false,
    });
    expect(blockedAdopt.statusCode).toBe(409);

    const forcedAdopt = await invoke(app, 'POST', '/scenario/v1/adopt-branch', {
      envelope: envelope(),
      branchId: seeds.branchId,
      force: true,
    });
    expect(forcedAdopt.statusCode).toBe(200);
  });
});

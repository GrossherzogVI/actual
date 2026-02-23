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
  laneId: string;
  branchId: string;
};

type CapturedRoute = {
  method: 'GET' | 'POST';
  path: string;
  handler: (
    request?: { body?: unknown },
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
    dryRun: true,
    period: 'weekly',
    ids: ['id-1'],
    status: 'accepted',
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
  } as const;

  if (service === 'workflow.v1' && rpc === 'GetMoneyPulse') {
    return undefined;
  }

  if (service === 'focus.v1' && rpc === 'GetAdaptivePanel') {
    return undefined;
  }

  if (service === 'policy.v1' && rpc === 'GetEgressPolicy') {
    return undefined;
  }

  return { ...base };
}

async function invoke(
  app: CapturedApp,
  method: 'GET' | 'POST',
  path: string,
  payload?: unknown,
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

    const result = await route.handler({ body: payload }, reply);

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
  async function createHarness() {
    const repository = new InMemoryGatewayRepository();
    await repository.init();
    const queue = new InMemoryGatewayQueue();
    await queue.init();

    const service = createGatewayService(repository, queue);
    const playbookId = (await service.listPlaybooks())[0]?.id ?? 'missing-playbook';
    const laneId = (await service.listDelegateLanes())[0]?.id ?? 'missing-lane';
    const branch = await service.createScenarioBranch({
      name: 'Seed Branch',
      notes: 'for contract runtime tests',
    });

    const app = createCapturedApp();

    await registerLedgerRoutes(app.prefixed('/ledger/v1') as never, service);
    await registerWorkflowRoutes(app.prefixed('/workflow/v1') as never, service);
    await registerFocusRoutes(app.prefixed('/focus/v1') as never, service);
    await registerScenarioRoutes(app.prefixed('/scenario/v1') as never, service);
    await registerDelegateRoutes(app.prefixed('/delegate/v1') as never, service);
    await registerPolicyRoutes(app.prefixed('/policy/v1') as never, service);
    await registerIntelligenceRoutes(app.prefixed('/intelligence/v1') as never, service);

    const seeds: RuntimeSeeds = {
      playbookId,
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
      dryRun: true,
    });
    expect(runPlaybook.statusCode).toBe(404);

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
});

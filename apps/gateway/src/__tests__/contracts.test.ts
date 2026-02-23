import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createCommandEnvelope } from '@finance-os/domain-kernel';
import { describe, expect, it } from 'vitest';

import { findRpcRegistryEntry, rpcRegistry } from '../contracts/rpc-registry';
import { hasCommandEnvelope } from '../validation/envelope';

const protoRoot = join(process.cwd(), 'packages/contracts/proto');

function listProtoFiles() {
  return [
    'ledger/v1/ledger.proto',
    'workflow/v1/workflow.proto',
    'scenario/v1/scenario.proto',
    'focus/v1/focus.proto',
    'delegate/v1/delegate.proto',
    'policy/v1/policy.proto',
    'intelligence/v1/intelligence.proto',
  ];
}

function parseServiceAndRpcs(protoContents: string) {
  const packageMatch = protoContents.match(/package\s+([\w.]+);/);
  const packageName = packageMatch?.[1] || '';

  const serviceMatch = protoContents.match(/service\s+(\w+)\s*\{/);
  const serviceName = serviceMatch?.[1] || '';

  const service = packageName
    .replace('financeos.', '')
    .replace(/\.v\d+$/, '.v1');

  const rpcMatches = [...protoContents.matchAll(/rpc\s+(\w+)\s*\(/g)].map(
    match => match[1],
  );

  if (serviceName === '') {
    throw new Error(`Unable to parse service declaration in proto:\n${protoContents}`);
  }

  return {
    service,
    rpcs: rpcMatches,
  };
}

function mockEnvelope() {
  return createCommandEnvelope({
    commandId: 'cmd-contract-test',
    actorId: 'tester',
    tenantId: 'tenant-1',
    workspaceId: 'workspace-1',
    intent: 'contract-test',
    workflowId: 'workflow-1',
    sourceSurface: 'test-suite',
    confidenceContext: {
      score: 0.9,
      rationale: 'contract-validation',
    },
  });
}

describe('proto to endpoint contract registry', () => {
  it('covers every RPC declared in proto files', () => {
    const missing: string[] = [];

    for (const relativeProtoFile of listProtoFiles()) {
      const contents = readFileSync(join(protoRoot, relativeProtoFile), 'utf-8');
      const parsed = parseServiceAndRpcs(contents);

      for (const rpc of parsed.rpcs) {
        const entry = findRpcRegistryEntry(parsed.service, rpc);
        if (!entry) {
          missing.push(`${parsed.service}.${rpc}`);
        }
      }
    }

    expect(missing).toEqual([]);
  });

  it('assigns method and path for every registered RPC', () => {
    for (const entry of rpcRegistry) {
      expect(entry.method === 'GET' || entry.method === 'POST').toBe(true);
      expect(entry.path.startsWith('/')).toBe(true);
      expect(entry.path.includes(`/${entry.service.split('.')[0]}/v1/`)).toBe(true);
    }
  });
});

describe('command envelope enforcement', () => {
  it('requires envelope for marked RPC schemas', () => {
    for (const entry of rpcRegistry.filter(item => item.requiresEnvelope)) {
      expect(entry.requestSchema).toBeDefined();
      expect(hasCommandEnvelope(entry.requestSchema)).toBe(true);
    }
  });

  it('accepts valid envelope for all envelope-required schemas', () => {
    for (const entry of rpcRegistry.filter(item => item.requiresEnvelope)) {
      const schema = entry.requestSchema;
      expect(schema).toBeDefined();
      if (!schema) {
        continue;
      }

      const candidate = {
        envelope: mockEnvelope(),
        commandType: 'generic-command',
        aggregateId: 'agg-1',
        aggregateType: 'workflow',
        payload: {},
        name: 'x',
        description: '',
        commands: [],
        playbookId: 'playbook-1',
        dryRun: true,
        period: 'weekly',
        ids: ['id-1'],
        status: 'accepted',
        resolvedAction: 'batch-policy',
        chain: 'triage -> close-weekly',
        actionId: 'action-1',
        outcome: 'done',
        branchId: 'branch-1',
        mutationKind: 'update',
        assignedBy: 'owner',
        assignee: 'delegate',
        title: 'lane',
        laneId: 'lane-1',
        policy: {
          allowCloud: false,
          allowedProviders: [],
          redactionMode: 'strict',
        },
        recommendation: {
          id: 'rec-1',
          title: 'x',
          confidence: 0.8,
          provenance: 'engine',
          expectedImpact: 'impact',
          reversible: true,
          rationale: 'why',
        },
        payee: 'Rewe',
        months: 6,
        input: {},
        correctOutput: {},
      };

      expect(schema.safeParse(candidate).success).toBe(true);
    }
  });

  it('rejects missing envelope for all envelope-required schemas', () => {
    for (const entry of rpcRegistry.filter(item => item.requiresEnvelope)) {
      const schema = entry.requestSchema;
      expect(schema).toBeDefined();
      if (!schema) {
        continue;
      }

      const result = schema.safeParse({});
      expect(result.success).toBe(false);
    }
  });
});

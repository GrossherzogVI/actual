import type { GatewayRepository } from '../repositories/types';
import type { EgressAuditEntry, EgressPolicy, OpsActivityEvent } from '../types';

import { nanoid, toPolicyActivity } from './helpers';

export type PolicyDeps = {
  appendOpsActivityEvent: (event: OpsActivityEvent) => Promise<void>;
};

export function createPolicyService(
  repository: GatewayRepository,
  deps: PolicyDeps,
) {
  async function getEgressPolicy(): Promise<EgressPolicy> {
    return repository.getEgressPolicy();
  }

  async function setEgressPolicy(policy: EgressPolicy): Promise<EgressPolicy> {
    const updatedPolicy = await repository.setEgressPolicy(policy);

    await recordEgressAudit({
      eventType: 'policy-updated',
      payload: {
        allowCloud: updatedPolicy.allowCloud,
        allowedProviders: updatedPolicy.allowedProviders,
        redactionMode: updatedPolicy.redactionMode,
      },
    });

    return updatedPolicy;
  }

  async function listEgressAudit(limit: number): Promise<EgressAuditEntry[]> {
    return repository.listEgressAudit(limit);
  }

  async function recordEgressAudit(input: {
    eventType: string;
    provider?: string;
    payload?: Record<string, unknown>;
  }): Promise<EgressAuditEntry> {
    const entry = await repository.recordEgressAudit({
      id: nanoid(),
      eventType: input.eventType,
      provider: input.provider,
      payload: input.payload,
      createdAtMs: Date.now(),
    });
    await deps.appendOpsActivityEvent(toPolicyActivity(entry));

    return entry;
  }

  return {
    getEgressPolicy,
    setEgressPolicy,
    listEgressAudit,
    recordEgressAudit,
  };
}

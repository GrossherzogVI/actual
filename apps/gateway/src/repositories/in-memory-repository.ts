import { customAlphabet } from 'nanoid';

import type {
  CloseRun,
  Correction,
  DelegateLane,
  EgressAuditEntry,
  EgressPolicy,
  LedgerEvent,
  OpsState,
  PlaybookRun,
  ScenarioBranch,
  ScenarioMutation,
  WorkflowPlaybook,
} from '../types';

import type { GatewayRepository } from './types';

const nanoid = customAlphabet('1234567890abcdefghijklmnopqrstuvwxyz', 16);

export class InMemoryGatewayRepository implements GatewayRepository {
  readonly kind = 'memory' as const;

  private readonly playbooks = new Map<string, WorkflowPlaybook>();
  private readonly playbookRuns = new Map<string, PlaybookRun>();
  private readonly closeRuns = new Map<string, CloseRun>();

  private readonly scenarioBranches = new Map<string, ScenarioBranch>();
  private readonly scenarioMutations = new Map<string, ScenarioMutation[]>();

  private readonly delegateLanes = new Map<string, DelegateLane>();
  private readonly actionOutcomes = new Map<string, Record<string, unknown>>();

  private readonly egressAudit: EgressAuditEntry[] = [];
  private readonly corrections = new Map<string, Correction>();
  private readonly ledgerEvents: LedgerEvent[] = [];

  private opsState: OpsState = {
    pendingReviews: 7,
    urgentReviews: 2,
    expiringContracts: 4,
    updatedAtMs: Date.now(),
  };

  private egressPolicy: EgressPolicy = {
    allowCloud: false,
    allowedProviders: [],
    redactionMode: 'strict',
  };

  async init(): Promise<void> {
    const now = Date.now();
    const initialPlaybook: WorkflowPlaybook = {
      id: nanoid(),
      name: 'Weekly Compression',
      description: 'Resolve urgent queue, scan expiring contracts, run weekly close.',
      commands: [
        { verb: 'resolve-next-action', lane: 'triage' },
        { verb: 'open-expiring-contracts', windowDays: 30 },
        { verb: 'run-close', period: 'weekly' },
      ],
      createdAtMs: now,
      updatedAtMs: now,
    };
    this.playbooks.set(initialPlaybook.id, initialPlaybook);

    const defaultLane: DelegateLane = {
      id: nanoid(),
      title: 'Re-negotiate mobile contract',
      status: 'assigned',
      assignee: 'assistant',
      assignedBy: 'owner',
      payload: { contractId: 'mobile-1', deadline: '2026-03-05' },
      createdAtMs: now,
      updatedAtMs: now,
    };
    this.delegateLanes.set(defaultLane.id, defaultLane);
  }

  async close(): Promise<void> {
    return;
  }

  async getOpsState(): Promise<OpsState> {
    return { ...this.opsState };
  }

  async setOpsState(state: Partial<OpsState>): Promise<OpsState> {
    this.opsState = {
      ...this.opsState,
      ...state,
      updatedAtMs: Date.now(),
    };
    return { ...this.opsState };
  }

  async listPlaybooks(): Promise<WorkflowPlaybook[]> {
    return [...this.playbooks.values()].sort((a, b) => b.updatedAtMs - a.updatedAtMs);
  }

  async getPlaybookById(playbookId: string): Promise<WorkflowPlaybook | null> {
    return this.playbooks.get(playbookId) || null;
  }

  async createPlaybook(input: {
    id: string;
    name: string;
    description: string;
    commands: Array<Record<string, unknown>>;
    createdAtMs: number;
  }): Promise<WorkflowPlaybook> {
    const created: WorkflowPlaybook = {
      id: input.id,
      name: input.name,
      description: input.description,
      commands: input.commands,
      createdAtMs: input.createdAtMs,
      updatedAtMs: input.createdAtMs,
    };
    this.playbooks.set(created.id, created);
    return created;
  }

  async createPlaybookRun(run: PlaybookRun): Promise<PlaybookRun> {
    this.playbookRuns.set(run.id, run);
    return run;
  }

  async createCloseRun(run: CloseRun): Promise<CloseRun> {
    this.closeRuns.set(run.id, run);
    return run;
  }

  async listScenarioBranches(): Promise<ScenarioBranch[]> {
    return [...this.scenarioBranches.values()].sort(
      (a, b) => b.updatedAtMs - a.updatedAtMs,
    );
  }

  async getScenarioBranchById(branchId: string): Promise<ScenarioBranch | null> {
    return this.scenarioBranches.get(branchId) || null;
  }

  async createScenarioBranch(branch: ScenarioBranch): Promise<ScenarioBranch> {
    this.scenarioBranches.set(branch.id, branch);
    if (!this.scenarioMutations.has(branch.id)) {
      this.scenarioMutations.set(branch.id, []);
    }
    return branch;
  }

  async addScenarioMutation(
    mutation: ScenarioMutation,
  ): Promise<ScenarioMutation | null> {
    const branch = this.scenarioBranches.get(mutation.branchId);
    if (!branch) return null;

    const list = this.scenarioMutations.get(mutation.branchId) || [];
    list.push(mutation);
    this.scenarioMutations.set(mutation.branchId, list);

    this.scenarioBranches.set(branch.id, {
      ...branch,
      updatedAtMs: Date.now(),
    });

    return mutation;
  }

  async listScenarioMutations(branchId: string): Promise<ScenarioMutation[]> {
    return [...(this.scenarioMutations.get(branchId) || [])];
  }

  async adoptScenarioBranch(
    branchId: string,
    adoptedAtMs: number,
  ): Promise<ScenarioBranch | null> {
    const branch = this.scenarioBranches.get(branchId);
    if (!branch) return null;

    const updated: ScenarioBranch = {
      ...branch,
      status: 'adopted',
      adoptedAtMs,
      updatedAtMs: adoptedAtMs,
    };

    this.scenarioBranches.set(branchId, updated);
    return updated;
  }

  async listDelegateLanes(): Promise<DelegateLane[]> {
    return [...this.delegateLanes.values()].sort((a, b) => b.updatedAtMs - a.updatedAtMs);
  }

  async getDelegateLaneById(laneId: string): Promise<DelegateLane | null> {
    return this.delegateLanes.get(laneId) || null;
  }

  async createDelegateLane(lane: DelegateLane): Promise<DelegateLane> {
    this.delegateLanes.set(lane.id, lane);
    return lane;
  }

  async updateDelegateLane(lane: DelegateLane): Promise<DelegateLane> {
    this.delegateLanes.set(lane.id, lane);
    return lane;
  }

  async recordActionOutcome(input: {
    id: string;
    actionId: string;
    outcome: string;
    notes?: string;
    recordedAtMs: number;
  }): Promise<Record<string, unknown>> {
    const outcome = {
      id: input.id,
      actionId: input.actionId,
      outcome: input.outcome,
      notes: input.notes,
      recordedAtMs: input.recordedAtMs,
    };
    this.actionOutcomes.set(input.id, outcome);
    return outcome;
  }

  async getEgressPolicy(): Promise<EgressPolicy> {
    return { ...this.egressPolicy, allowedProviders: [...this.egressPolicy.allowedProviders] };
  }

  async setEgressPolicy(policy: EgressPolicy): Promise<EgressPolicy> {
    this.egressPolicy = {
      ...policy,
      allowedProviders: [...policy.allowedProviders],
    };
    return this.getEgressPolicy();
  }

  async listEgressAudit(limit: number): Promise<EgressAuditEntry[]> {
    return this.egressAudit.slice(0, limit);
  }

  async recordEgressAudit(entry: EgressAuditEntry): Promise<EgressAuditEntry> {
    this.egressAudit.unshift(entry);
    if (this.egressAudit.length > 1000) {
      this.egressAudit.pop();
    }
    return entry;
  }

  async createCorrection(correction: Correction): Promise<Correction> {
    this.corrections.set(correction.id, correction);
    return correction;
  }

  async listCorrections(limit: number): Promise<Correction[]> {
    return [...this.corrections.values()]
      .sort((a, b) => b.createdAtMs - a.createdAtMs)
      .slice(0, limit);
  }

  async appendLedgerEvent(event: LedgerEvent): Promise<LedgerEvent> {
    this.ledgerEvents.push(event);
    return event;
  }

  async streamLedgerEvents(input: {
    workspaceId: string;
    cursor?: string;
    limit: number;
  }): Promise<{ events: LedgerEvent[]; nextCursor?: string }> {
    const all = this.ledgerEvents
      .filter(event => event.workspaceId === input.workspaceId)
      .sort((a, b) => b.occurredAtMs - a.occurredAtMs);

    const start = input.cursor ? Number(input.cursor) : 0;
    const slice = all.slice(start, start + input.limit);
    const nextCursor = start + slice.length < all.length ? String(start + slice.length) : undefined;

    return {
      events: slice,
      nextCursor,
    };
  }
}

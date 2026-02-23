import { customAlphabet } from 'nanoid';

import {
  rankRecommendations,
  type Recommendation,
} from '@finance-os/domain-kernel';
import { InMemoryEventStore } from '@finance-os/event-model';

const nanoid = customAlphabet('1234567890abcdefghijklmnopqrstuvwxyz', 16);

export type WorkflowPlaybook = {
  id: string;
  name: string;
  description: string;
  commands: Array<Record<string, unknown>>;
  createdAtMs: number;
  updatedAtMs: number;
};

export type WorkflowAction = {
  id: string;
  title: string;
  route: string;
  confidence: number;
};

export type ScenarioBranch = {
  id: string;
  name: string;
  status: 'draft' | 'adopted';
  baseBranchId?: string;
  notes?: string;
  mutations: Array<{
    id: string;
    kind: string;
    payload: Record<string, unknown>;
    createdAtMs: number;
  }>;
  createdAtMs: number;
  updatedAtMs: number;
  adoptedAtMs?: number;
};

export type DelegateLane = {
  id: string;
  title: string;
  status: 'assigned' | 'accepted' | 'completed' | 'rejected';
  assignee: string;
  assignedBy: string;
  payload: Record<string, unknown>;
  createdAtMs: number;
  updatedAtMs: number;
  acceptedAtMs?: number;
  completedAtMs?: number;
  rejectedAtMs?: number;
};

export type EgressPolicy = {
  allowCloud: boolean;
  allowedProviders: string[];
  redactionMode: 'strict' | 'balanced' | 'off';
};

export type EgressAuditEntry = {
  id: string;
  eventType: string;
  provider?: string;
  payload?: Record<string, unknown>;
  createdAtMs: number;
};

export type FocusAction = {
  id: string;
  title: string;
  route: string;
  score: number;
  reason: string;
};

export class GatewayState {
  readonly eventStore = new InMemoryEventStore();

  readonly playbooks = new Map<string, WorkflowPlaybook>();
  readonly playbookRuns = new Map<string, Record<string, unknown>>();
  readonly closeRuns = new Map<string, Record<string, unknown>>();

  readonly scenarioBranches = new Map<string, ScenarioBranch>();
  readonly delegateLanes = new Map<string, DelegateLane>();
  readonly actionOutcomes = new Map<string, Record<string, unknown>>();
  readonly corrections = new Map<string, Record<string, unknown>>();

  egressPolicy: EgressPolicy = {
    allowCloud: false,
    allowedProviders: [],
    redactionMode: 'strict',
  };

  readonly egressAudit: EgressAuditEntry[] = [];

  pendingReviews = 7;
  urgentReviews = 2;
  expiringContracts = 4;

  constructor() {
    this.seed();
  }

  private seed() {
    const now = Date.now();
    const initialPlaybook: WorkflowPlaybook = {
      id: nanoid(),
      name: 'Weekly Compression',
      description: 'Resolve urgent queue, scan expiring contracts, run weekly close.',
      commands: [
        { verb: 'resolve-next-action', lane: 'triage' },
        { verb: 'open-expiring-contracts', window_days: 30 },
        { verb: 'run-close', period: 'weekly' },
      ],
      createdAtMs: now,
      updatedAtMs: now,
    };
    this.playbooks.set(initialPlaybook.id, initialPlaybook);

    const delegateLane: DelegateLane = {
      id: nanoid(),
      title: 'Re-negotiate mobile contract',
      status: 'assigned',
      assignee: 'assistant',
      assignedBy: 'owner',
      payload: { contractId: 'mobile-1', deadline: '2026-03-05' },
      createdAtMs: now,
      updatedAtMs: now,
    };
    this.delegateLanes.set(delegateLane.id, delegateLane);
  }

  createPlaybook(input: {
    name: string;
    description: string;
    commands: Array<Record<string, unknown>>;
  }): WorkflowPlaybook {
    const now = Date.now();
    const playbook: WorkflowPlaybook = {
      id: nanoid(),
      name: input.name,
      description: input.description,
      commands: input.commands,
      createdAtMs: now,
      updatedAtMs: now,
    };
    this.playbooks.set(playbook.id, playbook);
    return playbook;
  }

  listPlaybooks(): WorkflowPlaybook[] {
    return [...this.playbooks.values()].sort((a, b) => b.updatedAtMs - a.updatedAtMs);
  }

  runPlaybook(playbookId: string, dryRun: boolean) {
    const playbook = this.playbooks.get(playbookId);
    if (!playbook) return null;

    const run = {
      id: nanoid(),
      playbookId,
      dryRun,
      executedSteps: playbook.commands.length,
      steps: playbook.commands.map((command, index) => ({
        index,
        command,
        status: 'queued',
      })),
      createdAtMs: Date.now(),
    };

    this.playbookRuns.set(run.id, run);
    return run;
  }

  resolveNextAction(): WorkflowAction {
    if (this.urgentReviews > 0) {
      return {
        id: 'next-urgent-review',
        title: `${this.urgentReviews} urgent review items`,
        route: '/review?priority=urgent',
        confidence: 0.94,
      };
    }

    if (this.expiringContracts > 0) {
      return {
        id: 'next-expiring-contracts',
        title: `${this.expiringContracts} contracts expiring in 30d`,
        route: '/contracts?filter=expiring',
        confidence: 0.89,
      };
    }

    return {
      id: 'next-close-routine',
      title: 'Run weekly close routine',
      route: '/ops',
      confidence: 0.8,
    };
  }

  getFocusActions(): FocusAction[] {
    return [
      {
        id: 'focus-urgent',
        title: 'Clear urgent review queue',
        route: '/review?priority=urgent',
        score: this.urgentReviews * 100,
        reason: 'Urgent decisions block automation confidence.',
      },
      {
        id: 'focus-expiring',
        title: 'Review expiring contracts',
        route: '/contracts?filter=expiring',
        score: this.expiringContracts * 85,
        reason: 'Upcoming renewals define avoidable spend next month.',
      },
      {
        id: 'focus-close',
        title: 'Run weekly close',
        route: '/ops',
        score: Math.max(20, this.pendingReviews * 8),
        reason: 'Close loop compresses operational debt.',
      },
    ]
      .filter(action => action.score > 0)
      .sort((a, b) => b.score - a.score);
  }

  runClose(period: 'weekly' | 'monthly') {
    const run = {
      id: nanoid(),
      period,
      exceptionCount: this.pendingReviews + this.expiringContracts,
      summary: {
        pendingReviews: this.pendingReviews,
        urgentReviews: this.urgentReviews,
        expiringContracts: this.expiringContracts,
      },
      createdAtMs: Date.now(),
    };

    this.closeRuns.set(run.id, run);
    return run;
  }

  applyBatchPolicy(ids: string[], status: string, resolvedAction: string) {
    const updated = Math.min(ids.length, this.pendingReviews);
    this.pendingReviews = Math.max(0, this.pendingReviews - updated);
    this.eventStore.append('review-queue', 'workflow', 'system', 'batch-policy', {
      ids,
      status,
      resolvedAction,
    });
    return { updatedCount: updated };
  }

  createScenarioBranch(input: {
    name: string;
    baseBranchId?: string;
    notes?: string;
  }): ScenarioBranch {
    const now = Date.now();
    const branch: ScenarioBranch = {
      id: nanoid(),
      name: input.name,
      status: 'draft',
      baseBranchId: input.baseBranchId,
      notes: input.notes,
      mutations: [],
      createdAtMs: now,
      updatedAtMs: now,
    };
    this.scenarioBranches.set(branch.id, branch);
    return branch;
  }

  addScenarioMutation(input: {
    branchId: string;
    kind: string;
    payload: Record<string, unknown>;
  }) {
    const branch = this.scenarioBranches.get(input.branchId);
    if (!branch) return null;

    const mutation = {
      id: nanoid(),
      kind: input.kind,
      payload: input.payload,
      createdAtMs: Date.now(),
    };

    branch.mutations.push(mutation);
    branch.updatedAtMs = Date.now();
    this.scenarioBranches.set(branch.id, branch);
    return mutation;
  }

  compareScenarioOutcomes(primaryId: string, againstId?: string) {
    const primary = this.scenarioBranches.get(primaryId);
    if (!primary) return null;

    const against = againstId ? this.scenarioBranches.get(againstId) : undefined;

    const summarize = (branch?: ScenarioBranch) =>
      (branch?.mutations || []).reduce(
        (acc, mutation) => {
          const amount = mutation.payload.amountDelta;
          const risk = mutation.payload.riskDelta;
          acc.amountDelta += typeof amount === 'number' ? amount : 0;
          acc.riskDelta += typeof risk === 'number' ? risk : 0;
          return acc;
        },
        { amountDelta: 0, riskDelta: 0 },
      );

    const primarySummary = summarize(primary);
    const againstSummary = summarize(against);

    return {
      primaryBranchId: primary.id,
      againstBranchId: against?.id,
      primary: primarySummary,
      against: againstSummary,
      diff: {
        amountDelta: primarySummary.amountDelta - againstSummary.amountDelta,
        riskDelta: primarySummary.riskDelta - againstSummary.riskDelta,
      },
    };
  }

  adoptScenarioBranch(branchId: string) {
    const branch = this.scenarioBranches.get(branchId);
    if (!branch) return null;

    branch.status = 'adopted';
    branch.adoptedAtMs = Date.now();
    branch.updatedAtMs = Date.now();
    this.scenarioBranches.set(branch.id, branch);
    return branch;
  }

  assignDelegateLane(input: {
    title: string;
    assignee: string;
    assignedBy: string;
    payload: Record<string, unknown>;
  }): DelegateLane {
    const lane: DelegateLane = {
      id: nanoid(),
      title: input.title,
      status: 'assigned',
      assignee: input.assignee,
      assignedBy: input.assignedBy,
      payload: input.payload,
      createdAtMs: Date.now(),
      updatedAtMs: Date.now(),
    };
    this.delegateLanes.set(lane.id, lane);
    return lane;
  }

  transitionDelegateLane(
    laneId: string,
    status: DelegateLane['status'],
  ): DelegateLane | null {
    const lane = this.delegateLanes.get(laneId);
    if (!lane) return null;

    lane.status = status;
    lane.updatedAtMs = Date.now();
    if (status === 'accepted') lane.acceptedAtMs = Date.now();
    if (status === 'completed') lane.completedAtMs = Date.now();
    if (status === 'rejected') lane.rejectedAtMs = Date.now();

    this.delegateLanes.set(lane.id, lane);
    return lane;
  }

  listDelegateLanes(): DelegateLane[] {
    return [...this.delegateLanes.values()].sort((a, b) => b.updatedAtMs - a.updatedAtMs);
  }

  setEgressPolicy(nextPolicy: EgressPolicy): EgressPolicy {
    this.egressPolicy = nextPolicy;
    this.egressAudit.unshift({
      id: nanoid(),
      eventType: 'policy-updated',
      payload: nextPolicy,
      createdAtMs: Date.now(),
    });
    return this.egressPolicy;
  }

  listEgressAudit(limit = 50): EgressAuditEntry[] {
    return this.egressAudit.slice(0, limit);
  }

  recordEgressAudit(entry: Omit<EgressAuditEntry, 'id' | 'createdAtMs'>): EgressAuditEntry {
    const auditEntry: EgressAuditEntry = {
      id: nanoid(),
      eventType: entry.eventType,
      provider: entry.provider,
      payload: entry.payload,
      createdAtMs: Date.now(),
    };
    this.egressAudit.unshift(auditEntry);
    return auditEntry;
  }

  recommend(): Recommendation[] {
    return rankRecommendations([
      {
        id: 'rec-urgent-review',
        title: 'Prioritize urgent review queue',
        confidence: 0.93,
        provenance: 'focus-engine',
        expectedImpact: 'risk-reduction',
        reversible: true,
        rationale: `${this.urgentReviews} urgent items can trigger direct cashflow mistakes.`,
      },
      {
        id: 'rec-expiring',
        title: 'Handle expiring contracts this week',
        confidence: 0.88,
        provenance: 'contracts-engine',
        expectedImpact: 'cost-avoidance',
        reversible: true,
        rationale: `${this.expiringContracts} contracts are near cancellation windows.`,
      },
      {
        id: 'rec-close',
        title: 'Run weekly close routine',
        confidence: 0.8,
        provenance: 'workflow-engine',
        expectedImpact: 'operational-compression',
        reversible: true,
        rationale: 'Close routine compresses pending work into one action chain.',
      },
    ]);
  }

  explain(recommendation: Recommendation) {
    return {
      explanation:
        `Recommendation ${recommendation.id} is prioritized because confidence is ` +
        `${recommendation.confidence.toFixed(2)} and expected impact is ${recommendation.expectedImpact}. ` +
        `Rationale: ${recommendation.rationale}`,
      confidence: recommendation.confidence,
      reversible: recommendation.reversible,
    };
  }

  classify(payee: string) {
    const lower = payee.toLowerCase();

    if (lower.includes('rewe') || lower.includes('edeka') || lower.includes('aldi')) {
      return { categoryHint: 'lebensmittel.supermarkt', confidence: 0.87 };
    }
    if (lower.includes('bahn') || lower.includes('db')) {
      return { categoryHint: 'mobilitaet.oepnv', confidence: 0.84 };
    }
    if (lower.includes('netflix') || lower.includes('spotify')) {
      return { categoryHint: 'freizeit.streaming', confidence: 0.91 };
    }

    return { categoryHint: 'sonstiges.unkategorisiert', confidence: 0.57 };
  }

  forecast(months: number) {
    const monthlyBase = 124_500;
    return {
      months,
      projectedMonthlyCommitment: monthlyBase,
      projectedTotalCommitment: monthlyBase * months,
      generatedAtMs: Date.now(),
    };
  }

  learnCorrection(input: Record<string, unknown>, correctOutput: Record<string, unknown>) {
    const id = nanoid();
    this.corrections.set(id, {
      id,
      input,
      correctOutput,
      createdAtMs: Date.now(),
    });
    return this.corrections.get(id);
  }
}

export const gatewayState = new GatewayState();

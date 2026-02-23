import { customAlphabet } from 'nanoid';

import type {
  ActionOutcome,
  CloseRun,
  Correction,
  DelegateLane,
  DelegateLaneEvent,
  EgressAuditEntry,
  EgressPolicy,
  LedgerEvent,
  OpsActivityEvent,
  OpsState,
  PlaybookRun,
  ScenarioBranch,
  ScenarioMutation,
  WorkerDeadLetter,
  WorkerFingerprintClaimEvent,
  WorkerJobAttempt,
  WorkflowCommandExecution,
  WorkflowPlaybook,
} from '../types';

import { decodeLedgerCursor, encodeLedgerCursor } from './ledger-cursor';
import type {
  CloseRunFilters,
  DelegateLaneFilters,
  GatewayRepository,
  OpsActivityFilters,
  OpsActivityTrimInput,
  PlaybookRunFilters,
  WorkerDeadLetterFilters,
  WorkerFingerprintClaimFilters,
  WorkerJobAttemptFilters,
  WorkflowCommandRunFilters,
} from './types';

const nanoid = customAlphabet('1234567890abcdefghijklmnopqrstuvwxyz', 16);

type StoredLedgerEvent = {
  event: LedgerEvent;
  streamPosition: number;
};

type StoredSystemLease = {
  ownerId: string;
  expiresAtMs: number;
};

export class InMemoryGatewayRepository implements GatewayRepository {
  readonly kind = 'memory' as const;

  private readonly playbooks = new Map<string, WorkflowPlaybook>();
  private readonly playbookRuns = new Map<string, PlaybookRun>();
  private readonly closeRuns = new Map<string, CloseRun>();
  private readonly commandRuns = new Map<string, WorkflowCommandExecution>();

  private readonly scenarioBranches = new Map<string, ScenarioBranch>();
  private readonly scenarioMutations = new Map<string, ScenarioMutation[]>();

  private readonly delegateLanes = new Map<string, DelegateLane>();
  private readonly delegateLaneEvents = new Map<string, DelegateLaneEvent[]>();
  private readonly actionOutcomes = new Map<string, ActionOutcome>();
  private readonly opsActivityEvents = new Map<string, OpsActivityEvent>();
  private readonly workerJobAttempts = new Map<string, WorkerJobAttempt>();
  private readonly workerDeadLetters = new Map<string, WorkerDeadLetter>();
  private readonly workerFingerprintClaimEvents = new Map<
    string,
    WorkerFingerprintClaimEvent
  >();
  private readonly systemLeases = new Map<string, StoredSystemLease>();

  private readonly egressAudit: EgressAuditEntry[] = [];
  private readonly corrections = new Map<string, Correction>();
  private readonly ledgerEvents: StoredLedgerEvent[] = [];
  private readonly ledgerStreamVersions = new Map<string, number>();
  private nextLedgerStreamPosition = 1;

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
      description:
        'Resolve urgent queue, scan expiring contracts, run weekly close.',
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
      priority: 'high',
      status: 'assigned',
      assignee: 'assistant',
      assignedBy: 'owner',
      payload: { contractId: 'mobile-1', deadline: '2026-03-05' },
      createdAtMs: now,
      updatedAtMs: now,
      dueAtMs: now + 10 * 24 * 60 * 60 * 1000,
    };
    this.delegateLanes.set(defaultLane.id, defaultLane);
    this.delegateLaneEvents.set(defaultLane.id, [
      {
        id: nanoid(),
        laneId: defaultLane.id,
        type: 'assigned',
        actorId: 'owner',
        message: 'Lane created by system bootstrap.',
        payload: {
          title: defaultLane.title,
          assignee: defaultLane.assignee,
        },
        createdAtMs: now,
      },
    ]);
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
    return [...this.playbooks.values()].sort(
      (a, b) => b.updatedAtMs - a.updatedAtMs,
    );
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

  async updatePlaybookRun(run: PlaybookRun): Promise<PlaybookRun | null> {
    if (!this.playbookRuns.has(run.id)) {
      return null;
    }
    this.playbookRuns.set(run.id, run);
    return run;
  }

  async getPlaybookRunById(runId: string): Promise<PlaybookRun | null> {
    return this.playbookRuns.get(runId) || null;
  }

  async markPlaybookRunRolledBack(
    runId: string,
    rolledBackAtMs: number,
    rollbackRunId?: string,
  ): Promise<PlaybookRun | null> {
    const existing = this.playbookRuns.get(runId);
    if (!existing) {
      return null;
    }
    const updated: PlaybookRun = {
      ...existing,
      status: 'rolled_back',
      finishedAtMs: rolledBackAtMs,
      rollbackEligible: false,
      rollbackOfRunId: rollbackRunId || existing.rollbackOfRunId,
      statusTimeline: [
        ...(Array.isArray(existing.statusTimeline)
          ? existing.statusTimeline
          : []),
        {
          status: 'rolled_back',
          atMs: rolledBackAtMs,
          note: 'Run was rolled back.',
        },
      ],
    };
    this.playbookRuns.set(runId, updated);
    return updated;
  }

  async listPlaybookRuns(
    limit: number,
    filters?: PlaybookRunFilters,
  ): Promise<PlaybookRun[]> {
    return [...this.playbookRuns.values()]
      .filter(run => {
        if (filters?.playbookId && run.playbookId !== filters.playbookId) {
          return false;
        }
        if (filters?.actorId && run.actorId !== filters.actorId) {
          return false;
        }
        if (
          filters?.sourceSurface &&
          run.sourceSurface !== filters.sourceSurface
        ) {
          return false;
        }
        if (
          typeof filters?.executionMode === 'string' &&
          run.executionMode !== filters.executionMode
        ) {
          return false;
        }
        if (
          typeof filters?.status === 'string' &&
          run.status !== filters.status
        ) {
          return false;
        }
        if (
          filters?.idempotencyKey &&
          run.idempotencyKey !== filters.idempotencyKey
        ) {
          return false;
        }
        if (
          typeof filters?.hasErrors === 'boolean' &&
          run.errorCount > 0 !== filters.hasErrors
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.createdAtMs - a.createdAtMs)
      .slice(0, limit);
  }

  async createCloseRun(run: CloseRun): Promise<CloseRun> {
    this.closeRuns.set(run.id, run);
    return run;
  }

  async listCloseRuns(
    limit: number,
    filters?: CloseRunFilters,
  ): Promise<CloseRun[]> {
    return [...this.closeRuns.values()]
      .filter(run => {
        if (filters?.period && run.period !== filters.period) {
          return false;
        }
        if (
          typeof filters?.hasExceptions === 'boolean' &&
          run.exceptionCount > 0 !== filters.hasExceptions
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.createdAtMs - a.createdAtMs)
      .slice(0, limit);
  }

  async createWorkflowCommandRun(
    run: WorkflowCommandExecution,
  ): Promise<WorkflowCommandExecution> {
    this.commandRuns.set(run.id, run);
    return run;
  }

  async updateWorkflowCommandRun(
    run: WorkflowCommandExecution,
  ): Promise<WorkflowCommandExecution | null> {
    if (!this.commandRuns.has(run.id)) {
      return null;
    }
    this.commandRuns.set(run.id, run);
    return run;
  }

  async getWorkflowCommandRunById(
    runId: string,
  ): Promise<WorkflowCommandExecution | null> {
    return this.commandRuns.get(runId) || null;
  }

  async markWorkflowCommandRunRolledBack(
    runId: string,
    rolledBackAtMs: number,
    rollbackRunId?: string,
  ): Promise<WorkflowCommandExecution | null> {
    const existing = this.commandRuns.get(runId);
    if (!existing) {
      return null;
    }
    const updated: WorkflowCommandExecution = {
      ...existing,
      status: 'rolled_back',
      finishedAtMs: rolledBackAtMs,
      rollbackEligible: false,
      rollbackOfRunId: rollbackRunId || existing.rollbackOfRunId,
      statusTimeline: [
        ...(Array.isArray(existing.statusTimeline)
          ? existing.statusTimeline
          : []),
        {
          status: 'rolled_back',
          atMs: rolledBackAtMs,
          note: 'Run was rolled back.',
        },
      ],
    };
    this.commandRuns.set(runId, updated);
    return updated;
  }

  async findRunByIdempotencyKey(
    scope: 'playbook' | 'command',
    idempotencyKey: string,
  ): Promise<PlaybookRun | WorkflowCommandExecution | null> {
    if (scope === 'playbook') {
      return (
        [...this.playbookRuns.values()]
          .filter(run => run.idempotencyKey === idempotencyKey)
          .sort((a, b) => b.createdAtMs - a.createdAtMs)[0] || null
      );
    }

    return (
      [...this.commandRuns.values()]
        .filter(run => run.idempotencyKey === idempotencyKey)
        .sort((a, b) => b.executedAtMs - a.executedAtMs)[0] || null
    );
  }

  async listWorkflowCommandRuns(
    limit: number,
    filters?: WorkflowCommandRunFilters,
  ): Promise<WorkflowCommandExecution[]> {
    return [...this.commandRuns.values()]
      .filter(run => {
        if (filters?.actorId && run.actorId !== filters.actorId) {
          return false;
        }
        if (
          filters?.sourceSurface &&
          run.sourceSurface !== filters.sourceSurface
        ) {
          return false;
        }
        if (
          typeof filters?.executionMode === 'string' &&
          run.executionMode !== filters.executionMode
        ) {
          return false;
        }
        if (
          typeof filters?.status === 'string' &&
          run.status !== filters.status
        ) {
          return false;
        }
        if (
          filters?.idempotencyKey &&
          run.idempotencyKey !== filters.idempotencyKey
        ) {
          return false;
        }
        if (
          typeof filters?.hasErrors === 'boolean' &&
          run.errorCount > 0 !== filters.hasErrors
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.executedAtMs - a.executedAtMs)
      .slice(0, limit);
  }

  async listScenarioBranches(): Promise<ScenarioBranch[]> {
    return [...this.scenarioBranches.values()].sort(
      (a, b) => b.updatedAtMs - a.updatedAtMs,
    );
  }

  async getScenarioBranchById(
    branchId: string,
  ): Promise<ScenarioBranch | null> {
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

  async listDelegateLanes(
    limit: number,
    filters?: DelegateLaneFilters,
  ): Promise<DelegateLane[]> {
    return [...this.delegateLanes.values()]
      .filter(lane => {
        if (filters?.status && lane.status !== filters.status) {
          return false;
        }
        if (filters?.assignee && lane.assignee !== filters.assignee) {
          return false;
        }
        if (filters?.assignedBy && lane.assignedBy !== filters.assignedBy) {
          return false;
        }
        if (filters?.priority && lane.priority !== filters.priority) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.updatedAtMs - a.updatedAtMs)
      .slice(0, limit);
  }

  async getDelegateLaneById(laneId: string): Promise<DelegateLane | null> {
    return this.delegateLanes.get(laneId) || null;
  }

  async createDelegateLane(lane: DelegateLane): Promise<DelegateLane> {
    this.delegateLanes.set(lane.id, lane);
    if (!this.delegateLaneEvents.has(lane.id)) {
      this.delegateLaneEvents.set(lane.id, []);
    }
    return lane;
  }

  async updateDelegateLane(lane: DelegateLane): Promise<DelegateLane> {
    this.delegateLanes.set(lane.id, lane);
    return lane;
  }

  async createDelegateLaneEvent(
    event: DelegateLaneEvent,
  ): Promise<DelegateLaneEvent> {
    const list = this.delegateLaneEvents.get(event.laneId) || [];
    list.push(event);
    this.delegateLaneEvents.set(event.laneId, list);
    return event;
  }

  async listDelegateLaneEvents(
    laneId: string,
    limit: number,
  ): Promise<DelegateLaneEvent[]> {
    return [...(this.delegateLaneEvents.get(laneId) || [])]
      .sort((a, b) => b.createdAtMs - a.createdAtMs)
      .slice(0, limit);
  }

  async recordActionOutcome(input: {
    id: string;
    actionId: string;
    outcome: string;
    notes?: string;
    recordedAtMs: number;
  }): Promise<ActionOutcome> {
    const outcome: ActionOutcome = {
      id: input.id,
      actionId: input.actionId,
      outcome: input.outcome,
      notes: input.notes,
      recordedAtMs: input.recordedAtMs,
    };
    this.actionOutcomes.set(input.id, outcome);
    return outcome;
  }

  async listActionOutcomes(input: {
    limit: number;
    actionId?: string;
  }): Promise<ActionOutcome[]> {
    return [...this.actionOutcomes.values()]
      .filter(outcome => {
        if (input.actionId && outcome.actionId !== input.actionId) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.recordedAtMs - a.recordedAtMs)
      .slice(0, input.limit);
  }

  async appendOpsActivityEvent(
    event: OpsActivityEvent,
  ): Promise<OpsActivityEvent> {
    this.opsActivityEvents.set(event.id, event);
    return event;
  }

  async listOpsActivityEvents(
    limit: number,
    filters?: OpsActivityFilters,
  ): Promise<OpsActivityEvent[]> {
    const kinds =
      filters?.kinds && filters.kinds.length > 0
        ? new Set(filters.kinds)
        : null;
    const severities =
      filters?.severities && filters.severities.length > 0
        ? new Set(filters.severities)
        : null;
    const cursor = filters?.cursor;

    return [...this.opsActivityEvents.values()]
      .filter(event => {
        if (kinds && !kinds.has(event.kind)) {
          return false;
        }
        if (severities && !severities.has(event.severity)) {
          return false;
        }
        if (
          cursor &&
          !(
            event.createdAtMs < cursor.createdAtMs ||
            (event.createdAtMs === cursor.createdAtMs && event.id < cursor.id)
          )
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (a.createdAtMs !== b.createdAtMs) {
          return b.createdAtMs - a.createdAtMs;
        }
        if (a.id === b.id) {
          return 0;
        }
        return a.id < b.id ? 1 : -1;
      })
      .slice(0, limit);
  }

  async countOpsActivityEvents(): Promise<number> {
    return this.opsActivityEvents.size;
  }

  async trimOpsActivityEvents(input: OpsActivityTrimInput): Promise<number> {
    let removed = 0;
    const olderThanMs = input.olderThanMs;
    if (typeof olderThanMs === 'number' && Number.isFinite(olderThanMs)) {
      for (const [id, event] of this.opsActivityEvents.entries()) {
        if (event.createdAtMs < olderThanMs) {
          this.opsActivityEvents.delete(id);
          removed += 1;
        }
      }
    }

    const maxRows = input.maxRows;
    if (
      typeof maxRows === 'number' &&
      Number.isFinite(maxRows) &&
      maxRows >= 0 &&
      this.opsActivityEvents.size > maxRows
    ) {
      const sorted = [...this.opsActivityEvents.values()].sort((a, b) => {
        if (a.createdAtMs !== b.createdAtMs) {
          return b.createdAtMs - a.createdAtMs;
        }
        if (a.id === b.id) {
          return 0;
        }
        return a.id < b.id ? 1 : -1;
      });
      const keep = new Set(sorted.slice(0, maxRows).map(event => event.id));
      for (const id of this.opsActivityEvents.keys()) {
        if (!keep.has(id)) {
          this.opsActivityEvents.delete(id);
          removed += 1;
        }
      }
    }

    return removed;
  }

  async trimWorkerJobAttempts(input: OpsActivityTrimInput): Promise<number> {
    let removed = 0;
    const olderThanMs = input.olderThanMs;
    if (typeof olderThanMs === 'number' && Number.isFinite(olderThanMs)) {
      for (const [id, entry] of this.workerJobAttempts.entries()) {
        if (entry.createdAtMs < olderThanMs) {
          this.workerJobAttempts.delete(id);
          removed += 1;
        }
      }
    }

    const maxRows = input.maxRows;
    if (
      typeof maxRows === 'number' &&
      Number.isFinite(maxRows) &&
      maxRows >= 0 &&
      this.workerJobAttempts.size > maxRows
    ) {
      const sorted = [...this.workerJobAttempts.values()].sort(
        (a, b) => b.createdAtMs - a.createdAtMs,
      );
      const keep = new Set(sorted.slice(0, maxRows).map(entry => entry.id));
      for (const id of this.workerJobAttempts.keys()) {
        if (!keep.has(id)) {
          this.workerJobAttempts.delete(id);
          removed += 1;
        }
      }
    }

    return removed;
  }

  async trimWorkerDeadLetters(input: OpsActivityTrimInput): Promise<number> {
    let removed = 0;
    const olderThanMs = input.olderThanMs;
    if (typeof olderThanMs === 'number' && Number.isFinite(olderThanMs)) {
      for (const [id, entry] of this.workerDeadLetters.entries()) {
        if (entry.createdAtMs < olderThanMs) {
          this.workerDeadLetters.delete(id);
          removed += 1;
        }
      }
    }

    const maxRows = input.maxRows;
    if (
      typeof maxRows === 'number' &&
      Number.isFinite(maxRows) &&
      maxRows >= 0 &&
      this.workerDeadLetters.size > maxRows
    ) {
      const sorted = [...this.workerDeadLetters.values()].sort(
        (a, b) => b.createdAtMs - a.createdAtMs,
      );
      const keep = new Set(sorted.slice(0, maxRows).map(entry => entry.id));
      for (const id of this.workerDeadLetters.keys()) {
        if (!keep.has(id)) {
          this.workerDeadLetters.delete(id);
          removed += 1;
        }
      }
    }

    return removed;
  }

  async trimWorkerFingerprintClaimEvents(
    input: OpsActivityTrimInput,
  ): Promise<number> {
    let removed = 0;
    const olderThanMs = input.olderThanMs;
    if (typeof olderThanMs === 'number' && Number.isFinite(olderThanMs)) {
      for (const [id, entry] of this.workerFingerprintClaimEvents.entries()) {
        if (entry.createdAtMs < olderThanMs) {
          this.workerFingerprintClaimEvents.delete(id);
          removed += 1;
        }
      }
    }

    const maxRows = input.maxRows;
    if (
      typeof maxRows === 'number' &&
      Number.isFinite(maxRows) &&
      maxRows >= 0 &&
      this.workerFingerprintClaimEvents.size > maxRows
    ) {
      const sorted = [...this.workerFingerprintClaimEvents.values()].sort(
        (a, b) => b.createdAtMs - a.createdAtMs,
      );
      const keep = new Set(sorted.slice(0, maxRows).map(entry => entry.id));
      for (const id of this.workerFingerprintClaimEvents.keys()) {
        if (!keep.has(id)) {
          this.workerFingerprintClaimEvents.delete(id);
          removed += 1;
        }
      }
    }

    return removed;
  }

  async createWorkerJobAttempt(
    attempt: WorkerJobAttempt,
  ): Promise<WorkerJobAttempt> {
    this.workerJobAttempts.set(attempt.id, attempt);
    return attempt;
  }

  async listWorkerJobAttempts(
    limit: number,
    filters?: WorkerJobAttemptFilters,
  ): Promise<WorkerJobAttempt[]> {
    const outcomes =
      filters?.outcomes && filters.outcomes.length > 0
        ? new Set(filters.outcomes)
        : null;

    return [...this.workerJobAttempts.values()]
      .filter(attempt => {
        if (
          typeof filters?.sinceMs === 'number' &&
          Number.isFinite(filters.sinceMs) &&
          attempt.createdAtMs < filters.sinceMs
        ) {
          return false;
        }
        if (filters?.workerId && attempt.workerId !== filters.workerId) {
          return false;
        }
        if (filters?.jobName && attempt.jobName !== filters.jobName) {
          return false;
        }
        if (outcomes && !outcomes.has(attempt.outcome)) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.createdAtMs - a.createdAtMs)
      .slice(0, limit);
  }

  async countWorkerJobAttempts(): Promise<number> {
    return this.workerJobAttempts.size;
  }

  async hasSuccessfulWorkerJobFingerprint(
    fingerprint: string,
  ): Promise<boolean> {
    if (fingerprint.length === 0) {
      return false;
    }

    for (const attempt of this.workerJobAttempts.values()) {
      if (
        attempt.outcome === 'acked' &&
        attempt.jobFingerprint === fingerprint
      ) {
        return true;
      }
    }

    return false;
  }

  async createWorkerFingerprintClaimEvent(
    event: WorkerFingerprintClaimEvent,
  ): Promise<WorkerFingerprintClaimEvent> {
    this.workerFingerprintClaimEvents.set(event.id, event);
    return event;
  }

  async listWorkerFingerprintClaimEvents(
    limit: number,
    filters?: WorkerFingerprintClaimFilters,
  ): Promise<WorkerFingerprintClaimEvent[]> {
    const statuses =
      filters?.statuses && filters.statuses.length > 0
        ? new Set(filters.statuses)
        : null;

    return [...this.workerFingerprintClaimEvents.values()]
      .filter(event => {
        if (
          typeof filters?.sinceMs === 'number' &&
          Number.isFinite(filters.sinceMs) &&
          event.createdAtMs < filters.sinceMs
        ) {
          return false;
        }
        if (filters?.workerId && event.workerId !== filters.workerId) {
          return false;
        }
        if (statuses && !statuses.has(event.status)) {
          return false;
        }
        if (
          typeof filters?.staleRecovered === 'boolean' &&
          event.staleRecovered !== filters.staleRecovered
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.createdAtMs - a.createdAtMs)
      .slice(0, limit);
  }

  async countWorkerFingerprintClaimEvents(
    filters?: WorkerFingerprintClaimFilters,
  ): Promise<number> {
    const events = await this.listWorkerFingerprintClaimEvents(
      Number.MAX_SAFE_INTEGER,
      filters,
    );
    return events.length;
  }

  async createWorkerDeadLetter(
    entry: WorkerDeadLetter,
  ): Promise<WorkerDeadLetter> {
    this.workerDeadLetters.set(entry.id, entry);
    return entry;
  }

  async getWorkerDeadLetterById(
    deadLetterId: string,
  ): Promise<WorkerDeadLetter | null> {
    return this.workerDeadLetters.get(deadLetterId) || null;
  }

  async listWorkerDeadLetters(
    limit: number,
    filters?: WorkerDeadLetterFilters,
  ): Promise<WorkerDeadLetter[]> {
    return [...this.workerDeadLetters.values()]
      .filter(entry => {
        if (filters?.status && entry.status !== filters.status) {
          return false;
        }
        if (filters?.workerId && entry.workerId !== filters.workerId) {
          return false;
        }
        if (filters?.jobName && entry.jobName !== filters.jobName) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.createdAtMs - a.createdAtMs)
      .slice(0, limit);
  }

  async updateWorkerDeadLetter(
    entry: WorkerDeadLetter,
  ): Promise<WorkerDeadLetter> {
    this.workerDeadLetters.set(entry.id, entry);
    return entry;
  }

  async countWorkerDeadLetters(): Promise<number> {
    return this.workerDeadLetters.size;
  }

  async acquireSystemLease(input: {
    leaseKey: string;
    ownerId: string;
    ttlMs: number;
  }): Promise<boolean> {
    const now = Date.now();
    const current = this.systemLeases.get(input.leaseKey);
    if (
      current &&
      current.ownerId !== input.ownerId &&
      current.expiresAtMs > now
    ) {
      return false;
    }

    this.systemLeases.set(input.leaseKey, {
      ownerId: input.ownerId,
      expiresAtMs: now + Math.max(1, Math.trunc(input.ttlMs)),
    });
    return true;
  }

  async getSystemLease(input: { leaseKey: string }): Promise<{
    leaseKey: string;
    ownerId: string;
    expiresAtMs: number;
  } | null> {
    const current = this.systemLeases.get(input.leaseKey);
    if (!current) {
      return null;
    }
    return {
      leaseKey: input.leaseKey,
      ownerId: current.ownerId,
      expiresAtMs: current.expiresAtMs,
    };
  }

  async releaseSystemLease(input: {
    leaseKey: string;
    ownerId: string;
  }): Promise<boolean> {
    const current = this.systemLeases.get(input.leaseKey);
    if (!current || current.ownerId !== input.ownerId) {
      return false;
    }
    this.systemLeases.delete(input.leaseKey);
    return true;
  }

  async getEgressPolicy(): Promise<EgressPolicy> {
    return {
      ...this.egressPolicy,
      allowedProviders: [...this.egressPolicy.allowedProviders],
    };
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
    const streamKey = `${event.workspaceId}:${event.aggregateId}`;
    const nextVersion = (this.ledgerStreamVersions.get(streamKey) || 0) + 1;
    this.ledgerStreamVersions.set(streamKey, nextVersion);

    const versionedEvent: LedgerEvent = {
      ...event,
      version: nextVersion,
    };

    this.ledgerEvents.push({
      event: versionedEvent,
      streamPosition: this.nextLedgerStreamPosition,
    });
    this.nextLedgerStreamPosition += 1;

    return versionedEvent;
  }

  async streamLedgerEvents(input: {
    workspaceId: string;
    cursor?: string;
    limit: number;
  }): Promise<{ events: LedgerEvent[]; nextCursor?: string }> {
    const cursor = decodeLedgerCursor(input.cursor);

    const all = this.ledgerEvents
      .filter(item => item.event.workspaceId === input.workspaceId)
      .sort((a, b) => {
        const occurredAtDiff = b.event.occurredAtMs - a.event.occurredAtMs;
        if (occurredAtDiff !== 0) {
          return occurredAtDiff;
        }

        return b.streamPosition - a.streamPosition;
      });

    const filtered = cursor
      ? all.filter(item => {
          if (item.event.occurredAtMs < cursor.occurredAtMs) {
            return true;
          }

          if (item.event.occurredAtMs > cursor.occurredAtMs) {
            return false;
          }

          return item.streamPosition < cursor.streamPosition;
        })
      : all;

    const page = filtered.slice(0, input.limit + 1);
    const hasMore = page.length > input.limit;
    const items = hasMore ? page.slice(0, input.limit) : page;
    const lastItem = items[items.length - 1];
    const nextCursor =
      hasMore && lastItem
        ? encodeLedgerCursor({
            occurredAtMs: lastItem.event.occurredAtMs,
            streamPosition: lastItem.streamPosition,
          })
        : undefined;

    return {
      events: items.map(item => item.event),
      nextCursor,
    };
  }
}

import type {
  ActionOutcome,
  CloseRun,
  Correction,
  DelegateLane,
  DelegateLaneEvent,
  EgressAuditEntry,
  EgressPolicy,
  ExecutionMode,
  LedgerEvent,
  OpsActivityCursor,
  OpsActivityEvent,
  OpsState,
  PlaybookRun,
  RunStatus,
  ScenarioBranch,
  ScenarioBranchWithMutations,
  ScenarioMutation,
  WorkerDeadLetter,
  WorkerFingerprintClaimEvent,
  WorkerJobAttempt,
  WorkflowCommandExecution,
  WorkflowPlaybook,
} from '../types';

export type WorkflowCommandRunFilters = {
  actorId?: string;
  sourceSurface?: string;
  executionMode?: ExecutionMode;
  status?: RunStatus;
  idempotencyKey?: string;
  hasErrors?: boolean;
};

export type PlaybookRunFilters = {
  playbookId?: string;
  actorId?: string;
  sourceSurface?: string;
  executionMode?: ExecutionMode;
  status?: RunStatus;
  idempotencyKey?: string;
  hasErrors?: boolean;
};

export type RunIdempotencyScope = 'playbook' | 'command';

export type CloseRunFilters = {
  period?: CloseRun['period'];
  hasExceptions?: boolean;
};

export type DelegateLaneFilters = {
  status?: DelegateLane['status'];
  assignee?: string;
  assignedBy?: string;
  priority?: DelegateLane['priority'];
};

export type OpsActivityFilters = {
  kinds?: OpsActivityEvent['kind'][];
  severities?: OpsActivityEvent['severity'][];
  cursor?: OpsActivityCursor;
};

export type OpsActivityTrimInput = {
  maxRows?: number;
  olderThanMs?: number;
};

export type WorkerJobAttemptFilters = {
  sinceMs?: number;
  workerId?: string;
  jobName?: string;
  outcomes?: WorkerJobAttempt['outcome'][];
};

export type WorkerDeadLetterFilters = {
  status?: WorkerDeadLetter['status'];
  workerId?: string;
  jobName?: string;
};

export type WorkerFingerprintClaimFilters = {
  sinceMs?: number;
  workerId?: string;
  statuses?: WorkerFingerprintClaimEvent['status'][];
  staleRecovered?: boolean;
};

export type GatewayRepository = {
  readonly kind: 'memory' | 'postgres';

  init(): Promise<void>;
  close(): Promise<void>;

  getOpsState(): Promise<OpsState>;
  setOpsState(state: Partial<OpsState>): Promise<OpsState>;

  listPlaybooks(): Promise<WorkflowPlaybook[]>;
  getPlaybookById(playbookId: string): Promise<WorkflowPlaybook | null>;
  createPlaybook(input: {
    id: string;
    name: string;
    description: string;
    commands: Array<Record<string, unknown>>;
    createdAtMs: number;
  }): Promise<WorkflowPlaybook>;
  createPlaybookRun(run: PlaybookRun): Promise<PlaybookRun>;
  updatePlaybookRun(run: PlaybookRun): Promise<PlaybookRun | null>;
  getPlaybookRunById(runId: string): Promise<PlaybookRun | null>;
  markPlaybookRunRolledBack(
    runId: string,
    rolledBackAtMs: number,
    rollbackRunId?: string,
  ): Promise<PlaybookRun | null>;
  listPlaybookRuns(
    limit: number,
    filters?: PlaybookRunFilters,
  ): Promise<PlaybookRun[]>;

  createCloseRun(run: CloseRun): Promise<CloseRun>;
  listCloseRuns(limit: number, filters?: CloseRunFilters): Promise<CloseRun[]>;
  createWorkflowCommandRun(
    run: WorkflowCommandExecution,
  ): Promise<WorkflowCommandExecution>;
  updateWorkflowCommandRun(
    run: WorkflowCommandExecution,
  ): Promise<WorkflowCommandExecution | null>;
  getWorkflowCommandRunById(
    runId: string,
  ): Promise<WorkflowCommandExecution | null>;
  markWorkflowCommandRunRolledBack(
    runId: string,
    rolledBackAtMs: number,
    rollbackRunId?: string,
  ): Promise<WorkflowCommandExecution | null>;
  findRunByIdempotencyKey(
    scope: RunIdempotencyScope,
    idempotencyKey: string,
  ): Promise<PlaybookRun | WorkflowCommandExecution | null>;
  listWorkflowCommandRuns(
    limit: number,
    filters?: WorkflowCommandRunFilters,
  ): Promise<WorkflowCommandExecution[]>;

  listScenarioBranches(): Promise<ScenarioBranch[]>;
  getScenarioBranchById(branchId: string): Promise<ScenarioBranch | null>;
  createScenarioBranch(branch: ScenarioBranch): Promise<ScenarioBranch>;
  addScenarioMutation(
    mutation: ScenarioMutation,
  ): Promise<ScenarioMutation | null>;
  listScenarioMutations(branchId: string): Promise<ScenarioMutation[]>;
  adoptScenarioBranch(
    branchId: string,
    adoptedAtMs: number,
  ): Promise<ScenarioBranch | null>;

  listDelegateLanes(
    limit: number,
    filters?: DelegateLaneFilters,
  ): Promise<DelegateLane[]>;
  getDelegateLaneById(laneId: string): Promise<DelegateLane | null>;
  createDelegateLane(lane: DelegateLane): Promise<DelegateLane>;
  updateDelegateLane(lane: DelegateLane): Promise<DelegateLane>;
  createDelegateLaneEvent(event: DelegateLaneEvent): Promise<DelegateLaneEvent>;
  listDelegateLaneEvents(
    laneId: string,
    limit: number,
  ): Promise<DelegateLaneEvent[]>;

  recordActionOutcome(input: {
    id: string;
    actionId: string;
    outcome: string;
    notes?: string;
    recordedAtMs: number;
  }): Promise<ActionOutcome>;
  listActionOutcomes(input: {
    limit: number;
    actionId?: string;
  }): Promise<ActionOutcome[]>;
  appendOpsActivityEvent(event: OpsActivityEvent): Promise<OpsActivityEvent>;
  listOpsActivityEvents(
    limit: number,
    filters?: OpsActivityFilters,
  ): Promise<OpsActivityEvent[]>;
  countOpsActivityEvents(): Promise<number>;
  trimOpsActivityEvents(input: OpsActivityTrimInput): Promise<number>;
  trimWorkerJobAttempts(input: OpsActivityTrimInput): Promise<number>;
  trimWorkerDeadLetters(input: OpsActivityTrimInput): Promise<number>;
  trimWorkerFingerprintClaimEvents(
    input: OpsActivityTrimInput,
  ): Promise<number>;
  createWorkerJobAttempt(attempt: WorkerJobAttempt): Promise<WorkerJobAttempt>;
  listWorkerJobAttempts(
    limit: number,
    filters?: WorkerJobAttemptFilters,
  ): Promise<WorkerJobAttempt[]>;
  countWorkerJobAttempts(): Promise<number>;
  hasSuccessfulWorkerJobFingerprint(fingerprint: string): Promise<boolean>;
  createWorkerFingerprintClaimEvent(
    event: WorkerFingerprintClaimEvent,
  ): Promise<WorkerFingerprintClaimEvent>;
  listWorkerFingerprintClaimEvents(
    limit: number,
    filters?: WorkerFingerprintClaimFilters,
  ): Promise<WorkerFingerprintClaimEvent[]>;
  countWorkerFingerprintClaimEvents(
    filters?: WorkerFingerprintClaimFilters,
  ): Promise<number>;
  createWorkerDeadLetter(entry: WorkerDeadLetter): Promise<WorkerDeadLetter>;
  getWorkerDeadLetterById(
    deadLetterId: string,
  ): Promise<WorkerDeadLetter | null>;
  listWorkerDeadLetters(
    limit: number,
    filters?: WorkerDeadLetterFilters,
  ): Promise<WorkerDeadLetter[]>;
  updateWorkerDeadLetter(entry: WorkerDeadLetter): Promise<WorkerDeadLetter>;
  countWorkerDeadLetters(): Promise<number>;
  acquireSystemLease(input: {
    leaseKey: string;
    ownerId: string;
    ttlMs: number;
  }): Promise<boolean>;
  getSystemLease(input: { leaseKey: string }): Promise<{
    leaseKey: string;
    ownerId: string;
    expiresAtMs: number;
  } | null>;
  releaseSystemLease(input: {
    leaseKey: string;
    ownerId: string;
  }): Promise<boolean>;

  getEgressPolicy(): Promise<EgressPolicy>;
  setEgressPolicy(policy: EgressPolicy): Promise<EgressPolicy>;
  listEgressAudit(limit: number): Promise<EgressAuditEntry[]>;
  recordEgressAudit(entry: EgressAuditEntry): Promise<EgressAuditEntry>;

  createCorrection(correction: Correction): Promise<Correction>;
  listCorrections(limit: number): Promise<Correction[]>;

  appendLedgerEvent(event: LedgerEvent): Promise<LedgerEvent>;
  streamLedgerEvents(input: {
    workspaceId: string;
    cursor?: string;
    limit: number;
  }): Promise<{ events: LedgerEvent[]; nextCursor?: string }>;
};

export type RepositoryFactoryOptions = {
  databaseUrl?: string;
};

export type QueueJob = {
  id: string;
  name: string;
  payload: Record<string, unknown>;
  createdAtMs: number;
};

import type {
  CloseRun,
  Correction,
  DelegateLane,
  DelegateLaneEvent,
  EgressAuditEntry,
  EgressPolicy,
  LedgerEvent,
  OpsState,
  PlaybookRun,
  ScenarioBranch,
  ScenarioBranchWithMutations,
  ScenarioMutation,
  WorkflowCommandExecution,
  WorkflowPlaybook,
} from '../types';

export type WorkflowCommandRunFilters = {
  actorId?: string;
  sourceSurface?: string;
  dryRun?: boolean;
  hasErrors?: boolean;
};

export type DelegateLaneFilters = {
  status?: DelegateLane['status'];
  assignee?: string;
  assignedBy?: string;
  priority?: DelegateLane['priority'];
};

export interface GatewayRepository {
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

  createCloseRun(run: CloseRun): Promise<CloseRun>;
  createWorkflowCommandRun(
    run: WorkflowCommandExecution,
  ): Promise<WorkflowCommandExecution>;
  listWorkflowCommandRuns(
    limit: number,
    filters?: WorkflowCommandRunFilters,
  ): Promise<WorkflowCommandExecution[]>;

  listScenarioBranches(): Promise<ScenarioBranch[]>;
  getScenarioBranchById(branchId: string): Promise<ScenarioBranch | null>;
  createScenarioBranch(branch: ScenarioBranch): Promise<ScenarioBranch>;
  addScenarioMutation(mutation: ScenarioMutation): Promise<ScenarioMutation | null>;
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
  }): Promise<Record<string, unknown>>;

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
}

export type RepositoryFactoryOptions = {
  databaseUrl?: string;
};

export type QueueJob = {
  id: string;
  name: string;
  payload: Record<string, unknown>;
  createdAtMs: number;
};

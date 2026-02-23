import type { Recommendation } from '@finance-os/domain-kernel';

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

export type PlaybookRun = {
  id: string;
  playbookId: string;
  dryRun: boolean;
  executedSteps: number;
  steps: Array<{
    index: number;
    command: Record<string, unknown>;
    status: string;
  }>;
  createdAtMs: number;
};

export type WorkflowCommandExecutionStep = {
  id: string;
  raw: string;
  canonical: string;
  status: 'ok' | 'error';
  detail: string;
  route?: string;
};

export type WorkflowCommandExecution = {
  id: string;
  chain: string;
  steps: WorkflowCommandExecutionStep[];
  errorCount: number;
  executedAtMs: number;
};

export type CloseRun = {
  id: string;
  period: 'weekly' | 'monthly';
  exceptionCount: number;
  summary: {
    pendingReviews: number;
    urgentReviews: number;
    expiringContracts: number;
  };
  createdAtMs: number;
};

export type ScenarioMutation = {
  id: string;
  branchId: string;
  kind: string;
  payload: Record<string, unknown>;
  createdAtMs: number;
};

export type ScenarioBranch = {
  id: string;
  name: string;
  status: 'draft' | 'adopted';
  baseBranchId?: string;
  notes?: string;
  createdAtMs: number;
  updatedAtMs: number;
  adoptedAtMs?: number;
};

export type ScenarioBranchWithMutations = ScenarioBranch & {
  mutations: ScenarioMutation[];
};

export type ScenarioComparison = {
  primaryBranchId: string;
  againstBranchId?: string;
  primary: { amountDelta: number; riskDelta: number };
  against: { amountDelta: number; riskDelta: number };
  diff: { amountDelta: number; riskDelta: number };
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

export type FocusAction = {
  id: string;
  title: string;
  route: string;
  score: number;
  reason: string;
};

export type FocusPanel = {
  actions: FocusAction[];
  generatedAtMs: number;
};

export type OpsState = {
  pendingReviews: number;
  urgentReviews: number;
  expiringContracts: number;
  updatedAtMs: number;
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

export type Correction = {
  id: string;
  input: Record<string, unknown>;
  correctOutput: Record<string, unknown>;
  createdAtMs: number;
};

export type LedgerEvent = {
  eventId: string;
  workspaceId: string;
  aggregateId: string;
  aggregateType: string;
  type: string;
  payload: Record<string, unknown>;
  actorId: string;
  occurredAtMs: number;
  version: number;
};

export type GatewayRecommendation = Recommendation;

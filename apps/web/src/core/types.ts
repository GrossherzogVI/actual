import type { Recommendation } from '@finance-os/domain-kernel';

export type MoneyPulse = {
  pendingReviews: number;
  urgentReviews: number;
  expiringContracts: number;
  generatedAtMs: number;
};

export type NarrativePulse = {
  summary: string;
  highlights: string[];
  actionHints: string[];
  generatedAtMs: number;
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

export type ActionOutcome = {
  id: string;
  actionId: string;
  outcome: string;
  notes?: string;
  recordedAtMs: number;
};

export type Playbook = {
  id: string;
  name: string;
  description: string;
  commands: Array<Record<string, unknown>>;
  createdAtMs: number;
  updatedAtMs: number;
};

export type PlaybookRun = {
  id: string;
  playbookId: string;
  chain: string;
  dryRun: boolean;
  executedSteps: number;
  errorCount: number;
  actorId: string;
  sourceSurface: string;
  steps: Array<{
    index: number;
    command: Record<string, unknown>;
    status: string;
    detail?: string;
  }>;
  createdAtMs: number;
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

export type DelegateLane = {
  id: string;
  title: string;
  priority: 'low' | 'normal' | 'high' | 'critical';
  status: 'assigned' | 'accepted' | 'completed' | 'rejected';
  assignee: string;
  assignedBy: string;
  payload: Record<string, unknown>;
  createdAtMs: number;
  updatedAtMs: number;
  dueAtMs?: number;
  acceptedAtMs?: number;
  completedAtMs?: number;
  rejectedAtMs?: number;
};

export type DelegateLaneEvent = {
  id: string;
  laneId: string;
  type: 'assigned' | 'accepted' | 'completed' | 'rejected' | 'comment' | 'reopened';
  actorId: string;
  message?: string;
  payload?: Record<string, unknown>;
  createdAtMs: number;
};

export type ScenarioComparison = {
  primaryBranchId: string;
  againstBranchId?: string;
  primary: { amountDelta: number; riskDelta: number };
  against: { amountDelta: number; riskDelta: number };
  diff: { amountDelta: number; riskDelta: number };
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

export type ScenarioMutation = {
  id: string;
  branchId: string;
  kind: string;
  payload: Record<string, unknown>;
  createdAtMs: number;
};

export type ScenarioLineageNode = {
  branchId: string;
  name: string;
  status: ScenarioBranch['status'];
  adoptedAtMs?: number;
};

export type ScenarioLineage = {
  branchId: string;
  nodes: ScenarioLineageNode[];
  hasCycle: boolean;
};

export type ScenarioAdoptionCheck = {
  branchId: string;
  againstBranchId?: string;
  canAdopt: boolean;
  riskScore: number;
  blockers: string[];
  warnings: string[];
  summary: string;
  comparison: ScenarioComparison;
  mutationCount: number;
  lineageDepth: number;
  checkedAtMs: number;
};

export type AppRecommendation = Recommendation;

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
  actorId: string;
  sourceSurface: string;
  dryRun: boolean;
  executedAtMs: number;
};

export type OpsActivityKind =
  | 'workflow-command-run'
  | 'workflow-playbook-run'
  | 'workflow-close-run'
  | 'focus-action-outcome'
  | 'scenario-adoption'
  | 'delegate-lane'
  | 'policy-egress';

export type OpsActivitySeverity = 'info' | 'warn' | 'critical';

export type OpsActivityEvent = {
  id: string;
  kind: OpsActivityKind;
  title: string;
  detail: string;
  route?: string;
  severity: OpsActivitySeverity;
  createdAtMs: number;
  meta?: Record<string, unknown>;
};

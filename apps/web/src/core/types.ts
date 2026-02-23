import type { Recommendation } from '@finance-os/domain-kernel';

export type MoneyPulse = {
  pendingReviews: number;
  urgentReviews: number;
  expiringContracts: number;
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

export type Playbook = {
  id: string;
  name: string;
  description: string;
  commands: Array<Record<string, unknown>>;
  createdAtMs: number;
  updatedAtMs: number;
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
};

export type ScenarioComparison = {
  primaryBranchId: string;
  againstBranchId?: string;
  primary: { amountDelta: number; riskDelta: number };
  against: { amountDelta: number; riskDelta: number };
  diff: { amountDelta: number; riskDelta: number };
};

export type AppRecommendation = Recommendation;

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

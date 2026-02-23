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

export type TemporalSignalSeverity = 'info' | 'warn' | 'critical';

export type TemporalCalendarDay = {
  date: string;
  weekday: string;
  isBusinessDay: boolean;
  isHoliday: boolean;
};

export type TemporalLaneSignal = {
  laneId: string;
  title: string;
  assignee: string;
  priority: DelegateLane['priority'];
  status: DelegateLane['status'];
  dueAtMs?: number;
  deadlineDate?: string;
  daysUntilDue?: number;
  severity: TemporalSignalSeverity;
  reason: string;
  recommendedChain: string;
};

export type TemporalRecommendedChain = {
  id: string;
  label: string;
  chain: string;
  reason: string;
  amountDelta: number;
  riskDelta: number;
};

export type TemporalSignals = {
  generatedAtMs: number;
  bundesland: string;
  horizonDays: number;
  nextBusinessDay?: string;
  nextHolidayDate?: string;
  calendar: TemporalCalendarDay[];
  laneSignals: TemporalLaneSignal[];
  recommendedChains: TemporalRecommendedChain[];
  summary: {
    critical: number;
    warn: number;
    info: number;
    businessDays: number;
    holidays: number;
  };
};

export type RuntimeMetrics = {
  repositoryKind: string;
  queueKind: string;
  queueSize: number;
  queueInFlight: number;
  playbooks: number;
  delegateLanes: number;
  corrections: number;
  scenarioBranches: number;
  opsActivityEvents: number;
  workerJobAttempts: number;
  workerDeadLetters: number;
  workerFingerprintClaimEvents: number;
  workerFingerprintClaimAcquired: number;
  workerFingerprintClaimAlreadyProcessed: number;
  workerFingerprintClaimAlreadyClaimed: number;
  workerFingerprintStaleRecoveries: number;
  workerFingerprintDuplicateSkipRate: number;
  workerFingerprintContentionRate: number;
  workerFingerprintStaleRecoveryRate: number;
};

export type FocusAction = {
  id: string;
  title: string;
  route: string;
  score: number;
  reason: string;
  recommendedChain?: string;
  recommendedAssignee?: string;
  recommendedExecutionMode?: ExecutionMode;
  recommendedGuardrailProfile?: GuardrailProfile;
  recommendedRollbackWindowMinutes?: number;
  expectedImpact?: string;
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

export type ExecutionMode = 'dry-run' | 'live';

export type GuardrailProfile = 'strict' | 'balanced' | 'off';

export type RunStatus =
  | 'planned'
  | 'running'
  | 'completed'
  | 'failed'
  | 'blocked'
  | 'rolled_back';

export type RunStatusTransition = {
  status: RunStatus;
  atMs: number;
  note?: string;
};

export type GuardrailSeverity = 'info' | 'warn' | 'critical';

export type GuardrailResult = {
  ruleId: string;
  severity: GuardrailSeverity;
  passed: boolean;
  message: string;
  blocking: boolean;
};

export type EffectSummaryStatus = 'planned' | 'applied' | 'rolled-back' | 'skipped';

export type EffectSummary = {
  effectId: string;
  kind: string;
  description: string;
  reversible: boolean;
  status: EffectSummaryStatus;
  metadata?: Record<string, unknown>;
};

export type PlaybookRun = {
  id: string;
  playbookId: string;
  chain: string;
  executionMode: ExecutionMode;
  guardrailProfile: GuardrailProfile;
  status: RunStatus;
  startedAtMs: number;
  finishedAtMs?: number;
  rollbackWindowUntilMs?: number;
  rollbackEligible: boolean;
  rollbackOfRunId?: string;
  statusTimeline: RunStatusTransition[];
  guardrailResults: GuardrailResult[];
  effectSummaries: EffectSummary[];
  idempotencyKey?: string;
  rollbackOnFailure: boolean;
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

export type ScenarioSimulationSource =
  | 'decision-graph'
  | 'temporal-intelligence'
  | 'adaptive-focus'
  | 'command-mesh'
  | 'manual';

export type ScenarioSimulationResult = {
  branch: ScenarioBranch;
  mutation: ScenarioMutation;
  amountDelta: number;
  riskDelta: number;
  baseBranchId?: string;
  source: ScenarioSimulationSource;
  chain: string;
  simulatedAtMs: number;
  expectedImpact?: string;
  recommendationId?: string;
};

export type ScenarioBranchPromotionResult = {
  branch: ScenarioBranch;
  sourceMutation: ScenarioMutation;
  promotionMutation: ScenarioMutation;
  run: WorkflowCommandExecution;
  chain: string;
  promotedAtMs: number;
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
  executionMode: ExecutionMode;
  guardrailProfile: GuardrailProfile;
  status: RunStatus;
  startedAtMs: number;
  finishedAtMs?: number;
  rollbackWindowUntilMs?: number;
  rollbackEligible: boolean;
  rollbackOfRunId?: string;
  statusTimeline: RunStatusTransition[];
  guardrailResults: GuardrailResult[];
  effectSummaries: EffectSummary[];
  idempotencyKey?: string;
  rollbackOnFailure: boolean;
  errorCount: number;
  actorId: string;
  sourceSurface: string;
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

export type OpsActivityListResult = {
  events: OpsActivityEvent[];
  nextCursor?: string;
};

export type OpsBackfillResult = {
  attempted: number;
  total: number;
};

export type OpsMaintenanceResult = {
  removed: number;
  total: number;
};

export type QueueRequeueExpiredResult = {
  moved: number;
  queueSize: number;
  queueInFlight: number;
};

export type WorkerDeadLetter = {
  id: string;
  attemptId: string;
  workerId: string;
  jobId: string;
  jobName: string;
  receipt: string;
  attempt: number;
  status: 'open' | 'replayed' | 'resolved';
  replayCount: number;
  lastReplayedAtMs?: number;
  resolvedAtMs?: number;
  resolutionNote?: string;
  errorMessage?: string;
  payload?: Record<string, unknown>;
  createdAtMs: number;
};

export type ReplayWorkerDeadLettersResult = {
  replayed: number;
  skipped: number;
  notFound: string[];
  queueSize: number;
  queueInFlight: number;
};

export type WorkerQueueHealth = {
  windowMs: number;
  sampleSize: number;
  generatedAtMs: number;
  counts: {
    acked: number;
    requeued: number;
    dropped: number;
    ackMiss: number;
  };
  processingMs: {
    p50: number;
    p95: number;
    max: number;
  };
  throughputPerMinute: number;
  failureRate: number;
  retryRate: number;
  deadLetterRate: number;
};

export type OpsActivityTaskStatus = {
  running: boolean;
  lastStartedAtMs?: number;
  lastFinishedAtMs?: number;
  lastDurationMs?: number;
  lastError?: string;
  runCount: number;
  lastResult?: Record<string, number>;
};

export type OpsActivityPipelineStatus = {
  orchestrator: OpsActivityTaskStatus;
  backfill: OpsActivityTaskStatus;
  maintenance: OpsActivityTaskStatus;
};

export type OpsActivityPipelineStartResult = {
  started: boolean;
  status: OpsActivityPipelineStatus;
};

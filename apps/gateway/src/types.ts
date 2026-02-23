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

export type OpsState = {
  pendingReviews: number;
  urgentReviews: number;
  expiringContracts: number;
  updatedAtMs: number;
};

export type NarrativePulse = {
  summary: string;
  highlights: string[];
  actionHints: string[];
  generatedAtMs: number;
};

export type OpsActivityKind =
  | 'workflow-command-run'
  | 'workflow-playbook-run'
  | 'workflow-close-run'
  | 'focus-action-outcome'
  | 'scenario-adoption'
  | 'delegate-lane'
  | 'policy-egress';

export type OpsActivityEvent = {
  id: string;
  kind: OpsActivityKind;
  title: string;
  detail: string;
  route?: string;
  severity: 'info' | 'warn' | 'critical';
  createdAtMs: number;
  meta?: Record<string, unknown>;
};

export type OpsActivityCursor = {
  createdAtMs: number;
  id: string;
};

export type OpsActivityListResult = {
  events: OpsActivityEvent[];
  nextCursor?: string;
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

export type ClaimedQueueJobView = {
  id: string;
  name: string;
  payload: Record<string, unknown>;
  createdAtMs: number;
  receipt: string;
  attempt: number;
  claimedAtMs: number;
  visibleAtMs: number;
};

export type QueueClaimResult = {
  jobs: ClaimedQueueJobView[];
  queueSize: number;
  queueInFlight: number;
};

export type QueueAckResult = {
  acknowledged: boolean;
  action: 'acked' | 'requeued' | 'dropped';
  queueSize: number;
  queueInFlight: number;
};

export type QueueRequeueExpiredResult = {
  moved: number;
  queueSize: number;
  queueInFlight: number;
};

export type WorkerJobFingerprintClaimResult = {
  status: 'acquired' | 'already-processed' | 'already-claimed';
  fingerprint: string;
  leaseKey: string;
  ownerId: string;
  ttlMs: number;
  expiresAtMs?: number;
};

export type WorkerFingerprintClaimStatus =
  | 'acquired'
  | 'already-processed'
  | 'already-claimed'
  | 'released'
  | 'release-miss';

export type WorkerFingerprintClaimEvent = {
  id: string;
  workerId: string;
  fingerprint: string;
  leaseKey: string;
  status: WorkerFingerprintClaimStatus;
  ttlMs: number;
  expiresAtMs?: number;
  staleRecovered: boolean;
  createdAtMs: number;
};

export type WorkerJobAttempt = {
  id: string;
  workerId: string;
  jobId: string;
  jobName: string;
  jobFingerprint?: string;
  receipt: string;
  attempt: number;
  outcome: 'acked' | 'requeued' | 'dropped' | 'ack-miss';
  processingMs?: number;
  errorMessage?: string;
  payload?: Record<string, unknown>;
  createdAtMs: number;
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

export type WorkerQueueLeaseResult = {
  acquired: boolean;
  leaseKey: string;
  ownerId: string;
  ttlMs: number;
  expiresAtMs: number;
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

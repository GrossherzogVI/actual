import { customAlphabet } from 'nanoid';

import {
  buildGermanHolidaySet,
  isBusinessDay,
  parseCommandChain,
  rankRecommendations,
  type CommandParseStep,
  type Recommendation,
} from '@finance-os/domain-kernel';

import type { GatewayRepository } from '../repositories/types';
import type { GatewayQueue, QueueJob } from '../queue/types';
import type {
  ActionOutcome,
  CloseRun,
  DelegateLane,
  DelegateLaneEvent,
  EffectSummary,
  EgressAuditEntry,
  EgressPolicy,
  ExecutionMode,
  FocusPanel,
  GuardrailProfile,
  GuardrailResult,
  LedgerEvent,
  NarrativePulse,
  OpsActivityCursor,
  OpsActivityEvent,
  OpsActivityListResult,
  OpsActivityPipelineStartResult,
  OpsActivityPipelineStatus,
  OpsActivityTaskStatus,
  PlaybookRun,
  QueueAckResult,
  QueueClaimResult,
  QueueRequeueExpiredResult,
  ReplayWorkerDeadLettersResult,
  RunStatus,
  RunStatusTransition,
  ScenarioAdoptionCheck,
  ScenarioBranch,
  ScenarioComparison,
  ScenarioLineage,
  ScenarioLineageNode,
  ScenarioMutation,
  TemporalLaneSignal,
  TemporalSignalSeverity,
  TemporalSignals,
  WorkerDeadLetter,
  WorkerJobFingerprintClaimResult,
  WorkerQueueHealth,
  WorkerQueueLeaseResult,
  WorkflowAction,
  WorkflowCommandExecution,
  WorkflowCommandExecutionStep,
  WorkflowPlaybook,
} from '../types';
import { buildStepEffectSummary, isStepReversible, toRollbackEffectSummaries } from './autopilot/effects';
import { evaluateGuardrails } from './autopilot/guardrails';
import {
  computeRollbackWindowUntil,
  isRollbackEligibleByEffects,
  isRollbackSourceStatus,
} from './autopilot/status';

const nanoid = customAlphabet('1234567890abcdefghijklmnopqrstuvwxyz', 16);

export type GatewayService = ReturnType<typeof createGatewayService>;

function queueJob(name: string, payload: Record<string, unknown>): QueueJob {
  return {
    id: nanoid(),
    name,
    payload,
    createdAtMs: Date.now(),
  };
}

type ExecutionOptionsInput = {
  executionMode?: ExecutionMode;
  guardrailProfile?: GuardrailProfile;
  rollbackWindowMinutes?: number;
  idempotencyKey?: string;
  rollbackOnFailure?: boolean;
};

type NormalizedExecutionOptions = {
  executionMode: ExecutionMode;
  guardrailProfile: GuardrailProfile;
  rollbackWindowMinutes: number;
  idempotencyKey?: string;
  rollbackOnFailure: boolean;
};

const TERMINAL_RUN_STATUSES: ReadonlySet<RunStatus> = new Set([
  'completed',
  'failed',
  'blocked',
  'rolled_back',
]);

const DELEGATE_ALLOWED_TRANSITIONS: Record<
  DelegateLane['status'],
  DelegateLane['status'][]
> = {
  assigned: ['accepted', 'rejected'],
  accepted: ['completed', 'rejected'],
  completed: ['assigned'],
  rejected: ['assigned'],
};

const OPS_ACTIVITY_PIPELINE_LEASE_KEY = 'ops-activity-pipeline';
const OPS_ACTIVITY_BACKFILL_LEASE_KEY = 'ops-activity-backfill';
const OPS_ACTIVITY_MAINTENANCE_LEASE_KEY = 'ops-activity-maintenance';
const OPS_ACTIVITY_PIPELINE_LEASE_TTL_MS = 30 * 60 * 1000;
const DEFAULT_QUEUE_VISIBILITY_TIMEOUT_MS = 60_000;
const DEFAULT_WORKER_QUEUE_LEASE_KEY = 'worker-queue-drain';
const WORKER_FINGERPRINT_LEASE_KEY_PREFIX = 'worker-fingerprint';
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const TEMPORAL_WEEKDAY_FORMATTER = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
});
const BUNDESLAND_CODES = [
  'BW',
  'BY',
  'BE',
  'BB',
  'HB',
  'HH',
  'HE',
  'MV',
  'NI',
  'NW',
  'RP',
  'SL',
  'SN',
  'ST',
  'SH',
  'TH',
] as const;
type KernelBundesland = NonNullable<Parameters<typeof buildGermanHolidaySet>[1]>;

function workerFingerprintLeaseKey(fingerprint: string): string {
  return `${WORKER_FINGERPRINT_LEASE_KEY_PREFIX}:${fingerprint}`;
}

function normalizeBundesland(input?: string): KernelBundesland {
  const upper = typeof input === 'string' ? input.trim().toUpperCase() : '';
  if ((BUNDESLAND_CODES as readonly string[]).includes(upper)) {
    return upper as KernelBundesland;
  }
  return 'BE';
}

function dateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function parseLaneDeadline(lane: DelegateLane): {
  dueAtMs?: number;
  deadlineDate?: string;
} {
  if (typeof lane.dueAtMs === 'number' && Number.isFinite(lane.dueAtMs)) {
    const dueDate = startOfDay(new Date(lane.dueAtMs));
    return {
      dueAtMs: dueDate.getTime(),
      deadlineDate: dateKey(dueDate),
    };
  }

  const rawDeadline = lane.payload?.deadline;
  if (typeof rawDeadline === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawDeadline)) {
    const parsed = Date.parse(`${rawDeadline}T00:00:00`);
    if (Number.isFinite(parsed)) {
      return {
        dueAtMs: parsed,
        deadlineDate: rawDeadline,
      };
    }
  }

  return {};
}

function laneSeverity(
  lane: DelegateLane,
  daysUntilDue?: number,
): TemporalSignalSeverity {
  if (typeof daysUntilDue !== 'number') {
    return lane.priority === 'critical' ? 'warn' : 'info';
  }
  if (daysUntilDue < 0) {
    return 'critical';
  }
  if (daysUntilDue <= 1) {
    return 'critical';
  }
  if (daysUntilDue <= 3) {
    return 'warn';
  }
  if (
    daysUntilDue <= 7 &&
    (lane.priority === 'critical' || lane.priority === 'high')
  ) {
    return 'warn';
  }
  return 'info';
}

function laneReason(daysUntilDue?: number): string {
  if (typeof daysUntilDue !== 'number') {
    return 'No due date linked to this lane.';
  }
  if (daysUntilDue < 0) {
    return `Deadline missed by ${Math.abs(daysUntilDue)} day(s).`;
  }
  if (daysUntilDue === 0) {
    return 'Deadline is today.';
  }
  if (daysUntilDue === 1) {
    return 'Deadline is tomorrow.';
  }
  return `Deadline in ${daysUntilDue} day(s).`;
}

function severitySortValue(severity: TemporalSignalSeverity): number {
  if (severity === 'critical') return 0;
  if (severity === 'warn') return 1;
  return 2;
}

function isLaneStaleForEscalation(
  lane: DelegateLane,
  nowMs: number,
): boolean {
  if (lane.status !== 'assigned') {
    return false;
  }
  const staleThresholdMs = 48 * 60 * 60 * 1000;
  const isStale = nowMs - lane.updatedAtMs >= staleThresholdMs;
  if (!isStale) {
    return false;
  }

  const deadline = parseLaneDeadline(lane);
  if (typeof deadline.dueAtMs !== 'number') {
    return true;
  }
  const daysUntilDue = Math.floor((deadline.dueAtMs - nowMs) / MS_PER_DAY);
  return daysUntilDue <= 3;
}

function createEmptyOpsTaskStatus(): OpsActivityTaskStatus {
  return {
    running: false,
    runCount: 0,
  };
}

function cloneOpsTaskStatus(status: OpsActivityTaskStatus): OpsActivityTaskStatus {
  return {
    running: status.running,
    runCount: status.runCount,
    lastStartedAtMs: status.lastStartedAtMs,
    lastFinishedAtMs: status.lastFinishedAtMs,
    lastDurationMs: status.lastDurationMs,
    lastError: status.lastError,
    lastResult: status.lastResult ? { ...status.lastResult } : undefined,
  };
}

function outcomeSeverity(outcome: string): OpsActivityEvent['severity'] {
  const normalized = outcome.toLowerCase();
  if (
    normalized.includes('failed') ||
    normalized.includes('error') ||
    normalized.includes('critical')
  ) {
    return 'critical';
  }
  if (
    normalized.includes('rejected') ||
    normalized.includes('defer') ||
    normalized.includes('ignore')
  ) {
    return 'warn';
  }
  return 'info';
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = values.slice().sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil(sorted.length * p) - 1);
  return sorted[index] || 0;
}

function safeRate(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }
  return Number((numerator / denominator).toFixed(4));
}

function encodeOpsActivityCursor(cursor: OpsActivityCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf-8').toString('base64url');
}

function decodeOpsActivityCursor(value?: string): OpsActivityCursor | null {
  if (!value || typeof value !== 'string') {
    return null;
  }
  try {
    const raw = Buffer.from(value, 'base64url').toString('utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    const cursor = parsed as Partial<OpsActivityCursor>;
    if (
      typeof cursor.createdAtMs !== 'number' ||
      !Number.isFinite(cursor.createdAtMs) ||
      typeof cursor.id !== 'string' ||
      cursor.id.length === 0
    ) {
      return null;
    }
    return {
      createdAtMs: cursor.createdAtMs,
      id: cursor.id,
    };
  } catch {
    return null;
  }
}

function normalizeExecutionOptions(
  input: ExecutionOptionsInput | undefined,
  fallbackMode: ExecutionMode,
): NormalizedExecutionOptions {
  const executionMode =
    input?.executionMode === 'dry-run' || input?.executionMode === 'live'
      ? input.executionMode
      : fallbackMode;
  const guardrailProfile =
    input?.guardrailProfile === 'strict' ||
    input?.guardrailProfile === 'balanced' ||
    input?.guardrailProfile === 'off'
      ? input.guardrailProfile
      : executionMode === 'live'
        ? 'strict'
        : 'balanced';
  const rollbackWindowMinutes = Math.max(
    1,
    Math.min(1440, Math.trunc(input?.rollbackWindowMinutes ?? 60)),
  );
  const idempotencyKey =
    typeof input?.idempotencyKey === 'string' &&
    input.idempotencyKey.trim().length >= 8 &&
    input.idempotencyKey.trim().length <= 128
      ? input.idempotencyKey.trim()
      : undefined;
  const rollbackOnFailure =
    typeof input?.rollbackOnFailure === 'boolean'
      ? input.rollbackOnFailure
      : false;

  return {
    executionMode,
    guardrailProfile,
    rollbackWindowMinutes,
    idempotencyKey,
    rollbackOnFailure,
  };
}

function statusSeverity(status: RunStatus): OpsActivityEvent['severity'] {
  if (status === 'failed' || status === 'blocked') {
    return 'critical';
  }
  if (status === 'rolled_back') {
    return 'warn';
  }
  return 'info';
}

function createTerminalStatusTimeline(input: {
  status: RunStatus;
  startedAtMs: number;
  finishedAtMs: number;
  note?: string;
}): RunStatusTransition[] {
  const runningAtMs = Math.min(input.finishedAtMs, input.startedAtMs + 1);
  return [
    {
      status: 'planned',
      atMs: input.startedAtMs,
      note: 'Execution accepted.',
    },
    {
      status: 'running',
      atMs: runningAtMs,
      note: 'Execution started.',
    },
    {
      status: input.status,
      atMs: Math.max(input.finishedAtMs, runningAtMs),
      note: input.note,
    },
  ];
}

function isTerminalStatus(status: RunStatus): boolean {
  return TERMINAL_RUN_STATUSES.has(status);
}

function toCommandRunActivity(run: WorkflowCommandExecution): OpsActivityEvent {
  return {
    id: `command-run-${run.id}`,
    kind: 'workflow-command-run',
    title: `Command chain ${run.status.replace('_', ' ')}`,
    detail: `${run.chain} (${run.steps.length} steps, ${run.errorCount} error(s), actor ${run.actorId}, ${run.executionMode})`,
    route: run.steps.find(step => typeof step.route === 'string')?.route,
    severity: statusSeverity(run.status),
    createdAtMs: run.finishedAtMs || run.startedAtMs || run.executedAtMs,
    meta: {
      runId: run.id,
      actorId: run.actorId,
      sourceSurface: run.sourceSurface,
      executionMode: run.executionMode,
      status: run.status,
      errorCount: run.errorCount,
      rollbackEligible: run.rollbackEligible,
      rollbackWindowUntilMs: run.rollbackWindowUntilMs,
    },
  };
}

function toPlaybookRunActivity(run: PlaybookRun): OpsActivityEvent {
  return {
    id: `playbook-run-${run.id}`,
    kind: 'workflow-playbook-run',
    title: `Playbook run ${run.status.replace('_', ' ')}`,
    detail: `${run.executedSteps} step(s), ${run.errorCount} error(s), actor ${run.actorId}, ${run.executionMode}`,
    route: '/ops',
    severity: statusSeverity(run.status),
    createdAtMs: run.createdAtMs,
    meta: {
      runId: run.id,
      playbookId: run.playbookId,
      chain: run.chain,
      sourceSurface: run.sourceSurface,
      errorCount: run.errorCount,
      executionMode: run.executionMode,
      status: run.status,
      rollbackEligible: run.rollbackEligible,
      rollbackWindowUntilMs: run.rollbackWindowUntilMs,
    },
  };
}

function toCloseRunActivity(run: CloseRun): OpsActivityEvent {
  return {
    id: `close-run-${run.id}`,
    kind: 'workflow-close-run',
    title: `${run.period === 'weekly' ? 'Weekly' : 'Monthly'} close routine executed`,
    detail: `${run.exceptionCount} exception(s), ${run.summary.pendingReviews} pending review(s), ${run.summary.expiringContracts} expiring contract(s).`,
    route: '/ops',
    severity: run.exceptionCount > 0 ? 'warn' : 'info',
    createdAtMs: run.createdAtMs,
    meta: {
      runId: run.id,
      period: run.period,
      exceptionCount: run.exceptionCount,
    },
  };
}

function toActionOutcomeActivity(outcome: ActionOutcome): OpsActivityEvent {
  return {
    id: `focus-outcome-${outcome.id}`,
    kind: 'focus-action-outcome',
    title: `Focus outcome: ${outcome.outcome}`,
    detail: `${outcome.actionId}${outcome.notes ? ` - ${outcome.notes}` : ''}`,
    route: '/ops#adaptive-focus',
    severity: outcomeSeverity(outcome.outcome),
    createdAtMs: outcome.recordedAtMs,
    meta: {
      outcomeId: outcome.id,
      actionId: outcome.actionId,
      outcome: outcome.outcome,
    },
  };
}

function toScenarioAdoptionActivity(
  branch: ScenarioBranch,
  riskScore?: number,
): OpsActivityEvent {
  const createdAtMs = branch.adoptedAtMs || branch.updatedAtMs;
  return {
    id: `scenario-adoption-${branch.id}`,
    kind: 'scenario-adoption',
    title: `Scenario adopted: ${branch.name}`,
    detail: `Lineage baseline ${branch.baseBranchId || 'root'}.${
      typeof riskScore === 'number' ? ` Risk score ${riskScore}.` : ''
    }`,
    route: '/ops#spatial-twin',
    severity: typeof riskScore === 'number' && riskScore >= 80 ? 'warn' : 'info',
    createdAtMs,
    meta: {
      branchId: branch.id,
      baseBranchId: branch.baseBranchId,
      adoptedAtMs: branch.adoptedAtMs,
      riskScore,
    },
  };
}

function toPolicyActivity(entry: EgressAuditEntry): OpsActivityEvent {
  const severity: OpsActivityEvent['severity'] =
    entry.eventType.includes('blocked') || entry.eventType.includes('violation')
      ? 'critical'
      : entry.eventType.includes('warn')
        ? 'warn'
        : 'info';
  const provider =
    typeof entry.provider === 'string' && entry.provider.length > 0
      ? ` (${entry.provider})`
      : '';

  return {
    id: `policy-egress-${entry.id}`,
    kind: 'policy-egress',
    title: `Policy event: ${entry.eventType}${provider}`,
    detail:
      typeof entry.payload === 'object' && entry.payload
        ? JSON.stringify(entry.payload)
        : 'No payload attached.',
    route: '/ops#policy',
    severity,
    createdAtMs: entry.createdAtMs,
    meta: {
      auditId: entry.id,
      eventType: entry.eventType,
      provider: entry.provider,
    },
  };
}

function toDelegateLaneEventActivity(
  lane: DelegateLane,
  event: DelegateLaneEvent,
): OpsActivityEvent {
  const baseTitle =
    event.type === 'comment'
      ? `Delegate lane comment: ${lane.title}`
      : `Delegate lane ${event.type}: ${lane.title}`;
  const detail =
    event.type === 'comment'
      ? `${event.actorId}: ${event.message || 'commented'}`
      : `${lane.assignee} (${lane.priority})${event.message ? ` - ${event.message}` : ''}`;
  const severity =
    event.type === 'rejected'
      ? lane.priority === 'critical'
        ? 'critical'
        : 'warn'
      : 'info';

  return {
    id: `delegate-lane-${event.id}`,
    kind: 'delegate-lane',
    title: baseTitle,
    detail,
    route: '/ops#delegate-lanes',
    severity,
    createdAtMs: event.createdAtMs,
    meta: {
      laneId: lane.id,
      status: lane.status,
      priority: lane.priority,
      assignee: lane.assignee,
      eventType: event.type,
    },
  };
}

function toPlaybookToken(command: Record<string, unknown>): string | null {
  const verb = typeof command.verb === 'string' ? command.verb : null;
  const token = typeof command.token === 'string' ? command.token : null;
  const chainToken =
    typeof command.chainToken === 'string' ? command.chainToken : null;

  const candidate = chainToken || token || verb;
  if (!candidate) {
    return null;
  }

  if (candidate === 'resolve-next-action' || candidate === 'resolve-next') {
    return 'triage';
  }
  if (candidate === 'run-close') {
    const period = command.period;
    return period === 'monthly' ? 'close-monthly' : 'close-weekly';
  }
  if (candidate === 'run-close-weekly') {
    return 'close-weekly';
  }
  if (candidate === 'run-close-monthly') {
    return 'close-monthly';
  }
  if (candidate === 'open-expiring-contracts') {
    return 'expiring<30d';
  }
  if (candidate === 'assign-expiring-contracts-lane') {
    return 'batch-renegotiate';
  }
  if (candidate === 'open-urgent-review') {
    return 'open-review';
  }
  if (candidate === 'refresh-command-center') {
    return 'refresh';
  }
  if (candidate === 'create-default-playbook') {
    return 'playbook-create-default';
  }
  if (candidate === 'run-first-playbook') {
    return 'run-first';
  }

  return null;
}

export function createGatewayService(
  repository: GatewayRepository,
  queue: GatewayQueue,
) {
  const pipelineLeaseOwnerId = `gateway-${nanoid()}`;
  const opsActivityPipelineState: OpsActivityPipelineStatus = {
    orchestrator: createEmptyOpsTaskStatus(),
    backfill: createEmptyOpsTaskStatus(),
    maintenance: createEmptyOpsTaskStatus(),
  };

  function snapshotOpsActivityPipelineStatus(): OpsActivityPipelineStatus {
    return {
      orchestrator: cloneOpsTaskStatus(opsActivityPipelineState.orchestrator),
      backfill: cloneOpsTaskStatus(opsActivityPipelineState.backfill),
      maintenance: cloneOpsTaskStatus(opsActivityPipelineState.maintenance),
    };
  }

  function beginOpsTask(task: OpsActivityTaskStatus) {
    task.running = true;
    task.runCount += 1;
    task.lastStartedAtMs = Date.now();
    task.lastError = undefined;
    task.lastResult = undefined;
  }

  function finishOpsTask(task: OpsActivityTaskStatus, result: Record<string, number>) {
    const finishedAtMs = Date.now();
    task.running = false;
    task.lastFinishedAtMs = finishedAtMs;
    task.lastDurationMs = task.lastStartedAtMs
      ? finishedAtMs - task.lastStartedAtMs
      : undefined;
    task.lastResult = result;
  }

  function failOpsTask(task: OpsActivityTaskStatus, error: unknown) {
    const failedAtMs = Date.now();
    task.running = false;
    task.lastFinishedAtMs = failedAtMs;
    task.lastDurationMs = task.lastStartedAtMs
      ? failedAtMs - task.lastStartedAtMs
      : undefined;
    task.lastError = error instanceof Error ? error.message : String(error);
  }

  async function appendOpsActivityEvent(event: OpsActivityEvent) {
    await repository.appendOpsActivityEvent(event);
  }

  async function appendWorkerFingerprintClaimEvent(input: {
    workerId: string;
    fingerprint: string;
    leaseKey: string;
    status: 'acquired' | 'already-processed' | 'already-claimed' | 'released' | 'release-miss';
    ttlMs: number;
    expiresAtMs?: number;
    staleRecovered?: boolean;
  }) {
    await repository.createWorkerFingerprintClaimEvent({
      id: nanoid(),
      workerId: input.workerId,
      fingerprint: input.fingerprint,
      leaseKey: input.leaseKey,
      status: input.status,
      ttlMs: Math.max(0, Math.trunc(input.ttlMs)),
      expiresAtMs: input.expiresAtMs,
      staleRecovered: input.staleRecovered === true,
      createdAtMs: Date.now(),
    });
  }

  async function resolveNextAction(): Promise<WorkflowAction> {
    const state = await repository.getOpsState();

    if (state.urgentReviews > 0) {
      return {
        id: 'next-urgent-review',
        title: `${state.urgentReviews} urgent review item(s)`,
        route: '/review?priority=urgent',
        confidence: 0.94,
      };
    }

    if (state.expiringContracts > 0) {
      return {
        id: 'next-expiring-contracts',
        title: `${state.expiringContracts} contract(s) expiring in 30d`,
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

  async function getMoneyPulse() {
    const state = await repository.getOpsState();
    return {
      pendingReviews: state.pendingReviews,
      urgentReviews: state.urgentReviews,
      expiringContracts: state.expiringContracts,
      generatedAtMs: Date.now(),
    };
  }

  async function getNarrativePulse(): Promise<NarrativePulse> {
    const now = Date.now();
    const state = await repository.getOpsState();
    const recs = await recommend();
    const openLanes = await repository.listDelegateLanes(100, {
      status: 'assigned',
    });
    const dueSoon = openLanes.filter(
      lane => typeof lane.dueAtMs === 'number' && lane.dueAtMs <= now + 72 * 60 * 60 * 1000,
    ).length;
    const latestClose = (await repository.listCloseRuns(1))[0];

    const highlights = [
      `${state.urgentReviews} urgent review item(s) and ${state.pendingReviews} pending total.`,
      `${state.expiringContracts} contract(s) expiring in the next 30 days.`,
      `${dueSoon} delegate lane(s) due within 72 hours.`,
      latestClose
        ? `Last ${latestClose.period} close had ${latestClose.exceptionCount} exception(s).`
        : 'No close history yet.',
    ];

    const actionHints = recs.slice(0, 3).map(recommendation => recommendation.title);

    return {
      summary:
        actionHints.length > 0
          ? `Top move now: ${actionHints[0]}.`
          : 'No high-confidence recommendations at this time.',
      highlights,
      actionHints,
      generatedAtMs: now,
    };
  }

  async function listPlaybooks(): Promise<WorkflowPlaybook[]> {
    return repository.listPlaybooks();
  }

  async function listPlaybookRuns(
    limit = 20,
    filters?: {
      playbookId?: string;
      actorId?: string;
      sourceSurface?: string;
      executionMode?: ExecutionMode;
      status?: RunStatus;
      idempotencyKey?: string;
      hasErrors?: boolean;
    },
  ) {
    return repository.listPlaybookRuns(Math.max(1, Math.min(limit, 200)), filters);
  }

  async function listWorkflowCommandRuns(
    limit = 20,
    filters?: {
      actorId?: string;
      sourceSurface?: string;
      executionMode?: ExecutionMode;
      status?: RunStatus;
      idempotencyKey?: string;
      hasErrors?: boolean;
    },
  ) {
    return repository.listWorkflowCommandRuns(
      Math.max(1, Math.min(limit, 200)),
      filters,
    );
  }

  async function createPlaybook(input: {
    name: string;
    description: string;
    commands: Array<Record<string, unknown>>;
  }): Promise<WorkflowPlaybook> {
    const now = Date.now();
    const playbook = await repository.createPlaybook({
      id: nanoid(),
      name: input.name,
      description: input.description,
      commands: input.commands,
      createdAtMs: now,
    });

    await queue.enqueue(
      queueJob('workflow.playbook.created', {
        playbookId: playbook.id,
      }),
    );

    return playbook;
  }

  async function runPlaybook(
    playbookId: string,
    optionsInput?: ExecutionOptionsInput,
    actorId = 'owner',
    sourceSurface = 'unknown',
  ): Promise<PlaybookRun | null> {
    const options = normalizeExecutionOptions(optionsInput, 'dry-run');
    if (options.idempotencyKey) {
      const existing = await repository.findRunByIdempotencyKey(
        'playbook',
        options.idempotencyKey,
      );
      if (
        existing &&
        'playbookId' in existing &&
        isTerminalStatus(existing.status)
      ) {
        return existing;
      }
    }

    const playbook = await repository.getPlaybookById(playbookId);
    if (!playbook) return null;

    const startedAtMs = Date.now();
    const runId = nanoid();
    const baseSteps = playbook.commands.map((command, index) => {
      const token = toPlaybookToken(command);
      return {
        index,
        command,
        token,
      };
    });

    const unsupportedSteps = baseSteps
      .filter(step => !step.token)
      .map(step => ({
        index: step.index,
        command: step.command,
        status: 'error',
        detail: 'Unsupported playbook command payload.',
      }));

    const executableSteps = baseSteps.filter(
      step => typeof step.token === 'string',
    ) as Array<{
      index: number;
      command: Record<string, unknown>;
      token: string;
    }>;

    const chain = executableSteps.map(step => step.token).join(' -> ');
    const parsed = chain
      ? parseCommandChain(chain)
      : ({ steps: [], errors: [] } as {
          steps: CommandParseStep[];
          errors: Array<{ code: 'empty-command' | 'unknown-token'; index: number; raw: string }>;
        });

    const opsState = await repository.getOpsState();
    const nonReversibleStepIds = new Set(
      parsed.steps
        .filter(step => !isStepReversible(step.id))
        .map(step => step.id),
    );
    const guardrailEvaluation = evaluateGuardrails({
      opsState,
      actorId,
      steps: parsed.steps,
      parseErrors: parsed.errors,
      profile: options.guardrailProfile,
      mode: options.executionMode,
      rollbackRequired: options.rollbackOnFailure,
      nonReversibleStepIds,
    });
    const shouldBlock =
      options.executionMode === 'live' && guardrailEvaluation.hasBlockingFailure;

    const plannedStatusTimeline: RunStatusTransition[] = [
      {
        status: 'planned',
        atMs: startedAtMs,
        note: 'Execution accepted.',
      },
    ];
    const runningStatusTimeline: RunStatusTransition[] = [
      ...plannedStatusTimeline,
      {
        status: 'running',
        atMs: startedAtMs + 1,
        note: 'Execution started.',
      },
    ];
    const inFlightRunBase: PlaybookRun = {
      id: runId,
      playbookId,
      chain,
      executionMode: options.executionMode,
      guardrailProfile: options.guardrailProfile,
      status: 'planned',
      startedAtMs,
      finishedAtMs: undefined,
      rollbackWindowUntilMs: undefined,
      rollbackEligible: false,
      rollbackOfRunId: undefined,
      statusTimeline: plannedStatusTimeline,
      guardrailResults: guardrailEvaluation.results,
      effectSummaries: [],
      idempotencyKey: options.idempotencyKey,
      rollbackOnFailure: options.rollbackOnFailure,
      executedSteps: 0,
      errorCount: 0,
      actorId,
      sourceSurface,
      steps: [],
      createdAtMs: startedAtMs,
    };

    await repository.createPlaybookRun(inFlightRunBase);
    await repository.updatePlaybookRun({
      ...inFlightRunBase,
      status: 'running',
      statusTimeline: runningStatusTimeline,
    });
    await queue.enqueue(
      queueJob('autopilot-run-started', {
        scope: 'playbook',
        runId,
        playbookId,
        actorId,
        sourceSurface,
        executionMode: options.executionMode,
        guardrailProfile: options.guardrailProfile,
      }),
    );

    let commandRun: WorkflowCommandExecution | undefined;
    if (!shouldBlock && chain) {
      commandRun = await executeWorkflowCommandChain({
        chain,
        options,
        actorId,
        sourceSurface,
      });
    }

    const executedSteps = executableSteps.map((step, index) => {
      const executionStep = commandRun?.steps[index];
      if (!executionStep) {
        return {
          index: step.index,
          command: step.command,
          status: 'error',
          detail: 'Missing execution result for playbook command.',
        };
      }

      return {
        index: step.index,
        command: step.command,
        status: executionStep.status,
        detail: executionStep.detail,
      };
    });

    const steps = [...unsupportedSteps, ...executedSteps].sort(
      (a, b) => a.index - b.index,
    );

    const fallbackEffects: EffectSummary[] = steps.map((step, index) =>
      buildStepEffectSummary({
        effectId: `playbook-effect-${index + 1}`,
        stepId: typeof step.command.verb === 'string' ? step.command.verb : `step-${step.index}`,
        detail: step.detail || `Step ${step.index + 1}`,
        mode: options.executionMode,
        stepStatus: step.status === 'error' ? 'error' : 'ok',
      }),
    );
    const effectSummaries =
      commandRun && commandRun.effectSummaries.length > 0
        ? commandRun.effectSummaries
        : fallbackEffects;
    const errorCount = steps.filter(step => step.status === 'error').length;

    const status: RunStatus = shouldBlock
      ? 'blocked'
      : errorCount > 0
        ? 'failed'
        : 'completed';
    const finishedAtMs = commandRun?.finishedAtMs ?? Date.now();
    const rollbackEligible =
      options.executionMode === 'live' &&
      (status === 'completed' || status === 'failed') &&
      isRollbackEligibleByEffects(effectSummaries);
    const rollbackWindowUntilMs = rollbackEligible
      ? computeRollbackWindowUntil(startedAtMs, options.rollbackWindowMinutes)
      : undefined;
    const statusTimeline = createTerminalStatusTimeline({
      status,
      startedAtMs,
      finishedAtMs,
      note: shouldBlock
        ? 'Blocked by guardrail policy.'
        : status === 'failed'
          ? 'Execution finished with step errors.'
          : 'Execution completed.',
    });

    const run: PlaybookRun = {
      id: runId,
      playbookId,
      chain,
      executionMode: options.executionMode,
      guardrailProfile: options.guardrailProfile,
      status,
      startedAtMs,
      finishedAtMs,
      rollbackWindowUntilMs,
      rollbackEligible,
      rollbackOfRunId: undefined,
      statusTimeline,
      guardrailResults: guardrailEvaluation.results,
      effectSummaries,
      idempotencyKey: options.idempotencyKey,
      rollbackOnFailure: options.rollbackOnFailure,
      executedSteps: steps.length,
      errorCount,
      actorId,
      sourceSurface,
      steps,
      createdAtMs: startedAtMs,
    };

    const persisted = await repository.updatePlaybookRun(run);
    if (!persisted) {
      await repository.createPlaybookRun(run);
    }
    await queue.enqueue(
      queueJob(
        run.status === 'blocked' ? 'autopilot-run-blocked' : 'autopilot-run-completed',
        {
          scope: 'playbook',
          runId: run.id,
          playbookId,
          status: run.status,
          errorCount: run.errorCount,
        },
      ),
    );
    await queue.enqueue(
      queueJob('workflow.playbook.run', {
        runId: run.id,
        playbookId,
        chain,
        executionMode: run.executionMode,
        guardrailProfile: run.guardrailProfile,
        status: run.status,
        rollbackEligible: run.rollbackEligible,
        rollbackWindowUntilMs: run.rollbackWindowUntilMs,
        idempotencyKey: run.idempotencyKey,
        actorId,
        sourceSurface,
        errorCount: run.errorCount,
      }),
    );

    await appendOpsActivityEvent(toPlaybookRunActivity(run));

    if (
      run.status === 'failed' &&
      run.executionMode === 'live' &&
      run.rollbackOnFailure &&
      run.rollbackEligible
    ) {
      await rollbackPlaybookRun({
        runId: run.id,
        reason: 'rollback-on-failure',
        actorId,
        sourceSurface,
      });
    }

    return run;
  }

  async function replayPlaybookRun(input: {
    runId: string;
    executionMode?: ExecutionMode;
    guardrailProfile?: GuardrailProfile;
    rollbackWindowMinutes?: number;
    idempotencyKey?: string;
    rollbackOnFailure?: boolean;
    actorId?: string;
    sourceSurface?: string;
  }): Promise<PlaybookRun | null> {
    const previousRun = await repository.getPlaybookRunById(input.runId);
    if (!previousRun) {
      return null;
    }

    return runPlaybook(
      previousRun.playbookId,
      {
        executionMode: input.executionMode || previousRun.executionMode,
        guardrailProfile: input.guardrailProfile || previousRun.guardrailProfile,
        rollbackWindowMinutes:
          typeof input.rollbackWindowMinutes === 'number'
            ? input.rollbackWindowMinutes
            : previousRun.rollbackWindowUntilMs && previousRun.startedAtMs
              ? Math.max(
                  1,
                  Math.trunc(
                    (previousRun.rollbackWindowUntilMs - previousRun.startedAtMs) /
                      60_000,
                  ),
                )
              : 60,
        idempotencyKey: input.idempotencyKey,
        rollbackOnFailure:
          typeof input.rollbackOnFailure === 'boolean'
            ? input.rollbackOnFailure
            : previousRun.rollbackOnFailure,
      },
      input.actorId || previousRun.actorId,
      input.sourceSurface || previousRun.sourceSurface,
    );
  }

  async function runCloseRoutine(period: 'weekly' | 'monthly'): Promise<CloseRun> {
    const state = await repository.getOpsState();
    const run: CloseRun = {
      id: nanoid(),
      period,
      exceptionCount: state.pendingReviews + state.expiringContracts,
      summary: {
        pendingReviews: state.pendingReviews,
        urgentReviews: state.urgentReviews,
        expiringContracts: state.expiringContracts,
      },
      createdAtMs: Date.now(),
    };

    await repository.createCloseRun(run);
    await queue.enqueue(
      queueJob('workflow.close.run', {
        runId: run.id,
        period,
        exceptionCount: run.exceptionCount,
      }),
    );

    await appendOpsActivityEvent(toCloseRunActivity(run));

    return run;
  }

  async function listCloseRuns(
    limit = 20,
    filters?: {
      period?: CloseRun['period'];
      hasExceptions?: boolean;
    },
  ) {
    return repository.listCloseRuns(Math.max(1, Math.min(limit, 200)), filters);
  }

  async function applyBatchPolicy(
    ids: string[],
    status: string,
    resolvedAction: string,
  ): Promise<{ updatedCount: number }> {
    const state = await repository.getOpsState();
    const updatedCount = Math.min(ids.length, state.pendingReviews);

    await repository.setOpsState({
      pendingReviews: Math.max(0, state.pendingReviews - updatedCount),
    });

    await queue.enqueue(
      queueJob('workflow.batch-policy.applied', {
        ids,
        status,
        resolvedAction,
        updatedCount,
      }),
    );

    return { updatedCount };
  }

  async function executeWorkflowCommandChain(input: {
    chain: string;
    assignee?: string;
    options?: ExecutionOptionsInput;
    actorId?: string;
    sourceSurface?: string;
    persist?: boolean;
  }): Promise<WorkflowCommandExecution> {
    const actorId = input.actorId || 'owner';
    const sourceSurface = input.sourceSurface || 'unknown';
    const options = normalizeExecutionOptions(input.options, 'live');
    if (options.idempotencyKey) {
      const existing = await repository.findRunByIdempotencyKey(
        'command',
        options.idempotencyKey,
      );
      if (
        existing &&
        !('playbookId' in existing) &&
        isTerminalStatus(existing.status)
      ) {
        return existing;
      }
    }

    const parsed = parseCommandChain(input.chain);
    const steps: WorkflowCommandExecutionStep[] = [];
    const prefix = options.executionMode === 'dry-run' ? '[dry-run] ' : '';
    const startedAtMs = Date.now();
    const runId = nanoid();
    const opsState = await repository.getOpsState();
    const nonReversibleStepIds = new Set(
      parsed.steps
        .filter(step => !isStepReversible(step.id))
        .map(step => step.id),
    );
    const guardrailEvaluation = evaluateGuardrails({
      opsState,
      actorId,
      steps: parsed.steps,
      parseErrors: parsed.errors,
      profile: options.guardrailProfile,
      mode: options.executionMode,
      rollbackRequired: options.rollbackOnFailure,
      nonReversibleStepIds,
    });
    const shouldBlock =
      options.executionMode === 'live' && guardrailEvaluation.hasBlockingFailure;
    const effectSummaries: EffectSummary[] = [];

    const plannedStatusTimeline: RunStatusTransition[] = [
      {
        status: 'planned',
        atMs: startedAtMs,
        note: 'Execution accepted.',
      },
    ];
    const runningStatusTimeline: RunStatusTransition[] = [
      ...plannedStatusTimeline,
      {
        status: 'running',
        atMs: startedAtMs + 1,
        note: 'Execution started.',
      },
    ];

    if (input.persist !== false) {
      const inFlightRunBase: WorkflowCommandExecution = {
        id: runId,
        chain: input.chain,
        steps: [],
        executionMode: options.executionMode,
        guardrailProfile: options.guardrailProfile,
        status: 'planned',
        startedAtMs,
        finishedAtMs: undefined,
        rollbackWindowUntilMs: undefined,
        rollbackEligible: false,
        rollbackOfRunId: undefined,
        statusTimeline: plannedStatusTimeline,
        guardrailResults: guardrailEvaluation.results,
        effectSummaries: [],
        idempotencyKey: options.idempotencyKey,
        rollbackOnFailure: options.rollbackOnFailure,
        errorCount: 0,
        actorId,
        sourceSurface,
        executedAtMs: startedAtMs,
      };

      await repository.createWorkflowCommandRun(inFlightRunBase);
      await repository.updateWorkflowCommandRun({
        ...inFlightRunBase,
        status: 'running',
        statusTimeline: runningStatusTimeline,
      });
      await queue.enqueue(
        queueJob('autopilot-run-started', {
          scope: 'command',
          runId,
          actorId,
          sourceSurface,
          executionMode: options.executionMode,
          guardrailProfile: options.guardrailProfile,
        }),
      );
    }

    for (const error of parsed.errors) {
      steps.push({
        id: 'command-parse-error',
        raw: error.raw || 'command',
        canonical: '',
        status: 'error',
        detail:
          error.code === 'empty-command'
            ? 'Command chain is empty.'
            : `Unknown command token at position ${error.index + 1}.`,
      });
    }

    if (shouldBlock) {
      steps.push({
        id: 'guardrail-block',
        raw: input.chain,
        canonical: 'guardrail-block',
        status: 'error',
        detail: 'Blocked by guardrail policy.',
      });
    } else {
      for (let index = 0; index < parsed.steps.length; index += 1) {
        const step = parsed.steps[index]!;
        let result: WorkflowCommandExecutionStep;

        if (step.id === 'resolve-next-action') {
          const action = await resolveNextAction();
          result = {
            id: step.id,
            raw: step.raw,
            canonical: step.canonical,
            status: 'ok',
            detail: `${prefix}${action.title}`,
            route: action.route,
          };
        } else if (step.id === 'run-close-weekly') {
          if (options.executionMode === 'dry-run') {
            result = {
              id: step.id,
              raw: step.raw,
              canonical: step.canonical,
              status: 'ok',
              detail: `${prefix}Would run weekly close routine.`,
            };
          } else {
            const run = await runCloseRoutine('weekly');
            result = {
              id: step.id,
              raw: step.raw,
              canonical: step.canonical,
              status: 'ok',
              detail: `${prefix}Weekly close run ${run.id} (${run.exceptionCount} exceptions).`,
            };
          }
        } else if (step.id === 'run-close-monthly') {
          if (options.executionMode === 'dry-run') {
            result = {
              id: step.id,
              raw: step.raw,
              canonical: step.canonical,
              status: 'ok',
              detail: `${prefix}Would run monthly close routine.`,
            };
          } else {
            const run = await runCloseRoutine('monthly');
            result = {
              id: step.id,
              raw: step.raw,
              canonical: step.canonical,
              status: 'ok',
              detail: `${prefix}Monthly close run ${run.id} (${run.exceptionCount} exceptions).`,
            };
          }
        } else if (step.id === 'run-close-safe') {
          if (options.executionMode === 'dry-run') {
            result = {
              id: step.id,
              raw: step.raw,
              canonical: step.canonical,
              status: 'ok',
              detail: `${prefix}Would run safe close routine with guardrail checks.`,
            };
          } else {
            const latestState = await repository.getOpsState();
            if (latestState.urgentReviews > 5) {
              result = {
                id: step.id,
                raw: step.raw,
                canonical: step.canonical,
                status: 'error',
                detail: 'Safe close blocked due to urgent review pressure.',
              };
            } else {
              const run = await runCloseRoutine('weekly');
              result = {
                id: step.id,
                raw: step.raw,
                canonical: step.canonical,
                status: 'ok',
                detail: `${prefix}Safe close run ${run.id} completed.`,
              };
            }
          }
        } else if (step.id === 'create-default-playbook') {
          if (options.executionMode === 'dry-run') {
            result = {
              id: step.id,
              raw: step.raw,
              canonical: step.canonical,
              status: 'ok',
              detail: `${prefix}Would create default weekly triage playbook.`,
            };
          } else {
            const playbook = await createPlaybook({
              name: 'Weekly Triage Autopilot',
              description: 'Created from command chain executor.',
              commands: [
                { verb: 'resolve-next-action', lane: 'triage' },
                { verb: 'open-expiring-contracts', window_days: 30 },
                { verb: 'run-close', period: 'weekly' },
              ],
            });
            result = {
              id: step.id,
              raw: step.raw,
              canonical: step.canonical,
              status: 'ok',
              detail: `${prefix}Created playbook ${playbook.name}.`,
            };
          }
        } else if (step.id === 'run-first-playbook') {
          const first = (await listPlaybooks())[0];
          if (!first) {
            result = {
              id: step.id,
              raw: step.raw,
              canonical: step.canonical,
              status: 'error',
              detail: `${prefix}No playbook available to run.`,
            };
          } else if (options.executionMode === 'dry-run') {
            result = {
              id: step.id,
              raw: step.raw,
              canonical: step.canonical,
              status: 'ok',
              detail: `${prefix}Would run playbook ${first.name}.`,
            };
          } else {
            const run = await runPlaybook(
              first.id,
              {
                ...options,
                executionMode: 'live',
                idempotencyKey: undefined,
              },
              actorId,
              sourceSurface,
            );
            if (!run) {
              result = {
                id: step.id,
                raw: step.raw,
                canonical: step.canonical,
                status: 'error',
                detail: `${prefix}Playbook ${first.id} not found.`,
              };
            } else {
              result = {
                id: step.id,
                raw: step.raw,
                canonical: step.canonical,
                status: run.errorCount > 0 ? 'error' : 'ok',
                detail: `${prefix}Playbook run ${run.id} (${run.executedSteps} steps).`,
              };
            }
          }
        } else if (step.id === 'open-expiring-contracts') {
          result = {
            id: step.id,
            raw: step.raw,
            canonical: step.canonical,
            status: 'ok',
            detail: `${prefix}Opened expiring contracts lane.`,
            route: '/contracts?filter=expiring',
          };
        } else if (step.id === 'assign-expiring-contracts-lane') {
          if (options.executionMode === 'dry-run') {
            result = {
              id: step.id,
              raw: step.raw,
              canonical: step.canonical,
              status: 'ok',
              detail: `${prefix}Would assign expiring-contract renegotiation lane.`,
            };
          } else {
            const lane = await assignDelegateLane({
              title: 'Renegotiate expiring contracts',
              assignee: input.assignee || 'delegate',
              assignedBy: 'owner',
              actorId,
              priority: 'high',
              payload: {
                source: 'workflow.execute-chain',
              },
            });
            result = {
              id: step.id,
              raw: step.raw,
              canonical: step.canonical,
              status: 'ok',
              detail: `${prefix}Assigned lane ${lane.title}.`,
            };
          }
        } else if (step.id === 'delegate-triage-batch') {
          if (options.executionMode === 'dry-run') {
            result = {
              id: step.id,
              raw: step.raw,
              canonical: step.canonical,
              status: 'ok',
              detail: `${prefix}Would assign delegate triage batch lane.`,
            };
          } else {
            const lane = await assignDelegateLane({
              title: 'Delegate triage batch',
              assignee: input.assignee || 'delegate',
              assignedBy: 'owner',
              actorId,
              priority: 'normal',
              payload: {
                source: 'workflow.delegate-triage-batch',
              },
            });
            result = {
              id: step.id,
              raw: step.raw,
              canonical: step.canonical,
              status: 'ok',
              detail: `${prefix}Assigned lane ${lane.id}.`,
            };
          }
        } else if (step.id === 'escalate-stale-lanes') {
          const now = Date.now();
          const staleLanes = (await repository.listDelegateLanes(500, {
            status: 'assigned',
          })).filter(lane => isLaneStaleForEscalation(lane, now));

          if (options.executionMode === 'dry-run') {
            result = {
              id: step.id,
              raw: step.raw,
              canonical: step.canonical,
              status: 'ok',
              detail: `${prefix}Would escalate ${staleLanes.length} stale lane(s).`,
            };
          } else {
            for (const lane of staleLanes.slice(0, 25)) {
              await commentDelegateLane({
                laneId: lane.id,
                actorId,
                message:
                  'Autopilot escalation: lane stale for >48h. Please acknowledge or complete.',
                payload: {
                  source: 'workflow.escalate-stale-lanes',
                  staleHours: Math.round((now - lane.updatedAtMs) / (60 * 60 * 1000)),
                },
              });
            }
            result = {
              id: step.id,
              raw: step.raw,
              canonical: step.canonical,
              status: 'ok',
              detail: `${prefix}Escalated ${staleLanes.length} stale lane(s).`,
            };
          }
        } else if (step.id === 'open-urgent-review') {
          result = {
            id: step.id,
            raw: step.raw,
            canonical: step.canonical,
            status: 'ok',
            detail: `${prefix}Opened urgent review lane.`,
            route: '/review?priority=urgent',
          };
        } else if (step.id === 'apply-batch-policy') {
          if (options.executionMode === 'dry-run') {
            result = {
              id: step.id,
              raw: step.raw,
              canonical: step.canonical,
              status: 'ok',
              detail: `${prefix}Would apply batch policy to pending reviews.`,
            };
          } else {
            const currentState = await repository.getOpsState();
            const ids = Array.from(
              { length: Math.max(1, Math.min(5, currentState.pendingReviews)) },
              (_, itemIndex) => `review-${itemIndex + 1}`,
            );
            const applied = await applyBatchPolicy(ids, 'accepted', 'batch-policy');
            result = {
              id: step.id,
              raw: step.raw,
              canonical: step.canonical,
              status: 'ok',
              detail: `${prefix}Applied batch policy to ${applied.updatedCount} item(s).`,
            };
          }
        } else {
          await getMoneyPulse();
          result = {
            id: step.id,
            raw: step.raw,
            canonical: step.canonical,
            status: 'ok',
            detail: `${prefix}Refreshed command center data.`,
          };
        }

        steps.push(result);
        effectSummaries.push(
          buildStepEffectSummary({
            effectId: `command-effect-${index + 1}`,
            stepId: step.id,
            detail: result.detail,
            mode: options.executionMode,
            stepStatus: result.status,
          }),
        );
      }
    }

    const finishedAtMs = Date.now();
    const errorCount = steps.filter(step => step.status === 'error').length;
    const status: RunStatus = shouldBlock
      ? 'blocked'
      : errorCount > 0
        ? 'failed'
        : 'completed';
    const rollbackEligible =
      options.executionMode === 'live' &&
      isRollbackSourceStatus(status) &&
      isRollbackEligibleByEffects(effectSummaries);
    const rollbackWindowUntilMs = rollbackEligible
      ? computeRollbackWindowUntil(startedAtMs, options.rollbackWindowMinutes)
      : undefined;
    const statusTimeline = createTerminalStatusTimeline({
      status,
      startedAtMs,
      finishedAtMs,
      note: shouldBlock
        ? 'Blocked by guardrail policy.'
        : status === 'failed'
          ? 'Execution finished with step errors.'
          : 'Execution completed.',
    });

    const run: WorkflowCommandExecution = {
      id: runId,
      chain: input.chain,
      steps,
      executionMode: options.executionMode,
      guardrailProfile: options.guardrailProfile,
      status,
      startedAtMs,
      finishedAtMs,
      rollbackWindowUntilMs,
      rollbackEligible,
      rollbackOfRunId: undefined,
      statusTimeline,
      guardrailResults: guardrailEvaluation.results,
      effectSummaries,
      idempotencyKey: options.idempotencyKey,
      rollbackOnFailure: options.rollbackOnFailure,
      errorCount,
      actorId,
      sourceSurface,
      executedAtMs: startedAtMs,
    };

    if (input.persist !== false) {
      const persisted = await repository.updateWorkflowCommandRun(run);
      if (!persisted) {
        await repository.createWorkflowCommandRun(run);
      }
      await queue.enqueue(
        queueJob(
          run.status === 'blocked' ? 'autopilot-run-blocked' : 'autopilot-run-completed',
          {
            scope: 'command',
            runId: run.id,
            status: run.status,
            errorCount: run.errorCount,
          },
        ),
      );
      await appendOpsActivityEvent(toCommandRunActivity(run));
      await appendOpsActivityEvent({
        id: `autopilot-command-${run.id}-${run.status}`,
        kind: 'workflow-command-run',
        title: `autopilot-run-${run.status}`,
        detail: `${run.chain} (${run.executionMode})`,
        route: '/ops#command-mesh',
        severity: statusSeverity(run.status),
        createdAtMs: finishedAtMs,
        meta: {
          runId: run.id,
          status: run.status,
          guardrailResults: run.guardrailResults,
          rollbackEligible: run.rollbackEligible,
        },
      });

      if (
        run.status === 'failed' &&
        run.executionMode === 'live' &&
        run.rollbackOnFailure &&
        run.rollbackEligible
      ) {
        await rollbackCommandRun({
          runId: run.id,
          reason: 'rollback-on-failure',
          actorId,
          sourceSurface,
        });
      }
    }

    return run;
  }

  async function rollbackCommandRun(input: {
    runId: string;
    reason?: string;
    actorId?: string;
    sourceSurface?: string;
  }): Promise<WorkflowCommandExecution | null> {
    const run = await repository.getWorkflowCommandRunById(input.runId);
    if (!run) {
      return null;
    }
    if (!isRollbackSourceStatus(run.status)) {
      throw new Error('run-status-not-rollbackable');
    }
    if (!run.rollbackEligible) {
      throw new Error('run-not-rollback-eligible');
    }
    if (
      typeof run.rollbackWindowUntilMs !== 'number' ||
      Date.now() > run.rollbackWindowUntilMs
    ) {
      throw new Error('rollback-window-expired');
    }

    const now = Date.now();
    const rollbackRun: WorkflowCommandExecution = {
      id: nanoid(),
      chain: `rollback:${run.id}`,
      steps: run.steps
        .slice()
        .reverse()
        .map(step => ({
          ...step,
          detail: `Rollback: ${step.detail}`,
          status: 'ok',
        })),
      executionMode: 'live',
      guardrailProfile: 'off',
      status: 'completed',
      startedAtMs: now,
      finishedAtMs: now,
      rollbackWindowUntilMs: undefined,
      rollbackEligible: false,
      rollbackOfRunId: run.id,
      statusTimeline: createTerminalStatusTimeline({
        status: 'completed',
        startedAtMs: now,
        finishedAtMs: now,
        note: `Rollback applied for run ${run.id}.`,
      }),
      guardrailResults: [],
      effectSummaries: toRollbackEffectSummaries(run.effectSummaries),
      idempotencyKey: undefined,
      rollbackOnFailure: false,
      errorCount: 0,
      actorId: input.actorId || 'owner',
      sourceSurface: input.sourceSurface || 'unknown',
      executedAtMs: now,
    };

    await repository.createWorkflowCommandRun(rollbackRun);
    await repository.markWorkflowCommandRunRolledBack(run.id, now, rollbackRun.id);
    await queue.enqueue(
      queueJob('autopilot-run-rolled-back', {
        scope: 'command',
        runId: run.id,
        rollbackRunId: rollbackRun.id,
        reason: input.reason || 'manual',
      }),
    );
    await appendOpsActivityEvent(toCommandRunActivity(rollbackRun));
    return rollbackRun;
  }

  async function rollbackPlaybookRun(input: {
    runId: string;
    reason?: string;
    actorId?: string;
    sourceSurface?: string;
  }): Promise<PlaybookRun | null> {
    const run = await repository.getPlaybookRunById(input.runId);
    if (!run) {
      return null;
    }
    if (!isRollbackSourceStatus(run.status)) {
      throw new Error('run-status-not-rollbackable');
    }
    if (!run.rollbackEligible) {
      throw new Error('run-not-rollback-eligible');
    }
    if (
      typeof run.rollbackWindowUntilMs !== 'number' ||
      Date.now() > run.rollbackWindowUntilMs
    ) {
      throw new Error('rollback-window-expired');
    }

    const now = Date.now();
    const rollbackRun: PlaybookRun = {
      id: nanoid(),
      playbookId: run.playbookId,
      chain: `rollback:${run.id}`,
      executionMode: 'live',
      guardrailProfile: 'off',
      status: 'completed',
      startedAtMs: now,
      finishedAtMs: now,
      rollbackWindowUntilMs: undefined,
      rollbackEligible: false,
      rollbackOfRunId: run.id,
      statusTimeline: createTerminalStatusTimeline({
        status: 'completed',
        startedAtMs: now,
        finishedAtMs: now,
        note: `Rollback applied for run ${run.id}.`,
      }),
      guardrailResults: [],
      effectSummaries: toRollbackEffectSummaries(run.effectSummaries),
      idempotencyKey: undefined,
      rollbackOnFailure: false,
      executedSteps: run.executedSteps,
      errorCount: 0,
      actorId: input.actorId || 'owner',
      sourceSurface: input.sourceSurface || 'unknown',
      steps: run.steps.map(step => ({
        ...step,
        status: 'ok',
        detail: `Rollback: ${step.detail || 'step reverted'}`,
      })),
      createdAtMs: now,
    };

    await repository.createPlaybookRun(rollbackRun);
    await repository.markPlaybookRunRolledBack(run.id, now, rollbackRun.id);
    await queue.enqueue(
      queueJob('autopilot-run-rolled-back', {
        scope: 'playbook',
        runId: run.id,
        rollbackRunId: rollbackRun.id,
        reason: input.reason || 'manual',
      }),
    );
    await appendOpsActivityEvent(toPlaybookRunActivity(rollbackRun));
    return rollbackRun;
  }

  async function getAdaptiveFocusPanel(): Promise<FocusPanel> {
    const state = await repository.getOpsState();
    const now = Date.now();
    const activeLanes = await repository.listDelegateLanes(200, {
      assignedBy: 'owner',
    });
    const openLanes = activeLanes.filter(
      lane => lane.status === 'assigned' || lane.status === 'accepted',
    );
    const dueSoonLanes = openLanes.filter(
      lane => typeof lane.dueAtMs === 'number' && lane.dueAtMs <= now + 72 * 60 * 60 * 1000,
    );
    const staleAssignedLanes = openLanes.filter(
      lane => lane.status === 'assigned' && now - lane.updatedAtMs >= 48 * 60 * 60 * 1000,
    );
    const recentOutcomes = await repository.listActionOutcomes({ limit: 120 });
    const latestOutcomeByAction = new Map<string, ActionOutcome>();
    for (const outcome of recentOutcomes) {
      if (!latestOutcomeByAction.has(outcome.actionId)) {
        latestOutcomeByAction.set(outcome.actionId, outcome);
      }
    }

    const actions = [
      {
        id: 'focus-urgent-review',
        title: 'Clear urgent review queue',
        route: '/review?priority=urgent',
        score: state.urgentReviews * 100,
        reason: 'Urgent queue items carry highest immediate financial risk.',
      },
      {
        id: 'focus-expiring-contracts',
        title: 'Inspect expiring contracts',
        route: '/contracts?filter=expiring',
        score: state.expiringContracts * 85,
        reason: 'Contract deadlines create time-sensitive spend outcomes.',
      },
      {
        id: 'focus-close-routine',
        title: 'Run weekly close',
        route: '/ops',
        score: Math.max(20, state.pendingReviews * 8),
        reason: 'Close loop compresses unresolved manual operations.',
      },
      {
        id: 'focus-delegate-lanes-due',
        title: 'Review delegate lanes due in 72h',
        route: '/ops#delegate-lanes',
        score: dueSoonLanes.length * 92,
        reason:
          dueSoonLanes.length > 0
            ? `${dueSoonLanes.length} mission lane(s) are close to deadline.`
            : 'No due-soon mission lanes.',
      },
      {
        id: 'focus-delegate-lanes-stale',
        title: 'Nudge stale assigned delegate lanes',
        route: '/ops#delegate-lanes',
        score: staleAssignedLanes.length * 76,
        reason:
          staleAssignedLanes.length > 0
            ? `${staleAssignedLanes.length} assigned lane(s) have no progress for 48h.`
            : 'No stale assigned mission lanes.',
      },
    ].map(action => {
      const latest = latestOutcomeByAction.get(action.id);
      if (!latest) {
        return action;
      }

      const hoursSince = (now - latest.recordedAtMs) / (60 * 60 * 1000);
      if (
        (latest.outcome === 'accepted' ||
          latest.outcome === 'completed' ||
          latest.outcome === 'done') &&
        hoursSince < 24
      ) {
        return {
          ...action,
          score: action.score * 0.35,
          reason: `${action.reason} Cooldown after recent completion.`,
        };
      }

      if (latest.outcome === 'deferred' && hoursSince < 72) {
        return {
          ...action,
          score: action.score * 1.15,
          reason: `${action.reason} Previously deferred.`,
        };
      }

      if (latest.outcome === 'ignored' && hoursSince < 72) {
        return {
          ...action,
          score: action.score * 1.25,
          reason: `${action.reason} Previously ignored.`,
        };
      }

      return action;
    })
      .filter(action => action.score > 0)
      .sort((a, b) => b.score - a.score);

    return {
      actions,
      generatedAtMs: Date.now(),
    };
  }

  async function recordActionOutcome(input: {
    actionId: string;
    outcome: string;
    notes?: string;
  }) {
    const outcome = await repository.recordActionOutcome({
      id: nanoid(),
      actionId: input.actionId,
      outcome: input.outcome,
      notes: input.notes,
      recordedAtMs: Date.now(),
    });
    await appendOpsActivityEvent(toActionOutcomeActivity(outcome));
    return outcome;
  }

  async function listActionOutcomes(input?: {
    limit?: number;
    actionId?: string;
  }): Promise<ActionOutcome[]> {
    return repository.listActionOutcomes({
      limit: Math.max(1, Math.min(input?.limit ?? 50, 200)),
      actionId: input?.actionId,
    });
  }

  async function listOpsActivity(input?: {
    limit?: number;
    kinds?: OpsActivityEvent['kind'][];
    severities?: OpsActivityEvent['severity'][];
    cursor?: string;
  }): Promise<OpsActivityListResult> {
    const limit = Math.max(1, Math.min(input?.limit ?? 60, 250));
    const cursor = decodeOpsActivityCursor(input?.cursor);
    const fetched = await repository.listOpsActivityEvents(limit + 1, {
      kinds: input?.kinds,
      severities: input?.severities,
      cursor: cursor || undefined,
    });
    const eventsPage = fetched.slice(0, limit);
    const hasMore = fetched.length > limit;
    const last = eventsPage[eventsPage.length - 1];

    return {
      events: eventsPage,
      nextCursor:
        hasMore && last
          ? encodeOpsActivityCursor({
            createdAtMs: last.createdAtMs,
            id: last.id,
          })
          : undefined,
    };
  }

  async function backfillOpsActivity(input?: {
    limitPerPlane?: number;
  }): Promise<{ attempted: number; total: number }> {
    if (opsActivityPipelineState.backfill.running) {
      throw new Error('ops-activity-backfill-running');
    }
    const leaseAcquired = await repository.acquireSystemLease({
      leaseKey: OPS_ACTIVITY_BACKFILL_LEASE_KEY,
      ownerId: pipelineLeaseOwnerId,
      ttlMs: OPS_ACTIVITY_PIPELINE_LEASE_TTL_MS,
    });
    if (!leaseAcquired) {
      throw new Error('ops-activity-backfill-running');
    }
    beginOpsTask(opsActivityPipelineState.backfill);

    const limitPerPlane = Math.max(1, Math.min(input?.limitPerPlane ?? 500, 5_000));
    let attempted = 0;
    try {
      const commandRuns = await repository.listWorkflowCommandRuns(limitPerPlane);
      for (const run of commandRuns) {
        await appendOpsActivityEvent(toCommandRunActivity(run));
        attempted += 1;
      }

      const playbookRuns = await repository.listPlaybookRuns(limitPerPlane);
      for (const run of playbookRuns) {
        await appendOpsActivityEvent(toPlaybookRunActivity(run));
        attempted += 1;
      }

      const closeRuns = await repository.listCloseRuns(limitPerPlane);
      for (const run of closeRuns) {
        await appendOpsActivityEvent(toCloseRunActivity(run));
        attempted += 1;
      }

      const outcomes = await repository.listActionOutcomes({
        limit: limitPerPlane,
      });
      for (const outcome of outcomes) {
        await appendOpsActivityEvent(toActionOutcomeActivity(outcome));
        attempted += 1;
      }

      const lanes = await repository.listDelegateLanes(limitPerPlane);
      for (const lane of lanes) {
        const laneEvents = await repository.listDelegateLaneEvents(
          lane.id,
          limitPerPlane,
        );
        for (const laneEvent of laneEvents) {
          await appendOpsActivityEvent(toDelegateLaneEventActivity(lane, laneEvent));
          attempted += 1;
        }
      }

      const branches = await repository.listScenarioBranches();
      for (const branch of branches) {
        if (branch.status !== 'adopted') {
          continue;
        }
        await appendOpsActivityEvent(toScenarioAdoptionActivity(branch));
        attempted += 1;
      }

      const egressAudit = await repository.listEgressAudit(limitPerPlane);
      for (const entry of egressAudit) {
        await appendOpsActivityEvent(toPolicyActivity(entry));
        attempted += 1;
      }

      const total = await repository.countOpsActivityEvents();
      finishOpsTask(opsActivityPipelineState.backfill, {
        attempted,
        total,
      });
      return {
        attempted,
        total,
      };
    } catch (error) {
      failOpsTask(opsActivityPipelineState.backfill, error);
      throw error;
    } finally {
      try {
        await repository.releaseSystemLease({
          leaseKey: OPS_ACTIVITY_BACKFILL_LEASE_KEY,
          ownerId: pipelineLeaseOwnerId,
        });
      } catch {
        // best-effort lease release for backfill.
      }
    }
  }

  async function runOpsActivityMaintenance(input?: {
    retentionDays?: number;
    maxRows?: number;
  }): Promise<{
    removed: number;
    total: number;
    removedWorkerJobAttempts: number;
    totalWorkerJobAttempts: number;
    removedWorkerDeadLetters: number;
    totalWorkerDeadLetters: number;
    removedWorkerFingerprintClaimEvents: number;
    totalWorkerFingerprintClaimEvents: number;
  }> {
    if (opsActivityPipelineState.maintenance.running) {
      throw new Error('ops-activity-maintenance-running');
    }
    const leaseAcquired = await repository.acquireSystemLease({
      leaseKey: OPS_ACTIVITY_MAINTENANCE_LEASE_KEY,
      ownerId: pipelineLeaseOwnerId,
      ttlMs: OPS_ACTIVITY_PIPELINE_LEASE_TTL_MS,
    });
    if (!leaseAcquired) {
      throw new Error('ops-activity-maintenance-running');
    }
    beginOpsTask(opsActivityPipelineState.maintenance);

    const maxRows =
      typeof input?.maxRows === 'number' && Number.isFinite(input.maxRows)
        ? Math.max(0, Math.trunc(input.maxRows))
        : undefined;
    const retentionDays =
      typeof input?.retentionDays === 'number' && Number.isFinite(input.retentionDays)
        ? Math.max(0, input.retentionDays)
        : undefined;
    const olderThanMs =
      typeof retentionDays === 'number'
        ? Date.now() - Math.floor(retentionDays * 24 * 60 * 60 * 1000)
        : undefined;
    try {
      const [
        removed,
        removedWorkerJobAttempts,
        removedWorkerDeadLetters,
        removedWorkerFingerprintClaimEvents,
      ] =
        await Promise.all([
          repository.trimOpsActivityEvents({
            maxRows,
            olderThanMs,
          }),
          repository.trimWorkerJobAttempts({
            maxRows,
            olderThanMs,
          }),
          repository.trimWorkerDeadLetters({
            maxRows,
            olderThanMs,
          }),
          repository.trimWorkerFingerprintClaimEvents({
            maxRows,
            olderThanMs,
          }),
        ]);
      const [
        total,
        totalWorkerJobAttempts,
        totalWorkerDeadLetters,
        totalWorkerFingerprintClaimEvents,
      ] =
        await Promise.all([
          repository.countOpsActivityEvents(),
          repository.countWorkerJobAttempts(),
          repository.countWorkerDeadLetters(),
          repository.countWorkerFingerprintClaimEvents(),
        ]);
      finishOpsTask(opsActivityPipelineState.maintenance, {
        removed,
        total,
        removedWorkerJobAttempts,
        totalWorkerJobAttempts,
        removedWorkerDeadLetters,
        totalWorkerDeadLetters,
        removedWorkerFingerprintClaimEvents,
        totalWorkerFingerprintClaimEvents,
      });
      return {
        removed,
        total,
        removedWorkerJobAttempts,
        totalWorkerJobAttempts,
        removedWorkerDeadLetters,
        totalWorkerDeadLetters,
        removedWorkerFingerprintClaimEvents,
        totalWorkerFingerprintClaimEvents,
      };
    } catch (error) {
      failOpsTask(opsActivityPipelineState.maintenance, error);
      throw error;
    } finally {
      try {
        await repository.releaseSystemLease({
          leaseKey: OPS_ACTIVITY_MAINTENANCE_LEASE_KEY,
          ownerId: pipelineLeaseOwnerId,
        });
      } catch {
        // best-effort lease release for maintenance.
      }
    }
  }

  async function getOpsActivityPipelineStatus(): Promise<OpsActivityPipelineStatus> {
    return snapshotOpsActivityPipelineStatus();
  }

  async function startOpsActivityPipeline(input?: {
    runBackfill?: boolean;
    runMaintenance?: boolean;
    limitPerPlane?: number;
    retentionDays?: number;
    maxRows?: number;
    waitForCompletion?: boolean;
  }): Promise<OpsActivityPipelineStartResult> {
    if (opsActivityPipelineState.orchestrator.running) {
      return {
        started: false,
        status: snapshotOpsActivityPipelineStatus(),
      };
    }

    const leaseAcquired = await repository.acquireSystemLease({
      leaseKey: OPS_ACTIVITY_PIPELINE_LEASE_KEY,
      ownerId: pipelineLeaseOwnerId,
      ttlMs: OPS_ACTIVITY_PIPELINE_LEASE_TTL_MS,
    });
    if (!leaseAcquired) {
      return {
        started: false,
        status: snapshotOpsActivityPipelineStatus(),
      };
    }

    beginOpsTask(opsActivityPipelineState.orchestrator);
    const runBackfill = input?.runBackfill !== false;
    const runMaintenance = input?.runMaintenance !== false;

    const execute = async () => {
      try {
        if (runBackfill) {
          await backfillOpsActivity({
            limitPerPlane: input?.limitPerPlane,
          });
        }
        if (runMaintenance) {
          await runOpsActivityMaintenance({
            retentionDays: input?.retentionDays,
            maxRows: input?.maxRows,
          });
        }
        const total = await repository.countOpsActivityEvents();
        finishOpsTask(opsActivityPipelineState.orchestrator, {
          total,
        });
      } catch (error) {
        failOpsTask(opsActivityPipelineState.orchestrator, error);
      } finally {
        try {
          await repository.releaseSystemLease({
            leaseKey: OPS_ACTIVITY_PIPELINE_LEASE_KEY,
            ownerId: pipelineLeaseOwnerId,
          });
        } catch {
          // lease release failure should not crash orchestrator lifecycle.
        }
      }
    };

    if (input?.waitForCompletion) {
      await execute();
    } else {
      void execute();
    }

    return {
      started: true,
      status: snapshotOpsActivityPipelineStatus(),
    };
  }

  async function listScenarioBranches(): Promise<ScenarioBranch[]> {
    return repository.listScenarioBranches();
  }

  async function createScenarioBranch(input: {
    name: string;
    baseBranchId?: string;
    notes?: string;
  }): Promise<ScenarioBranch> {
    const now = Date.now();
    const branch: ScenarioBranch = {
      id: nanoid(),
      name: input.name,
      status: 'draft',
      baseBranchId: input.baseBranchId,
      notes: input.notes,
      createdAtMs: now,
      updatedAtMs: now,
    };

    await repository.createScenarioBranch(branch);
    await queue.enqueue(
      queueJob('scenario.branch.created', {
        branchId: branch.id,
      }),
    );

    return branch;
  }

  async function listScenarioMutations(branchId: string): Promise<ScenarioMutation[]> {
    return repository.listScenarioMutations(branchId);
  }

  async function applyScenarioMutation(input: {
    branchId: string;
    mutationKind: string;
    payload: Record<string, unknown>;
  }): Promise<ScenarioMutation | null> {
    const mutation: ScenarioMutation = {
      id: nanoid(),
      branchId: input.branchId,
      kind: input.mutationKind,
      payload: input.payload,
      createdAtMs: Date.now(),
    };

    const created = await repository.addScenarioMutation(mutation);
    if (!created) return null;

    await queue.enqueue(
      queueJob('scenario.mutation.applied', {
        mutationId: created.id,
        branchId: created.branchId,
      }),
    );

    return created;
  }

  async function compareScenarioOutcomes(
    branchId: string,
    againstBranchId?: string,
  ): Promise<ScenarioComparison | null> {
    const primaryBranch = await repository.getScenarioBranchById(branchId);
    if (!primaryBranch) return null;

    const againstBranch = againstBranchId
      ? await repository.getScenarioBranchById(againstBranchId)
      : null;

    const summarize = async (id?: string) => {
      if (!id) {
        return { amountDelta: 0, riskDelta: 0 };
      }

      const mutations = await repository.listScenarioMutations(id);
      return mutations.reduce(
        (acc, mutation) => {
          const amountDelta = mutation.payload.amountDelta;
          const riskDelta = mutation.payload.riskDelta;

          acc.amountDelta += typeof amountDelta === 'number' ? amountDelta : 0;
          acc.riskDelta += typeof riskDelta === 'number' ? riskDelta : 0;
          return acc;
        },
        { amountDelta: 0, riskDelta: 0 },
      );
    };

    const primary = await summarize(primaryBranch.id);
    const against = await summarize(againstBranch?.id);

    return {
      primaryBranchId: primaryBranch.id,
      againstBranchId: againstBranch?.id,
      primary,
      against,
      diff: {
        amountDelta: primary.amountDelta - against.amountDelta,
        riskDelta: primary.riskDelta - against.riskDelta,
      },
    };
  }

  async function getScenarioLineage(
    branchId: string,
  ): Promise<ScenarioLineage | null> {
    const branches = await repository.listScenarioBranches();
    const byId = new Map(branches.map(branch => [branch.id, branch]));
    const target = byId.get(branchId);
    if (!target) return null;

    const visited = new Set<string>();
    const reverse: ScenarioLineageNode[] = [];
    let current: ScenarioBranch | undefined = target;
    let hasCycle = false;

    while (current) {
      if (visited.has(current.id)) {
        hasCycle = true;
        break;
      }
      visited.add(current.id);
      reverse.push({
        branchId: current.id,
        name: current.name,
        status: current.status,
        adoptedAtMs: current.adoptedAtMs,
      });

      if (!current.baseBranchId) {
        break;
      }
      current = byId.get(current.baseBranchId);
      if (!current) {
        break;
      }
    }

    return {
      branchId,
      nodes: reverse.reverse(),
      hasCycle,
    };
  }

  async function getScenarioAdoptionCheck(input: {
    branchId: string;
    againstBranchId?: string;
  }): Promise<ScenarioAdoptionCheck | null> {
    const branch = await repository.getScenarioBranchById(input.branchId);
    if (!branch) return null;

    let againstBranchId = input.againstBranchId;
    if (!againstBranchId) {
      const adoptedBaseline = (await repository.listScenarioBranches())
        .filter(candidate => candidate.status === 'adopted' && candidate.id !== branch.id)
        .sort(
          (a, b) =>
            (b.adoptedAtMs || 0) - (a.adoptedAtMs || 0) ||
            b.updatedAtMs - a.updatedAtMs,
        )[0];
      againstBranchId = adoptedBaseline?.id;
    }

    const comparison = await compareScenarioOutcomes(branch.id, againstBranchId);
    if (!comparison) return null;

    const mutations = await repository.listScenarioMutations(branch.id);
    const lineage = await getScenarioLineage(branch.id);
    if (!lineage) return null;

    const blockers: string[] = [];
    const warnings: string[] = [];

    if (branch.status === 'adopted') {
      blockers.push('Branch is already adopted.');
    }
    if (lineage.hasCycle) {
      blockers.push('Scenario lineage cycle detected.');
    }
    if (mutations.length === 0) {
      warnings.push('Branch has no mutations; adoption has no measurable change.');
    }
    if (lineage.nodes.length >= 6) {
      warnings.push(
        `Lineage depth is ${lineage.nodes.length}, increasing rollback complexity.`,
      );
    }

    const amountDelta = comparison.diff.amountDelta;
    const riskDelta = comparison.diff.riskDelta;
    if (riskDelta >= 6) {
      warnings.push(`Risk delta is elevated (${riskDelta}).`);
    }
    if (riskDelta >= 10) {
      blockers.push(`Risk delta is too high for safe adoption (${riskDelta}).`);
    }
    if (amountDelta <= -500) {
      warnings.push(`Projected cashflow delta is negative (${amountDelta}).`);
    }
    if (amountDelta <= -2000) {
      blockers.push(`Projected cashflow downside exceeds threshold (${amountDelta}).`);
    }

    const riskScoreRaw = Math.round(
      Math.max(
        0,
        Math.min(
          100,
          Math.abs(riskDelta) * 8 +
            (amountDelta < 0 ? Math.min(45, Math.abs(amountDelta) / 80) : 0) +
            mutations.length * 2 +
            Math.max(0, lineage.nodes.length - 1) * 3,
        ),
      ),
    );
    const riskScore = Math.max(
      riskScoreRaw,
      blockers.length * 25 + warnings.length * 10,
    );
    const canAdopt = blockers.length === 0;

    return {
      branchId: branch.id,
      againstBranchId: comparison.againstBranchId,
      canAdopt,
      riskScore,
      blockers,
      warnings,
      summary: canAdopt
        ? `Adoption ready with risk score ${riskScore}.`
        : `Adoption blocked with risk score ${riskScore}.`,
      comparison,
      mutationCount: mutations.length,
      lineageDepth: lineage.nodes.length,
      checkedAtMs: Date.now(),
    };
  }

  async function adoptScenarioBranch(input: {
    branchId: string;
    force?: boolean;
    actorId?: string;
    againstBranchId?: string;
  }): Promise<
    | { ok: true; branch: ScenarioBranch; check: ScenarioAdoptionCheck }
    | { ok: false; error: 'branch-not-found' | 'adoption-blocked'; check?: ScenarioAdoptionCheck }
  > {
    const check = await getScenarioAdoptionCheck({
      branchId: input.branchId,
      againstBranchId: input.againstBranchId,
    });
    if (!check) {
      return {
        ok: false,
        error: 'branch-not-found',
      };
    }
    if (!check.canAdopt && !input.force) {
      return {
        ok: false,
        error: 'adoption-blocked',
        check,
      };
    }

    const adoptedAtMs = Date.now();
    const branch = await repository.adoptScenarioBranch(input.branchId, adoptedAtMs);
    if (!branch) {
      return {
        ok: false,
        error: 'branch-not-found',
      };
    }

    await queue.enqueue(
      queueJob('scenario.branch.adopted', {
        branchId: input.branchId,
        actorId: input.actorId || 'owner',
        force: !!input.force,
        riskScore: check.riskScore,
        blockerCount: check.blockers.length,
        warningCount: check.warnings.length,
      }),
    );

    const adoptionActivity = toScenarioAdoptionActivity(branch, check.riskScore);
    await appendOpsActivityEvent({
      ...adoptionActivity,
      meta: {
        ...(adoptionActivity.meta || {}),
        force: !!input.force,
      },
    });

    return {
      ok: true,
      branch,
      check,
    };
  }

  async function listDelegateLanes(input?: {
    limit?: number;
    status?: DelegateLane['status'];
    assignee?: string;
    assignedBy?: string;
    priority?: DelegateLane['priority'];
  }): Promise<DelegateLane[]> {
    const limit = Math.max(1, Math.min(input?.limit ?? 50, 200));
    return repository.listDelegateLanes(limit, {
      status: input?.status,
      assignee: input?.assignee,
      assignedBy: input?.assignedBy,
      priority: input?.priority,
    });
  }

  async function listDelegateLaneEvents(input: {
    laneId: string;
    limit?: number;
  }): Promise<DelegateLaneEvent[]> {
    const limit = Math.max(1, Math.min(input.limit ?? 50, 200));
    return repository.listDelegateLaneEvents(input.laneId, limit);
  }

  async function assignDelegateLane(input: {
    title: string;
    assignee: string;
    assignedBy: string;
    payload: Record<string, unknown>;
    priority?: DelegateLane['priority'];
    dueAtMs?: number;
    actorId?: string;
  }): Promise<DelegateLane> {
    const now = Date.now();
    const lane: DelegateLane = {
      id: nanoid(),
      title: input.title,
      priority: input.priority || 'normal',
      status: 'assigned',
      assignee: input.assignee,
      assignedBy: input.assignedBy,
      payload: input.payload,
      createdAtMs: now,
      updatedAtMs: now,
      dueAtMs: input.dueAtMs,
    };

    await repository.createDelegateLane(lane);
    const laneEvent = await repository.createDelegateLaneEvent({
      id: nanoid(),
      laneId: lane.id,
      type: 'assigned',
      actorId: input.actorId || input.assignedBy,
      message: 'Lane assigned.',
      payload: {
        title: lane.title,
        assignee: lane.assignee,
        priority: lane.priority,
        dueAtMs: lane.dueAtMs,
      },
      createdAtMs: now,
    });
    await queue.enqueue(
      queueJob('delegate.lane.assigned', {
        laneId: lane.id,
        assignee: lane.assignee,
        priority: lane.priority,
      }),
    );

    await appendOpsActivityEvent(toDelegateLaneEventActivity(lane, laneEvent));

    return lane;
  }

  async function transitionDelegateLane(input: {
    laneId: string;
    status: DelegateLane['status'];
    actorId: string;
    message?: string;
  }): Promise<
    | { ok: true; lane: DelegateLane }
    | { ok: false; error: 'lane-not-found' | 'invalid-lane-transition' }
  > {
    const lane = await repository.getDelegateLaneById(input.laneId);
    if (!lane) return { ok: false, error: 'lane-not-found' };

    if (lane.status !== input.status) {
      const allowed = DELEGATE_ALLOWED_TRANSITIONS[lane.status];
      if (!allowed.includes(input.status)) {
        return { ok: false, error: 'invalid-lane-transition' };
      }
    }

    const now = Date.now();
    const updated: DelegateLane = {
      ...lane,
      status: input.status,
      updatedAtMs: now,
      acceptedAtMs: input.status === 'accepted' ? now : lane.acceptedAtMs,
      completedAtMs: input.status === 'completed' ? now : lane.completedAtMs,
      rejectedAtMs: input.status === 'rejected' ? now : lane.rejectedAtMs,
    };

    await repository.updateDelegateLane(updated);
    const laneEvent = await repository.createDelegateLaneEvent({
      id: nanoid(),
      laneId: input.laneId,
      type:
        input.status === 'assigned' && lane.status !== 'assigned'
          ? 'reopened'
          : input.status,
      actorId: input.actorId,
      message: input.message,
      payload: {
        fromStatus: lane.status,
        toStatus: input.status,
      },
      createdAtMs: now,
    });
    await queue.enqueue(
      queueJob('delegate.lane.transitioned', {
        laneId: input.laneId,
        status: input.status,
        actorId: input.actorId,
      }),
    );

    await appendOpsActivityEvent(toDelegateLaneEventActivity(updated, laneEvent));

    return { ok: true, lane: updated };
  }

  async function commentDelegateLane(input: {
    laneId: string;
    actorId: string;
    message: string;
    payload?: Record<string, unknown>;
  }): Promise<DelegateLaneEvent | null> {
    const lane = await repository.getDelegateLaneById(input.laneId);
    if (!lane) return null;

    const now = Date.now();
    const updatedLane: DelegateLane = {
      ...lane,
      updatedAtMs: now,
    };
    await repository.updateDelegateLane(updatedLane);

    const event = await repository.createDelegateLaneEvent({
      id: nanoid(),
      laneId: input.laneId,
      type: 'comment',
      actorId: input.actorId,
      message: input.message,
      payload: input.payload,
      createdAtMs: now,
    });

    await queue.enqueue(
      queueJob('delegate.lane.commented', {
        laneId: input.laneId,
        actorId: input.actorId,
      }),
    );

    await appendOpsActivityEvent(toDelegateLaneEventActivity(updatedLane, event));

    return event;
  }

  async function getEgressPolicy(): Promise<EgressPolicy> {
    return repository.getEgressPolicy();
  }

  async function setEgressPolicy(policy: EgressPolicy): Promise<EgressPolicy> {
    const updatedPolicy = await repository.setEgressPolicy(policy);

    await recordEgressAudit({
      eventType: 'policy-updated',
      payload: {
        allowCloud: updatedPolicy.allowCloud,
        allowedProviders: updatedPolicy.allowedProviders,
        redactionMode: updatedPolicy.redactionMode,
      },
    });

    return updatedPolicy;
  }

  async function listEgressAudit(limit: number): Promise<EgressAuditEntry[]> {
    return repository.listEgressAudit(limit);
  }

  async function recordEgressAudit(input: {
    eventType: string;
    provider?: string;
    payload?: Record<string, unknown>;
  }): Promise<EgressAuditEntry> {
    const entry = await repository.recordEgressAudit({
      id: nanoid(),
      eventType: input.eventType,
      provider: input.provider,
      payload: input.payload,
      createdAtMs: Date.now(),
    });
    await appendOpsActivityEvent(toPolicyActivity(entry));

    return entry;
  }

  async function recommend(): Promise<Recommendation[]> {
    const state = await repository.getOpsState();

    return rankRecommendations([
      {
        id: 'rec-review-urgent',
        title: 'Prioritize urgent review queue',
        confidence: 0.92,
        provenance: 'focus-engine',
        expectedImpact: 'risk-reduction',
        reversible: true,
        rationale: `${state.urgentReviews} urgent review item(s) can trigger immediate cashflow mistakes.`,
      },
      {
        id: 'rec-contract-expiring',
        title: 'Review expiring contracts this week',
        confidence: 0.88,
        provenance: 'contracts-engine',
        expectedImpact: 'cost-avoidance',
        reversible: true,
        rationale: `${state.expiringContracts} contract(s) are within cancellation window.`,
      },
      {
        id: 'rec-close-loop',
        title: 'Run weekly close loop',
        confidence: 0.81,
        provenance: 'workflow-engine',
        expectedImpact: 'operational-compression',
        reversible: true,
        rationale: `${state.pendingReviews} pending item(s) can be compressed through close routine automation.`,
      },
    ]);
  }

  async function explain(recommendation: Recommendation) {
    return {
      explanation:
        `Recommendation ${recommendation.id} targets ${recommendation.expectedImpact}. ` +
        `Confidence ${recommendation.confidence.toFixed(2)} with rationale: ${recommendation.rationale}`,
      confidence: recommendation.confidence,
      reversible: recommendation.reversible,
    };
  }

  async function classify(payee: string) {
    const normalized = payee.toLowerCase();

    if (
      normalized.includes('rewe') ||
      normalized.includes('edeka') ||
      normalized.includes('aldi')
    ) {
      return { categoryHint: 'lebensmittel.supermarkt', confidence: 0.87 };
    }

    if (normalized.includes('bahn') || normalized.includes('db')) {
      return { categoryHint: 'mobilitaet.oepnv', confidence: 0.84 };
    }

    if (normalized.includes('netflix') || normalized.includes('spotify')) {
      return { categoryHint: 'freizeit.streaming', confidence: 0.91 };
    }

    return { categoryHint: 'sonstiges.unkategorisiert', confidence: 0.57 };
  }

  async function forecast(months: number) {
    const state = await repository.getOpsState();
    const projectedMonthlyCommitment =
      120_000 + state.pendingReviews * 500 + state.expiringContracts * 300;

    return {
      months,
      projectedMonthlyCommitment,
      projectedTotalCommitment: projectedMonthlyCommitment * months,
      generatedAtMs: Date.now(),
    };
  }

  async function getTemporalSignals(input?: {
    bundesland?: string;
    horizonDays?: number;
  }): Promise<TemporalSignals> {
    const bundesland = normalizeBundesland(input?.bundesland);
    const horizonDays = Math.max(7, Math.min(45, Math.trunc(input?.horizonDays ?? 14)));
    const today = startOfDay(new Date());
    const todayMs = today.getTime();

    const holidayCache = new Map<number, Set<string>>();
    const calendar = Array.from({ length: horizonDays }, (_unused, index) => {
      const date = addDays(today, index);
      const key = dateKey(date);
      const year = date.getFullYear();
      if (!holidayCache.has(year)) {
        holidayCache.set(year, buildGermanHolidaySet(year, bundesland));
      }
      const holidays = holidayCache.get(year)!;
      const holiday = holidays.has(key);
      return {
        date: key,
        weekday: TEMPORAL_WEEKDAY_FORMATTER.format(date),
        isBusinessDay: isBusinessDay(date, holidays),
        isHoliday: holiday,
      };
    });

    const nextBusinessDay = calendar.find(day => day.isBusinessDay)?.date;
    const nextHolidayDate = calendar.find(day => day.isHoliday)?.date;

    const lanes = await repository.listDelegateLanes(500);
    const activeLanes = lanes.filter(
      lane => lane.status === 'assigned' || lane.status === 'accepted',
    );

    const laneSignals = activeLanes
      .map(lane => {
        const deadline = parseLaneDeadline(lane);
        const daysUntilDue =
          typeof deadline.dueAtMs === 'number'
            ? Math.floor((deadline.dueAtMs - todayMs) / MS_PER_DAY)
            : undefined;
        const severity = laneSeverity(lane, daysUntilDue);
        const recommendedChain =
          severity === 'critical'
            ? 'triage -> delegate-triage-batch -> apply-batch-policy'
            : severity === 'warn'
              ? 'triage -> open-review -> delegate-triage-batch'
              : 'triage -> refresh';

        return {
          signal: {
            laneId: lane.id,
            title: lane.title,
            assignee: lane.assignee,
            priority: lane.priority,
            status: lane.status,
            dueAtMs: deadline.dueAtMs,
            deadlineDate: deadline.deadlineDate,
            daysUntilDue,
            severity,
            reason: laneReason(daysUntilDue),
            recommendedChain,
          } satisfies TemporalLaneSignal,
          daysUntilDue: daysUntilDue ?? Number.POSITIVE_INFINITY,
          updatedAtMs: lane.updatedAtMs,
        };
      })
      .sort((left, right) => {
        const severityDiff =
          severitySortValue(left.signal.severity) -
          severitySortValue(right.signal.severity);
        if (severityDiff !== 0) {
          return severityDiff;
        }
        if (left.daysUntilDue !== right.daysUntilDue) {
          return left.daysUntilDue - right.daysUntilDue;
        }
        return right.updatedAtMs - left.updatedAtMs;
      })
      .map(entry => entry.signal);

    const summary = {
      critical: laneSignals.filter(signal => signal.severity === 'critical').length,
      warn: laneSignals.filter(signal => signal.severity === 'warn').length,
      info: laneSignals.filter(signal => signal.severity === 'info').length,
      businessDays: calendar.filter(day => day.isBusinessDay).length,
      holidays: calendar.filter(day => day.isHoliday).length,
    };

    const state = await repository.getOpsState();
    const criticalWeight = summary.critical;
    const warnWeight = summary.warn;
    const urgentWeight = state.urgentReviews;
    const closeSafeAmountDelta = criticalWeight * 180 + warnWeight * 95;
    const closeSafeRiskDelta = -Math.max(1, criticalWeight * 2 + warnWeight);
    const delegateBatchAmountDelta = criticalWeight * 260 + warnWeight * 120;
    const delegateBatchRiskDelta = -Math.max(1, criticalWeight * 3 + warnWeight);
    const reviewAmountDelta = urgentWeight * 70;
    const reviewRiskDelta = -Math.max(1, urgentWeight);
    const recommendedChains = [
      {
        id: 'temporal-close-safe',
        label: 'Run safe close window',
        chain: 'triage -> close-safe -> refresh',
        reason: nextBusinessDay
          ? `Next business-day execution window starts ${nextBusinessDay}.`
          : 'No business-day window detected in horizon.',
        amountDelta: closeSafeAmountDelta,
        riskDelta: closeSafeRiskDelta,
      },
      {
        id: 'temporal-delegate-batch',
        label: 'Batch delegate deadline triage',
        chain: 'triage -> escalate-stale-lanes -> delegate-triage-batch -> apply-batch-policy',
        reason:
          summary.critical + summary.warn > 0
            ? `${summary.critical} critical and ${summary.warn} warning lane(s) need coordinated action.`
            : 'No urgent lane pressure right now.',
        amountDelta: delegateBatchAmountDelta,
        riskDelta: delegateBatchRiskDelta,
      },
      {
        id: 'temporal-review-stabilize',
        label: 'Stabilize review pressure',
        chain: 'triage -> open-review -> refresh',
        reason:
          state.urgentReviews > 0
            ? `${state.urgentReviews} urgent review item(s) can compound deadline risk.`
            : 'Urgent review pressure is currently low.',
        amountDelta: reviewAmountDelta,
        riskDelta: reviewRiskDelta,
      },
    ];

    return {
      generatedAtMs: Date.now(),
      bundesland,
      horizonDays,
      nextBusinessDay,
      nextHolidayDate,
      calendar,
      laneSignals,
      recommendedChains,
      summary,
    };
  }

  async function learnCorrection(input: {
    input: Record<string, unknown>;
    correctOutput: Record<string, unknown>;
  }) {
    const correction = await repository.createCorrection({
      id: nanoid(),
      input: input.input,
      correctOutput: input.correctOutput,
      createdAtMs: Date.now(),
    });

    await queue.enqueue(
      queueJob('intelligence.correction.learned', {
        correctionId: correction.id,
      }),
    );

    return correction;
  }

  async function submitLedgerCommand(input: {
    workspaceId: string;
    actorId: string;
    commandType: string;
    aggregateId: string;
    aggregateType: string;
    payload: Record<string, unknown>;
  }): Promise<LedgerEvent> {
    const event: LedgerEvent = {
      eventId: nanoid(),
      workspaceId: input.workspaceId,
      aggregateId: input.aggregateId,
      aggregateType: input.aggregateType,
      type: input.commandType,
      payload: input.payload,
      actorId: input.actorId,
      occurredAtMs: Date.now(),
      version: 0,
    };

    const committedEvent = await repository.appendLedgerEvent(event);
    await queue.enqueue(
      queueJob('ledger.command.submitted', {
        eventId: committedEvent.eventId,
        workspaceId: committedEvent.workspaceId,
        commandType: committedEvent.type,
        version: committedEvent.version,
      }),
    );

    return committedEvent;
  }

  async function streamLedgerEvents(input: {
    workspaceId: string;
    cursor?: string;
    limit: number;
  }) {
    return repository.streamLedgerEvents(input);
  }

  async function getProjectionSnapshot(input: {
    workspaceId: string;
    projectionName: string;
  }) {
    const state = await repository.getOpsState();
    const recentEvents = await repository.streamLedgerEvents({
      workspaceId: input.workspaceId,
      limit: 20,
    });

    return {
      snapshot: {
        projectionName: input.projectionName,
        pendingReviews: state.pendingReviews,
        urgentReviews: state.urgentReviews,
        expiringContracts: state.expiringContracts,
        recentEventCount: recentEvents.events.length,
      },
      generatedAtMs: Date.now(),
    };
  }

  async function claimQueueJobs(input?: {
    maxJobs?: number;
    visibilityTimeoutMs?: number;
  }): Promise<QueueClaimResult> {
    const maxJobs = Math.max(1, Math.min(input?.maxJobs ?? 25, 200));
    const visibilityTimeoutMs = Math.max(
      1_000,
      Math.min(
        input?.visibilityTimeoutMs ?? DEFAULT_QUEUE_VISIBILITY_TIMEOUT_MS,
        10 * 60 * 1000,
      ),
    );

    const jobs = await queue.dequeue(maxJobs, {
      visibilityTimeoutMs,
    });

    const queueSize = await queue.size();
    const queueInFlight = await queue.inFlightSize();

    return {
      jobs,
      queueSize,
      queueInFlight,
    };
  }

  async function claimWorkerJobFingerprint(input: {
    workerId: string;
    fingerprint: string;
    ttlMs?: number;
  }): Promise<WorkerJobFingerprintClaimResult> {
    const fingerprint = input.fingerprint.trim();
    const ownerId = input.workerId;
    const ttlMs = Math.max(
      1_000,
      Math.min(input.ttlMs ?? DEFAULT_QUEUE_VISIBILITY_TIMEOUT_MS, 10 * 60 * 1000),
    );
    const leaseKey = workerFingerprintLeaseKey(fingerprint);
    const now = Date.now();

    async function finalize(
      status: WorkerJobFingerprintClaimResult['status'],
      inputOverrides?: {
        expiresAtMs?: number;
        staleRecovered?: boolean;
      },
    ): Promise<WorkerJobFingerprintClaimResult> {
      await appendWorkerFingerprintClaimEvent({
        workerId: ownerId,
        fingerprint,
        leaseKey,
        status,
        ttlMs,
        expiresAtMs: inputOverrides?.expiresAtMs,
        staleRecovered: inputOverrides?.staleRecovered,
      });
      return {
        status,
        fingerprint,
        leaseKey,
        ownerId,
        ttlMs,
        expiresAtMs: inputOverrides?.expiresAtMs,
      };
    }

    if (fingerprint.length === 0) {
      return finalize('already-processed');
    }

    if (await repository.hasSuccessfulWorkerJobFingerprint(fingerprint)) {
      return finalize('already-processed');
    }

    const existingLease = await repository.getSystemLease({
      leaseKey,
    });
    const staleRecovered =
      !!existingLease &&
      existingLease.expiresAtMs <= now &&
      existingLease.ownerId !== ownerId;

    const acquired = await repository.acquireSystemLease({
      leaseKey,
      ownerId,
      ttlMs,
    });

    if (!acquired) {
      return finalize('already-claimed');
    }

    if (await repository.hasSuccessfulWorkerJobFingerprint(fingerprint)) {
      await repository.releaseSystemLease({
        leaseKey,
        ownerId,
      });
      return finalize('already-processed');
    }

    return finalize('acquired', {
      expiresAtMs: now + ttlMs,
      staleRecovered,
    });
  }

  async function ackQueueJob(input: {
    workerId: string;
    receipt: string;
    success?: boolean;
    requeue?: boolean;
    jobId?: string;
    jobName?: string;
    jobFingerprint?: string;
    attempt?: number;
    processingMs?: number;
    errorMessage?: string;
    payload?: Record<string, unknown>;
  }): Promise<QueueAckResult> {
    let acknowledged = false;
    let action: QueueAckResult['action'] = 'acked';

    if (input.success === false) {
      const requeue = input.requeue !== false;
      acknowledged = await queue.nack(input.receipt, requeue);
      action = requeue ? 'requeued' : 'dropped';
    } else {
      acknowledged = await queue.ack(input.receipt);
      action = 'acked';
    }

    const queueSize = await queue.size();
    const queueInFlight = await queue.inFlightSize();

    const now = Date.now();
    const attemptRecordId = nanoid();
    await repository.createWorkerJobAttempt({
      id: attemptRecordId,
      workerId: input.workerId,
      jobId: input.jobId || 'unknown-job',
      jobName: input.jobName || 'unknown-job',
      jobFingerprint: input.jobFingerprint,
      receipt: input.receipt,
      attempt: Math.max(1, Math.trunc(input.attempt ?? 1)),
      outcome: acknowledged ? action : 'ack-miss',
      processingMs:
        typeof input.processingMs === 'number' &&
        Number.isFinite(input.processingMs) &&
        input.processingMs >= 0
          ? Math.trunc(input.processingMs)
          : undefined,
      errorMessage: input.errorMessage,
      payload: input.payload,
      createdAtMs: now,
    });

    if (acknowledged && action === 'dropped') {
      await repository.createWorkerDeadLetter({
        id: nanoid(),
        attemptId: attemptRecordId,
        workerId: input.workerId,
        jobId: input.jobId || 'unknown-job',
        jobName: input.jobName || 'unknown-job',
        receipt: input.receipt,
        attempt: Math.max(1, Math.trunc(input.attempt ?? 1)),
        status: 'open',
        replayCount: 0,
        errorMessage: input.errorMessage,
        payload: input.payload,
        createdAtMs: now,
      });
    }

    const fingerprint = input.jobFingerprint?.trim();
    if (fingerprint && fingerprint.length > 0) {
      const leaseKey = workerFingerprintLeaseKey(fingerprint);
      try {
        const released = await repository.releaseSystemLease({
          leaseKey,
          ownerId: input.workerId,
        });
        await appendWorkerFingerprintClaimEvent({
          workerId: input.workerId,
          fingerprint,
          leaseKey,
          status: released ? 'released' : 'release-miss',
          ttlMs: 0,
        });
      } catch {
        // best-effort cleanup; lock expires automatically
        await appendWorkerFingerprintClaimEvent({
          workerId: input.workerId,
          fingerprint,
          leaseKey,
          status: 'release-miss',
          ttlMs: 0,
        });
      }
    }

    return {
      acknowledged,
      action,
      queueSize,
      queueInFlight,
    };
  }

  async function requeueExpiredQueueJobs(input?: {
    limit?: number;
  }): Promise<QueueRequeueExpiredResult> {
    const limit = Math.max(1, Math.min(input?.limit ?? 100, 1000));
    const moved = await queue.requeueExpired(limit);
    const queueSize = await queue.size();
    const queueInFlight = await queue.inFlightSize();

    return {
      moved,
      queueSize,
      queueInFlight,
    };
  }

  async function checkWorkerJobFingerprint(input: {
    fingerprint: string;
  }): Promise<{ alreadyProcessed: boolean }> {
    const fingerprint = input.fingerprint.trim();
    if (fingerprint.length === 0) {
      return {
        alreadyProcessed: false,
      };
    }

    const alreadyProcessed =
      await repository.hasSuccessfulWorkerJobFingerprint(fingerprint);
    return {
      alreadyProcessed,
    };
  }

  async function listWorkerDeadLetters(input?: {
    limit?: number;
    status?: WorkerDeadLetter['status'];
    workerId?: string;
    jobName?: string;
  }): Promise<WorkerDeadLetter[]> {
    const clamped = Math.max(1, Math.min(input?.limit ?? 50, 200));
    return repository.listWorkerDeadLetters(clamped, {
      status: input?.status,
      workerId: input?.workerId,
      jobName: input?.jobName,
    });
  }

  async function replayWorkerDeadLetters(input?: {
    deadLetterIds?: string[];
    limit?: number;
    maxAttempt?: number;
    jobName?: string;
    operatorId?: string;
  }): Promise<ReplayWorkerDeadLettersResult> {
    const limit = Math.max(1, Math.min(input?.limit ?? 20, 100));
    const maxAttempt = Math.max(1, Math.min(input?.maxAttempt ?? 6, 20));
    const operatorId = input?.operatorId || 'operator-replay';

    let candidates: WorkerDeadLetter[] = [];
    const notFound: string[] = [];

    if (input?.deadLetterIds && input.deadLetterIds.length > 0) {
      const deduped = [...new Set(input.deadLetterIds)].slice(0, limit);
      for (const deadLetterId of deduped) {
        const found = await repository.getWorkerDeadLetterById(deadLetterId);
        if (!found) {
          notFound.push(deadLetterId);
          continue;
        }
        candidates.push(found);
      }
    } else {
      candidates = await repository.listWorkerDeadLetters(limit, {
        status: 'open',
      });
    }

    if (input?.jobName) {
      candidates = candidates.filter(entry => entry.jobName === input.jobName);
    }

    let replayed = 0;
    let skipped = 0;

    for (const entry of candidates) {
      if (entry.status === 'resolved') {
        skipped += 1;
        continue;
      }
      if (entry.attempt >= maxAttempt) {
        skipped += 1;
        continue;
      }

      await queue.enqueue(
        queueJob(entry.jobName, entry.payload || {}),
      );
      replayed += 1;

      await repository.createWorkerJobAttempt({
        id: nanoid(),
        workerId: operatorId,
        jobId: entry.jobId,
        jobName: entry.jobName,
        receipt: `replay:${entry.id}`,
        attempt: entry.attempt + 1,
        outcome: 'requeued',
        processingMs: 0,
        errorMessage: undefined,
        payload: entry.payload,
        createdAtMs: Date.now(),
      });

      await repository.updateWorkerDeadLetter({
        ...entry,
        status: 'replayed',
        replayCount: entry.replayCount + 1,
        lastReplayedAtMs: Date.now(),
      });
    }

    const queueSize = await queue.size();
    const queueInFlight = await queue.inFlightSize();

    return {
      replayed,
      skipped,
      notFound,
      queueSize,
      queueInFlight,
    };
  }

  async function resolveWorkerDeadLetter(input: {
    deadLetterId: string;
    operatorId?: string;
    resolutionNote?: string;
  }): Promise<WorkerDeadLetter | null> {
    const existing = await repository.getWorkerDeadLetterById(input.deadLetterId);
    if (!existing) {
      return null;
    }
    const resolvedAtMs = Date.now();
    const note = input.resolutionNote
      ? `${input.operatorId || 'operator'}: ${input.resolutionNote}`
      : undefined;
    return repository.updateWorkerDeadLetter({
      ...existing,
      status: 'resolved',
      resolvedAtMs,
      resolutionNote: note,
    });
  }

  async function reopenWorkerDeadLetter(input: {
    deadLetterId: string;
    operatorId?: string;
    note?: string;
  }): Promise<WorkerDeadLetter | null> {
    const existing = await repository.getWorkerDeadLetterById(input.deadLetterId);
    if (!existing) {
      return null;
    }
    const note = input.note
      ? `${input.operatorId || 'operator'}: ${input.note}`
      : undefined;
    return repository.updateWorkerDeadLetter({
      ...existing,
      status: 'open',
      resolvedAtMs: undefined,
      resolutionNote: note,
    });
  }

  async function getWorkerQueueHealth(input?: {
    windowMs?: number;
    sampleLimit?: number;
    workerId?: string;
    jobName?: string;
  }): Promise<WorkerQueueHealth> {
    const windowMs = Math.max(60_000, Math.min(input?.windowMs ?? 60 * 60 * 1000, 7 * 24 * 60 * 60 * 1000));
    const sampleLimit = Math.max(1, Math.min(input?.sampleLimit ?? 5000, 20_000));
    const sinceMs = Date.now() - windowMs;

    const attempts = await repository.listWorkerJobAttempts(sampleLimit, {
      sinceMs,
      workerId: input?.workerId,
      jobName: input?.jobName,
    });

    const counts = {
      acked: 0,
      requeued: 0,
      dropped: 0,
      ackMiss: 0,
    };

    const processingSamples: number[] = [];

    for (const attempt of attempts) {
      if (attempt.outcome === 'acked') counts.acked += 1;
      else if (attempt.outcome === 'requeued') counts.requeued += 1;
      else if (attempt.outcome === 'dropped') counts.dropped += 1;
      else if (attempt.outcome === 'ack-miss') counts.ackMiss += 1;

      if (
        typeof attempt.processingMs === 'number' &&
        Number.isFinite(attempt.processingMs) &&
        attempt.processingMs >= 0
      ) {
        processingSamples.push(Math.trunc(attempt.processingMs));
      }
    }

    const sampleSize = attempts.length;
    const throughputPerMinute =
      windowMs > 0 ? Number(((sampleSize * 60_000) / windowMs).toFixed(2)) : 0;
    const failureCount = counts.dropped + counts.ackMiss;
    const failureRate = sampleSize > 0 ? Number((failureCount / sampleSize).toFixed(4)) : 0;
    const retryRate = sampleSize > 0 ? Number((counts.requeued / sampleSize).toFixed(4)) : 0;
    const deadLetterRate = sampleSize > 0 ? Number((counts.dropped / sampleSize).toFixed(4)) : 0;

    return {
      windowMs,
      sampleSize,
      generatedAtMs: Date.now(),
      counts,
      processingMs: {
        p50: percentile(processingSamples, 0.5),
        p95: percentile(processingSamples, 0.95),
        max: processingSamples.length > 0 ? Math.max(...processingSamples) : 0,
      },
      throughputPerMinute,
      failureRate,
      retryRate,
      deadLetterRate,
    };
  }

  async function acquireWorkerQueueLease(input: {
    workerId: string;
    ttlMs?: number;
    leaseKey?: string;
  }): Promise<WorkerQueueLeaseResult> {
    const ttlMs = Math.max(1_000, Math.min(input.ttlMs ?? 15_000, 300_000));
    const leaseKey = input.leaseKey || DEFAULT_WORKER_QUEUE_LEASE_KEY;
    const acquired = await repository.acquireSystemLease({
      leaseKey,
      ownerId: input.workerId,
      ttlMs,
    });
    const now = Date.now();
    return {
      acquired,
      leaseKey,
      ownerId: input.workerId,
      ttlMs,
      expiresAtMs: now + ttlMs,
    };
  }

  async function releaseWorkerQueueLease(input: {
    workerId: string;
    leaseKey?: string;
  }): Promise<{ released: boolean; leaseKey: string; ownerId: string }> {
    const leaseKey = input.leaseKey || DEFAULT_WORKER_QUEUE_LEASE_KEY;
    const released = await repository.releaseSystemLease({
      leaseKey,
      ownerId: input.workerId,
    });
    return {
      released,
      leaseKey,
      ownerId: input.workerId,
    };
  }

  async function getRuntimeMetrics() {
    const queueSize = await queue.size();
    const queueInFlight = await queue.inFlightSize();
    const playbooks = await repository.listPlaybooks();
    const lanes = await repository.listDelegateLanes(1000);
    const corrections = await repository.listCorrections(1000);
    const branches = await repository.listScenarioBranches();
    const opsActivityEvents = await repository.countOpsActivityEvents();
    const workerJobAttempts = await repository.countWorkerJobAttempts();
    const workerDeadLetters = await repository.countWorkerDeadLetters();
    const [
      workerFingerprintClaimEvents,
      workerFingerprintClaimAcquired,
      workerFingerprintClaimAlreadyProcessed,
      workerFingerprintClaimAlreadyClaimed,
      workerFingerprintStaleRecoveries,
    ] = await Promise.all([
      repository.countWorkerFingerprintClaimEvents({
        statuses: ['acquired', 'already-processed', 'already-claimed'],
      }),
      repository.countWorkerFingerprintClaimEvents({
        statuses: ['acquired'],
      }),
      repository.countWorkerFingerprintClaimEvents({
        statuses: ['already-processed'],
      }),
      repository.countWorkerFingerprintClaimEvents({
        statuses: ['already-claimed'],
      }),
      repository.countWorkerFingerprintClaimEvents({
        statuses: ['acquired'],
        staleRecovered: true,
      }),
    ]);
    const workerFingerprintDuplicateSkipRate = safeRate(
      workerFingerprintClaimAlreadyProcessed,
      workerFingerprintClaimEvents,
    );
    const workerFingerprintContentionRate = safeRate(
      workerFingerprintClaimAlreadyClaimed,
      workerFingerprintClaimEvents,
    );
    const workerFingerprintStaleRecoveryRate = safeRate(
      workerFingerprintStaleRecoveries,
      workerFingerprintClaimAcquired,
    );

    return {
      repositoryKind: repository.kind,
      queueKind: queue.kind,
      queueSize,
      queueInFlight,
      playbooks: playbooks.length,
      delegateLanes: lanes.length,
      corrections: corrections.length,
      scenarioBranches: branches.length,
      opsActivityEvents,
      workerJobAttempts,
      workerDeadLetters,
      workerFingerprintClaimEvents,
      workerFingerprintClaimAcquired,
      workerFingerprintClaimAlreadyProcessed,
      workerFingerprintClaimAlreadyClaimed,
      workerFingerprintStaleRecoveries,
      workerFingerprintDuplicateSkipRate,
      workerFingerprintContentionRate,
      workerFingerprintStaleRecoveryRate,
    };
  }

  return {
    repository,
    queue,
    resolveNextAction,
    getMoneyPulse,
    getNarrativePulse,
    listPlaybooks,
    listPlaybookRuns,
    listWorkflowCommandRuns,
    createPlaybook,
    runPlaybook,
    replayPlaybookRun,
    rollbackPlaybookRun,
    runCloseRoutine,
    listCloseRuns,
    applyBatchPolicy,
    executeWorkflowCommandChain,
    rollbackCommandRun,
    listOpsActivity,
    backfillOpsActivity,
    runOpsActivityMaintenance,
    getOpsActivityPipelineStatus,
    startOpsActivityPipeline,
    getAdaptiveFocusPanel,
    recordActionOutcome,
    listActionOutcomes,
    listScenarioBranches,
    createScenarioBranch,
    listScenarioMutations,
    applyScenarioMutation,
    compareScenarioOutcomes,
    getScenarioAdoptionCheck,
    getScenarioLineage,
    adoptScenarioBranch,
    listDelegateLanes,
    listDelegateLaneEvents,
    assignDelegateLane,
    transitionDelegateLane,
    commentDelegateLane,
    getEgressPolicy,
    setEgressPolicy,
    listEgressAudit,
    recordEgressAudit,
    recommend,
    explain,
    classify,
    forecast,
    getTemporalSignals,
    learnCorrection,
    submitLedgerCommand,
    streamLedgerEvents,
    getProjectionSnapshot,
    claimQueueJobs,
    claimWorkerJobFingerprint,
    ackQueueJob,
    requeueExpiredQueueJobs,
    checkWorkerJobFingerprint,
    listWorkerDeadLetters,
    replayWorkerDeadLetters,
    resolveWorkerDeadLetter,
    reopenWorkerDeadLetter,
    getWorkerQueueHealth,
    acquireWorkerQueueLease,
    releaseWorkerQueueLease,
    getRuntimeMetrics,
  };
}

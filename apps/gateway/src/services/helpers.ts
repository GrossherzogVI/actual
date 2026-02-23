import {
  buildGermanHolidaySet,
  isBusinessDay,
} from '@finance-os/domain-kernel';
import { customAlphabet } from 'nanoid';

import type { GatewayQueue, QueueJob } from '../queue/types';
import type {
  ActionOutcome,
  CloseRun,
  DelegateLane,
  DelegateLaneEvent,
  EgressAuditEntry,
  ExecutionMode,
  GuardrailProfile,
  OpsActivityCursor,
  OpsActivityEvent,
  OpsActivityTaskStatus,
  PlaybookRun,
  RunStatus,
  RunStatusTransition,
  ScenarioBranch,
  ScenarioMutation,
  TemporalSignalSeverity,
  WorkflowCommandExecution,
} from '../types';

const nanoid = customAlphabet('1234567890abcdefghijklmnopqrstuvwxyz', 16);

export { nanoid };

export type ExecutionOptionsInput = {
  executionMode?: ExecutionMode;
  guardrailProfile?: GuardrailProfile;
  rollbackWindowMinutes?: number;
  idempotencyKey?: string;
  rollbackOnFailure?: boolean;
};

export type NormalizedExecutionOptions = {
  executionMode: ExecutionMode;
  guardrailProfile: GuardrailProfile;
  rollbackWindowMinutes: number;
  idempotencyKey?: string;
  rollbackOnFailure: boolean;
};

export const TERMINAL_RUN_STATUSES: ReadonlySet<RunStatus> = new Set([
  'completed',
  'failed',
  'blocked',
  'rolled_back',
]);

export const DELEGATE_ALLOWED_TRANSITIONS: Record<
  DelegateLane['status'],
  DelegateLane['status'][]
> = {
  assigned: ['accepted', 'rejected'],
  accepted: ['completed', 'rejected'],
  completed: ['assigned'],
  rejected: ['assigned'],
};

export const OPS_ACTIVITY_PIPELINE_LEASE_KEY = 'ops-activity-pipeline';
export const OPS_ACTIVITY_BACKFILL_LEASE_KEY = 'ops-activity-backfill';
export const OPS_ACTIVITY_MAINTENANCE_LEASE_KEY = 'ops-activity-maintenance';
export const OPS_ACTIVITY_PIPELINE_LEASE_TTL_MS = 30 * 60 * 1000;
export const DEFAULT_QUEUE_VISIBILITY_TIMEOUT_MS = 60_000;
export const DEFAULT_WORKER_QUEUE_LEASE_KEY = 'worker-queue-drain';
export const WORKER_FINGERPRINT_LEASE_KEY_PREFIX = 'worker-fingerprint';
export const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const TEMPORAL_WEEKDAY_FORMATTER = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
});
export const BUNDESLAND_CODES = [
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
export type KernelBundesland = NonNullable<
  Parameters<typeof buildGermanHolidaySet>[1]
>;

export function queueJob(
  name: string,
  payload: Record<string, unknown>,
): QueueJob {
  return {
    id: nanoid(),
    name,
    payload,
    createdAtMs: Date.now(),
  };
}

export function workerFingerprintLeaseKey(fingerprint: string): string {
  return `${WORKER_FINGERPRINT_LEASE_KEY_PREFIX}:${fingerprint}`;
}

export function normalizeBundesland(input?: string): KernelBundesland {
  const upper = typeof input === 'string' ? input.trim().toUpperCase() : '';
  if ((BUNDESLAND_CODES as readonly string[]).includes(upper)) {
    return upper as KernelBundesland;
  }
  return 'BE';
}

export function dateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function parseLaneDeadline(lane: DelegateLane): {
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
  if (
    typeof rawDeadline === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(rawDeadline)
  ) {
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

export function laneSeverity(
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

export function laneReason(daysUntilDue?: number): string {
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

export function severitySortValue(severity: TemporalSignalSeverity): number {
  if (severity === 'critical') return 0;
  if (severity === 'warn') return 1;
  return 2;
}

export function isLaneStaleForEscalation(
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

export function createEmptyOpsTaskStatus(): OpsActivityTaskStatus {
  return {
    running: false,
    runCount: 0,
  };
}

export function cloneOpsTaskStatus(
  status: OpsActivityTaskStatus,
): OpsActivityTaskStatus {
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

export function outcomeSeverity(outcome: string): OpsActivityEvent['severity'] {
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

export function percentile(values: number[], p: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = values.slice().sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil(sorted.length * p) - 1);
  return sorted[index] || 0;
}

export function safeRate(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }
  return Number((numerator / denominator).toFixed(4));
}

export function clampSimulationConfidence(input?: number): number {
  if (!Number.isFinite(input)) {
    return 0.85;
  }
  return Math.max(0.5, Math.min(1.5, input as number));
}

export function deriveSimulationDelta(input: {
  expectedImpact?: string;
  confidence?: number;
  amountDelta?: number;
  riskDelta?: number;
}): { amountDelta: number; riskDelta: number } {
  const explicitAmount = input.amountDelta;
  const explicitRisk = input.riskDelta;

  const hasExplicitAmount =
    typeof explicitAmount === 'number' && Number.isFinite(explicitAmount);
  const hasExplicitRisk =
    typeof explicitRisk === 'number' && Number.isFinite(explicitRisk);

  if (hasExplicitAmount && hasExplicitRisk) {
    return {
      amountDelta: Math.round(explicitAmount as number),
      riskDelta: Math.round(explicitRisk as number),
    };
  }

  const impact = (input.expectedImpact || '').toLowerCase();
  let amountBaseline = 120;
  let riskBaseline = -1;

  if (impact.includes('cost')) {
    amountBaseline = 420;
    riskBaseline = -3;
  } else if (impact.includes('risk')) {
    amountBaseline = 240;
    riskBaseline = -8;
  } else if (impact.includes('compression') || impact.includes('throughput')) {
    amountBaseline = 180;
    riskBaseline = -2;
  } else if (impact.includes('deadline')) {
    amountBaseline = 210;
    riskBaseline = -4;
  }

  const confidence = clampSimulationConfidence(input.confidence);
  const derivedAmount = Math.round(amountBaseline * confidence);
  const derivedRisk = Math.round(riskBaseline * confidence);

  return {
    amountDelta: hasExplicitAmount
      ? Math.round(explicitAmount as number)
      : derivedAmount,
    riskDelta: hasExplicitRisk
      ? Math.round(explicitRisk as number)
      : derivedRisk,
  };
}

export function mutationChain(mutation: ScenarioMutation): string | null {
  const chain = mutation.payload.chain;
  if (typeof chain !== 'string') {
    return null;
  }
  const trimmed = chain.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed;
}

export function encodeOpsActivityCursor(cursor: OpsActivityCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf-8').toString('base64url');
}

export function decodeOpsActivityCursor(
  value?: string,
): OpsActivityCursor | null {
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

export function normalizeExecutionOptions(
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

export function statusSeverity(
  status: RunStatus,
): OpsActivityEvent['severity'] {
  if (status === 'failed' || status === 'blocked') {
    return 'critical';
  }
  if (status === 'rolled_back') {
    return 'warn';
  }
  return 'info';
}

export function createTerminalStatusTimeline(input: {
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

export function isTerminalStatus(status: RunStatus): boolean {
  return TERMINAL_RUN_STATUSES.has(status);
}

export function toCommandRunActivity(
  run: WorkflowCommandExecution,
): OpsActivityEvent {
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

export function toPlaybookRunActivity(run: PlaybookRun): OpsActivityEvent {
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

export function toCloseRunActivity(run: CloseRun): OpsActivityEvent {
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

export function toActionOutcomeActivity(
  outcome: ActionOutcome,
): OpsActivityEvent {
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

export function toScenarioAdoptionActivity(
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
    severity:
      typeof riskScore === 'number' && riskScore >= 80 ? 'warn' : 'info',
    createdAtMs,
    meta: {
      branchId: branch.id,
      baseBranchId: branch.baseBranchId,
      adoptedAtMs: branch.adoptedAtMs,
      riskScore,
    },
  };
}

export function toPolicyActivity(entry: EgressAuditEntry): OpsActivityEvent {
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

export function toDelegateLaneEventActivity(
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

export function toPlaybookToken(
  command: Record<string, unknown>,
): string | null {
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

export function beginOpsTask(task: OpsActivityTaskStatus) {
  task.running = true;
  task.runCount += 1;
  task.lastStartedAtMs = Date.now();
  task.lastError = undefined;
  task.lastResult = undefined;
}

export function finishOpsTask(
  task: OpsActivityTaskStatus,
  result: Record<string, number>,
) {
  const finishedAtMs = Date.now();
  task.running = false;
  task.lastFinishedAtMs = finishedAtMs;
  task.lastDurationMs = task.lastStartedAtMs
    ? finishedAtMs - task.lastStartedAtMs
    : undefined;
  task.lastResult = result;
}

export function failOpsTask(task: OpsActivityTaskStatus, error: unknown) {
  const failedAtMs = Date.now();
  task.running = false;
  task.lastFinishedAtMs = failedAtMs;
  task.lastDurationMs = task.lastStartedAtMs
    ? failedAtMs - task.lastStartedAtMs
    : undefined;
  task.lastError = error instanceof Error ? error.message : String(error);
}

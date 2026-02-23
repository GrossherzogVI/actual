import { Pool } from 'pg';

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
  RunStatus,
  RunStatusTransition,
  ScenarioBranch,
  ScenarioMutation,
  WorkerDeadLetter,
  WorkerFingerprintClaimEvent,
  WorkerJobAttempt,
  WorkflowCommandExecution,
  WorkflowPlaybook,
} from '../types';

import {
  decodeLedgerCursor,
  encodeLedgerCursor,
} from './ledger-cursor';
import { POSTGRES_MIGRATIONS } from './postgres-migrations';
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

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function asDelegateLane(
  row: Record<string, unknown>,
): DelegateLane {
  return {
    id: String(row.id),
    title: String(row.title),
    priority: String(row.priority) as DelegateLane['priority'],
    status: String(row.status) as DelegateLane['status'],
    assignee: String(row.assignee),
    assignedBy: String(row.assigned_by),
    payload: asRecord(row.payload_json),
    createdAtMs: Number(row.created_at_ms),
    updatedAtMs: Number(row.updated_at_ms),
    dueAtMs: row.due_at_ms ? Number(row.due_at_ms) : undefined,
    acceptedAtMs: row.accepted_at_ms ? Number(row.accepted_at_ms) : undefined,
    completedAtMs: row.completed_at_ms ? Number(row.completed_at_ms) : undefined,
    rejectedAtMs: row.rejected_at_ms ? Number(row.rejected_at_ms) : undefined,
  };
}

function asDelegateLaneEvent(
  row: Record<string, unknown>,
): DelegateLaneEvent {
  return {
    id: String(row.id),
    laneId: String(row.lane_id),
    type: String(row.event_type) as DelegateLaneEvent['type'],
    actorId: String(row.actor_id),
    message: row.message ? String(row.message) : undefined,
    payload: row.payload_json ? asRecord(row.payload_json) : undefined,
    createdAtMs: Number(row.created_at_ms),
  };
}

function asExecutionMode(
  value: unknown,
  fallbackDryRun: unknown,
): 'dry-run' | 'live' {
  if (value === 'dry-run' || value === 'live') {
    return value;
  }
  return fallbackDryRun === true ? 'dry-run' : 'live';
}

function asGuardrailProfile(value: unknown): 'strict' | 'balanced' | 'off' {
  if (value === 'strict' || value === 'balanced' || value === 'off') {
    return value;
  }
  return 'strict';
}

function asRunStatus(value: unknown): RunStatus {
  if (
    value === 'planned' ||
    value === 'running' ||
    value === 'completed' ||
    value === 'failed' ||
    value === 'blocked' ||
    value === 'rolled_back'
  ) {
    return value;
  }
  return 'completed';
}

function asRunStatusTimeline(
  value: unknown,
  fallbackStatus: RunStatus,
  startedAtMs: number,
  finishedAtMs: number,
): RunStatusTransition[] {
  if (Array.isArray(value)) {
    const parsed = value
      .map(item => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) {
          return null;
        }
        const record = item as Record<string, unknown>;
        const status = asRunStatus(record.status);
        const atMsRaw = record.atMs;
        if (typeof atMsRaw !== 'number' || !Number.isFinite(atMsRaw)) {
          return null;
        }
        const note =
          typeof record.note === 'string' && record.note.trim().length > 0
            ? record.note
            : undefined;
        return {
          status,
          atMs: Math.trunc(atMsRaw),
          note,
        } as RunStatusTransition;
      })
      .filter((entry): entry is RunStatusTransition => entry !== null)
      .sort((a, b) => a.atMs - b.atMs);

    if (parsed.length > 0) {
      return parsed;
    }
  }

  const runningAtMs = Math.min(finishedAtMs, startedAtMs + 1);
  return [
    {
      status: 'planned',
      atMs: startedAtMs,
      note: 'Execution accepted.',
    },
    {
      status: 'running',
      atMs: runningAtMs,
      note: 'Execution started.',
    },
    {
      status: fallbackStatus,
      atMs: Math.max(finishedAtMs, runningAtMs),
    },
  ];
}

function asPlaybookRun(
  row: Record<string, unknown>,
): PlaybookRun {
  const status = asRunStatus(row.status);
  const startedAtMs = Number(row.started_at_ms || row.created_at_ms || 0);
  const finishedAtMs =
    row.finished_at_ms === null || row.finished_at_ms === undefined
      ? undefined
      : Number(row.finished_at_ms);
  const finishedForTimeline = finishedAtMs ?? startedAtMs;
  return {
    id: String(row.id),
    playbookId: String(row.playbook_id),
    chain: String(row.chain || ''),
    executionMode: asExecutionMode(row.execution_mode, row.dry_run),
    guardrailProfile: asGuardrailProfile(row.guardrail_profile),
    status,
    startedAtMs,
    finishedAtMs,
    rollbackWindowUntilMs:
      row.rollback_window_until_ms === null ||
      row.rollback_window_until_ms === undefined
        ? undefined
        : Number(row.rollback_window_until_ms),
    rollbackEligible: row.rollback_eligible === true,
    rollbackOfRunId:
      row.rollback_of_run_id === null || row.rollback_of_run_id === undefined
        ? undefined
        : String(row.rollback_of_run_id),
    statusTimeline: asRunStatusTimeline(
      row.status_timeline_json,
      status,
      startedAtMs,
      finishedForTimeline,
    ),
    guardrailResults: Array.isArray(row.guardrail_results_json)
      ? (row.guardrail_results_json as PlaybookRun['guardrailResults'])
      : [],
    effectSummaries: Array.isArray(row.effect_summaries_json)
      ? (row.effect_summaries_json as PlaybookRun['effectSummaries'])
      : [],
    idempotencyKey:
      row.idempotency_key === null || row.idempotency_key === undefined
        ? undefined
        : String(row.idempotency_key),
    rollbackOnFailure: row.rollback_on_failure !== false,
    executedSteps: Number(row.executed_steps),
    errorCount: Number(row.error_count || 0),
    actorId: String(row.actor_id || 'owner'),
    sourceSurface: String(row.source_surface || 'unknown'),
    steps: Array.isArray(row.steps_json)
      ? (row.steps_json as PlaybookRun['steps'])
      : [],
    createdAtMs: Number(row.created_at_ms),
  };
}

function asWorkflowCommandRun(
  row: Record<string, unknown>,
): WorkflowCommandExecution {
  const status = asRunStatus(row.status);
  const startedAtMs = Number(row.started_at_ms || row.executed_at_ms || 0);
  const finishedAtMs =
    row.finished_at_ms === null || row.finished_at_ms === undefined
      ? undefined
      : Number(row.finished_at_ms);
  const finishedForTimeline = finishedAtMs ?? startedAtMs;
  return {
    id: String(row.id),
    chain: String(row.chain),
    steps: Array.isArray(row.steps_json)
      ? (row.steps_json as WorkflowCommandExecution['steps'])
      : [],
    executionMode: asExecutionMode(row.execution_mode, row.dry_run),
    guardrailProfile: asGuardrailProfile(row.guardrail_profile),
    status,
    startedAtMs,
    finishedAtMs,
    rollbackWindowUntilMs:
      row.rollback_window_until_ms === null ||
      row.rollback_window_until_ms === undefined
        ? undefined
        : Number(row.rollback_window_until_ms),
    rollbackEligible: row.rollback_eligible === true,
    rollbackOfRunId:
      row.rollback_of_run_id === null || row.rollback_of_run_id === undefined
        ? undefined
        : String(row.rollback_of_run_id),
    statusTimeline: asRunStatusTimeline(
      row.status_timeline_json,
      status,
      startedAtMs,
      finishedForTimeline,
    ),
    guardrailResults: Array.isArray(row.guardrail_results_json)
      ? (row.guardrail_results_json as WorkflowCommandExecution['guardrailResults'])
      : [],
    effectSummaries: Array.isArray(row.effect_summaries_json)
      ? (row.effect_summaries_json as WorkflowCommandExecution['effectSummaries'])
      : [],
    idempotencyKey:
      row.idempotency_key === null || row.idempotency_key === undefined
        ? undefined
        : String(row.idempotency_key),
    rollbackOnFailure: row.rollback_on_failure !== false,
    errorCount: Number(row.error_count),
    actorId: String(row.actor_id || 'owner'),
    sourceSurface: String(row.source_surface || 'unknown'),
    executedAtMs: Number(row.executed_at_ms || row.started_at_ms || 0),
  };
}

function asCloseRun(
  row: Record<string, unknown>,
): CloseRun {
  return {
    id: String(row.id),
    period: String(row.period) as CloseRun['period'],
    exceptionCount: Number(row.exception_count),
    summary: asRecord(row.summary_json) as CloseRun['summary'],
    createdAtMs: Number(row.created_at_ms),
  };
}

function asActionOutcome(
  row: Record<string, unknown>,
): ActionOutcome {
  return {
    id: String(row.id),
    actionId: String(row.action_id),
    outcome: String(row.outcome),
    notes: row.notes ? String(row.notes) : undefined,
    recordedAtMs: Number(row.recorded_at_ms),
  };
}

function asOpsActivityEvent(
  row: Record<string, unknown>,
): OpsActivityEvent {
  return {
    id: String(row.id),
    kind: String(row.kind) as OpsActivityEvent['kind'],
    title: String(row.title),
    detail: String(row.detail),
    route: row.route ? String(row.route) : undefined,
    severity: String(row.severity) as OpsActivityEvent['severity'],
    createdAtMs: Number(row.created_at_ms),
    meta: row.meta_json ? asRecord(row.meta_json) : undefined,
  };
}

function asWorkerJobAttempt(
  row: Record<string, unknown>,
): WorkerJobAttempt {
  return {
    id: String(row.id),
    workerId: String(row.worker_id),
    jobId: String(row.job_id),
    jobName: String(row.job_name),
    jobFingerprint: row.job_fingerprint ? String(row.job_fingerprint) : undefined,
    receipt: String(row.receipt),
    attempt: Number(row.attempt),
    outcome: String(row.outcome) as WorkerJobAttempt['outcome'],
    processingMs:
      row.processing_ms === null || row.processing_ms === undefined
        ? undefined
        : Number(row.processing_ms),
    errorMessage: row.error_message ? String(row.error_message) : undefined,
    payload: row.payload_json ? asRecord(row.payload_json) : undefined,
    createdAtMs: Number(row.created_at_ms),
  };
}

function asWorkerDeadLetter(
  row: Record<string, unknown>,
): WorkerDeadLetter {
  return {
    id: String(row.id),
    attemptId: String(row.attempt_id),
    workerId: String(row.worker_id),
    jobId: String(row.job_id),
    jobName: String(row.job_name),
    receipt: String(row.receipt),
    attempt: Number(row.attempt),
    status: String(row.status || 'open') as WorkerDeadLetter['status'],
    replayCount: Number(row.replay_count || 0),
    lastReplayedAtMs: row.last_replayed_at_ms
      ? Number(row.last_replayed_at_ms)
      : undefined,
    resolvedAtMs: row.resolved_at_ms ? Number(row.resolved_at_ms) : undefined,
    resolutionNote: row.resolution_note ? String(row.resolution_note) : undefined,
    errorMessage: row.error_message ? String(row.error_message) : undefined,
    payload: row.payload_json ? asRecord(row.payload_json) : undefined,
    createdAtMs: Number(row.created_at_ms),
  };
}

function asWorkerFingerprintClaimEvent(
  row: Record<string, unknown>,
): WorkerFingerprintClaimEvent {
  return {
    id: String(row.id),
    workerId: String(row.worker_id),
    fingerprint: String(row.fingerprint),
    leaseKey: String(row.lease_key),
    status: String(row.status) as WorkerFingerprintClaimEvent['status'],
    ttlMs: Number(row.ttl_ms),
    expiresAtMs: row.expires_at_ms ? Number(row.expires_at_ms) : undefined,
    staleRecovered: row.stale_recovered === true,
    createdAtMs: Number(row.created_at_ms),
  };
}

export class PostgresGatewayRepository implements GatewayRepository {
  readonly kind = 'postgres' as const;

  constructor(private readonly pool: Pool) {}

  async init(): Promise<void> {
    for (const migration of POSTGRES_MIGRATIONS) {
      await this.pool.query(migration);
    }

    const now = Date.now();
    await this.pool.query(
      `INSERT INTO ops_state (id, pending_reviews, urgent_reviews, expiring_contracts, updated_at_ms)
       VALUES ('default', 7, 2, 4, $1)
       ON CONFLICT (id) DO NOTHING`,
      [now],
    );

    await this.pool.query(
      `INSERT INTO policy_egress (id, allow_cloud, allowed_providers_json, redaction_mode, updated_at_ms)
       VALUES ('default', false, '[]'::jsonb, 'strict', $1)
       ON CONFLICT (id) DO NOTHING`,
      [now],
    );

    await this.pool.query(
      `INSERT INTO workflow_playbooks
         (id, name, description, commands_json, created_at_ms, updated_at_ms)
       VALUES (
         'default-weekly-compression',
         'Weekly Compression',
         'Resolve urgent queue, scan expiring contracts, run weekly close.',
         '[{\"verb\":\"resolve-next-action\",\"lane\":\"triage\"},{\"verb\":\"open-expiring-contracts\",\"windowDays\":30},{\"verb\":\"run-close\",\"period\":\"weekly\"}]'::jsonb,
         $1,
         $1
       )
       ON CONFLICT (id) DO NOTHING`,
      [now],
    );

    await this.pool.query(
      `INSERT INTO delegate_lanes
         (id, title, priority, status, assignee, assigned_by, payload_json, created_at_ms, updated_at_ms, due_at_ms)
       VALUES (
         'default-lane-mobile',
         'Re-negotiate mobile contract',
         'high',
         'assigned',
         'assistant',
         'owner',
         '{\"contractId\":\"mobile-1\",\"deadline\":\"2026-03-05\"}'::jsonb,
         $1,
         $1,
         $2
       )
       ON CONFLICT (id) DO NOTHING`,
      [now, now + 10 * 24 * 60 * 60 * 1000],
    );

    await this.pool.query(
      `INSERT INTO delegate_lane_events
         (id, lane_id, event_type, actor_id, message, payload_json, created_at_ms)
       VALUES (
         'default-lane-mobile-assigned',
         'default-lane-mobile',
         'assigned',
         'owner',
         'Lane created by system bootstrap.',
         '{"title":"Re-negotiate mobile contract","assignee":"assistant"}'::jsonb,
         $1
       )
       ON CONFLICT (id) DO NOTHING`,
      [now],
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async getOpsState(): Promise<OpsState> {
    const result = await this.pool.query(
      `SELECT pending_reviews, urgent_reviews, expiring_contracts, updated_at_ms
       FROM ops_state WHERE id = 'default'`,
    );
    const row = result.rows[0];
    return {
      pendingReviews: Number(row.pending_reviews),
      urgentReviews: Number(row.urgent_reviews),
      expiringContracts: Number(row.expiring_contracts),
      updatedAtMs: Number(row.updated_at_ms),
    };
  }

  async setOpsState(state: Partial<OpsState>): Promise<OpsState> {
    const current = await this.getOpsState();
    const next: OpsState = {
      pendingReviews: state.pendingReviews ?? current.pendingReviews,
      urgentReviews: state.urgentReviews ?? current.urgentReviews,
      expiringContracts: state.expiringContracts ?? current.expiringContracts,
      updatedAtMs: Date.now(),
    };

    await this.pool.query(
      `UPDATE ops_state
         SET pending_reviews = $1,
             urgent_reviews = $2,
             expiring_contracts = $3,
             updated_at_ms = $4
       WHERE id = 'default'`,
      [
        next.pendingReviews,
        next.urgentReviews,
        next.expiringContracts,
        next.updatedAtMs,
      ],
    );

    return next;
  }

  async listPlaybooks(): Promise<WorkflowPlaybook[]> {
    const result = await this.pool.query(
      `SELECT id, name, description, commands_json, created_at_ms, updated_at_ms
       FROM workflow_playbooks
       ORDER BY updated_at_ms DESC`,
    );

    return result.rows.map(row => ({
      id: String(row.id),
      name: String(row.name),
      description: String(row.description),
      commands: Array.isArray(row.commands_json)
        ? (row.commands_json as Array<Record<string, unknown>>)
        : [],
      createdAtMs: Number(row.created_at_ms),
      updatedAtMs: Number(row.updated_at_ms),
    }));
  }

  async getPlaybookById(playbookId: string): Promise<WorkflowPlaybook | null> {
    const result = await this.pool.query(
      `SELECT id, name, description, commands_json, created_at_ms, updated_at_ms
       FROM workflow_playbooks
       WHERE id = $1`,
      [playbookId],
    );

    if (!result.rows[0]) return null;
    const row = result.rows[0];

    return {
      id: String(row.id),
      name: String(row.name),
      description: String(row.description),
      commands: Array.isArray(row.commands_json)
        ? (row.commands_json as Array<Record<string, unknown>>)
        : [],
      createdAtMs: Number(row.created_at_ms),
      updatedAtMs: Number(row.updated_at_ms),
    };
  }

  async createPlaybook(input: {
    id: string;
    name: string;
    description: string;
    commands: Array<Record<string, unknown>>;
    createdAtMs: number;
  }): Promise<WorkflowPlaybook> {
    await this.pool.query(
      `INSERT INTO workflow_playbooks
         (id, name, description, commands_json, created_at_ms, updated_at_ms)
       VALUES ($1, $2, $3, $4::jsonb, $5, $5)`,
      [
        input.id,
        input.name,
        input.description,
        JSON.stringify(input.commands),
        input.createdAtMs,
      ],
    );

    return {
      id: input.id,
      name: input.name,
      description: input.description,
      commands: input.commands,
      createdAtMs: input.createdAtMs,
      updatedAtMs: input.createdAtMs,
    };
  }

  async createPlaybookRun(run: PlaybookRun): Promise<PlaybookRun> {
    await this.pool.query(
      `INSERT INTO workflow_playbook_runs
         (id, playbook_id, chain, dry_run, execution_mode, guardrail_profile, status, executed_steps, error_count, actor_id, source_surface, started_at_ms, finished_at_ms, rollback_window_until_ms, rollback_eligible, rollback_of_run_id, status_timeline_json, idempotency_key, rollback_on_failure, guardrail_results_json, effect_summaries_json, steps_json, created_at_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb, $18, $19, $20::jsonb, $21::jsonb, $22::jsonb, $23)`,
      [
        run.id,
        run.playbookId,
        run.chain,
        run.executionMode === 'dry-run',
        run.executionMode,
        run.guardrailProfile,
        run.status,
        run.executedSteps,
        run.errorCount,
        run.actorId,
        run.sourceSurface,
        run.startedAtMs,
        run.finishedAtMs ?? null,
        run.rollbackWindowUntilMs ?? null,
        run.rollbackEligible,
        run.rollbackOfRunId ?? null,
        JSON.stringify(run.statusTimeline),
        run.idempotencyKey ?? null,
        run.rollbackOnFailure,
        JSON.stringify(run.guardrailResults),
        JSON.stringify(run.effectSummaries),
        JSON.stringify(run.steps),
        run.createdAtMs,
      ],
    );
    return run;
  }

  async updatePlaybookRun(run: PlaybookRun): Promise<PlaybookRun | null> {
    const result = await this.pool.query(
      `UPDATE workflow_playbook_runs
          SET playbook_id = $2,
              chain = $3,
              dry_run = $4,
              execution_mode = $5,
              guardrail_profile = $6,
              status = $7,
              executed_steps = $8,
              error_count = $9,
              actor_id = $10,
              source_surface = $11,
              started_at_ms = $12,
              finished_at_ms = $13,
              rollback_window_until_ms = $14,
              rollback_eligible = $15,
              rollback_of_run_id = $16,
              status_timeline_json = $17::jsonb,
              idempotency_key = $18,
              rollback_on_failure = $19,
              guardrail_results_json = $20::jsonb,
              effect_summaries_json = $21::jsonb,
              steps_json = $22::jsonb,
              created_at_ms = $23
        WHERE id = $1
        RETURNING id, playbook_id, chain, dry_run, execution_mode, guardrail_profile, status, executed_steps, error_count, actor_id, source_surface, started_at_ms, finished_at_ms, rollback_window_until_ms, rollback_eligible, rollback_of_run_id, status_timeline_json, idempotency_key, rollback_on_failure, guardrail_results_json, effect_summaries_json, steps_json, created_at_ms`,
      [
        run.id,
        run.playbookId,
        run.chain,
        run.executionMode === 'dry-run',
        run.executionMode,
        run.guardrailProfile,
        run.status,
        run.executedSteps,
        run.errorCount,
        run.actorId,
        run.sourceSurface,
        run.startedAtMs,
        run.finishedAtMs ?? null,
        run.rollbackWindowUntilMs ?? null,
        run.rollbackEligible,
        run.rollbackOfRunId ?? null,
        JSON.stringify(run.statusTimeline),
        run.idempotencyKey ?? null,
        run.rollbackOnFailure,
        JSON.stringify(run.guardrailResults),
        JSON.stringify(run.effectSummaries),
        JSON.stringify(run.steps),
        run.createdAtMs,
      ],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return asPlaybookRun(row as Record<string, unknown>);
  }

  async getPlaybookRunById(runId: string): Promise<PlaybookRun | null> {
    const result = await this.pool.query(
      `SELECT id, playbook_id, chain, dry_run, execution_mode, guardrail_profile, status, executed_steps, error_count, actor_id, source_surface, started_at_ms, finished_at_ms, rollback_window_until_ms, rollback_eligible, rollback_of_run_id, status_timeline_json, idempotency_key, rollback_on_failure, guardrail_results_json, effect_summaries_json, steps_json, created_at_ms
       FROM workflow_playbook_runs
       WHERE id = $1`,
      [runId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return asPlaybookRun(row as Record<string, unknown>);
  }

  async markPlaybookRunRolledBack(
    runId: string,
    rolledBackAtMs: number,
    rollbackRunId?: string,
  ): Promise<PlaybookRun | null> {
    const result = await this.pool.query(
      `UPDATE workflow_playbook_runs
          SET status = 'rolled_back',
              finished_at_ms = $2,
              rollback_eligible = false,
              rollback_of_run_id = COALESCE($3, rollback_of_run_id),
              status_timeline_json = COALESCE(status_timeline_json, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('status', 'rolled_back', 'atMs', $2, 'note', 'Run was rolled back.'))
        WHERE id = $1
        RETURNING id, playbook_id, chain, dry_run, execution_mode, guardrail_profile, status, executed_steps, error_count, actor_id, source_surface, started_at_ms, finished_at_ms, rollback_window_until_ms, rollback_eligible, rollback_of_run_id, status_timeline_json, idempotency_key, rollback_on_failure, guardrail_results_json, effect_summaries_json, steps_json, created_at_ms`,
      [runId, rolledBackAtMs, rollbackRunId ?? null],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return asPlaybookRun(row as Record<string, unknown>);
  }

  async listPlaybookRuns(
    limit: number,
    filters?: PlaybookRunFilters,
  ): Promise<PlaybookRun[]> {
    const predicates: string[] = [];
    const params: unknown[] = [];

    if (filters?.playbookId) {
      const index = params.push(filters.playbookId);
      predicates.push(`playbook_id = $${index}`);
    }

    if (filters?.actorId) {
      const index = params.push(filters.actorId);
      predicates.push(`actor_id = $${index}`);
    }

    if (filters?.sourceSurface) {
      const index = params.push(filters.sourceSurface);
      predicates.push(`source_surface = $${index}`);
    }

    if (typeof filters?.executionMode === 'string') {
      const index = params.push(filters.executionMode);
      predicates.push(`execution_mode = $${index}`);
    }

    if (typeof filters?.status === 'string') {
      const index = params.push(filters.status);
      predicates.push(`status = $${index}`);
    }

    if (filters?.idempotencyKey) {
      const index = params.push(filters.idempotencyKey);
      predicates.push(`idempotency_key = $${index}`);
    }

    if (typeof filters?.hasErrors === 'boolean') {
      predicates.push(filters.hasErrors ? 'error_count > 0' : 'error_count = 0');
    }

    const where = predicates.length > 0 ? `WHERE ${predicates.join(' AND ')}` : '';
    const limitIndex = params.push(limit);
    const result = await this.pool.query(
      `SELECT id, playbook_id, chain, dry_run, execution_mode, guardrail_profile, status, executed_steps, error_count, actor_id, source_surface, started_at_ms, finished_at_ms, rollback_window_until_ms, rollback_eligible, rollback_of_run_id, status_timeline_json, idempotency_key, rollback_on_failure, guardrail_results_json, effect_summaries_json, steps_json, created_at_ms
       FROM workflow_playbook_runs
       ${where}
       ORDER BY created_at_ms DESC
       LIMIT $${limitIndex}`,
      params,
    );

    return result.rows.map(row => asPlaybookRun(row as Record<string, unknown>));
  }

  async createCloseRun(run: CloseRun): Promise<CloseRun> {
    await this.pool.query(
      `INSERT INTO workflow_close_runs
         (id, period, exception_count, summary_json, created_at_ms)
       VALUES ($1, $2, $3, $4::jsonb, $5)`,
      [run.id, run.period, run.exceptionCount, JSON.stringify(run.summary), run.createdAtMs],
    );
    return run;
  }

  async listCloseRuns(limit: number, filters?: CloseRunFilters): Promise<CloseRun[]> {
    const predicates: string[] = [];
    const params: unknown[] = [];

    if (filters?.period) {
      const index = params.push(filters.period);
      predicates.push(`period = $${index}`);
    }

    if (typeof filters?.hasExceptions === 'boolean') {
      predicates.push(filters.hasExceptions ? 'exception_count > 0' : 'exception_count = 0');
    }

    const where = predicates.length > 0 ? `WHERE ${predicates.join(' AND ')}` : '';
    const limitIndex = params.push(limit);
    const result = await this.pool.query(
      `SELECT id, period, exception_count, summary_json, created_at_ms
       FROM workflow_close_runs
       ${where}
       ORDER BY created_at_ms DESC
       LIMIT $${limitIndex}`,
      params,
    );

    return result.rows.map(row => asCloseRun(row as Record<string, unknown>));
  }

  async createWorkflowCommandRun(
    run: WorkflowCommandExecution,
  ): Promise<WorkflowCommandExecution> {
    await this.pool.query(
      `INSERT INTO workflow_command_runs
         (id, chain, steps_json, error_count, actor_id, source_surface, dry_run, execution_mode, guardrail_profile, status, started_at_ms, finished_at_ms, rollback_window_until_ms, rollback_eligible, rollback_of_run_id, status_timeline_json, idempotency_key, rollback_on_failure, guardrail_results_json, effect_summaries_json, executed_at_ms)
       VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb, $17, $18, $19::jsonb, $20::jsonb, $21)`,
      [
        run.id,
        run.chain,
        JSON.stringify(run.steps),
        run.errorCount,
        run.actorId,
        run.sourceSurface,
        run.executionMode === 'dry-run',
        run.executionMode,
        run.guardrailProfile,
        run.status,
        run.startedAtMs,
        run.finishedAtMs ?? null,
        run.rollbackWindowUntilMs ?? null,
        run.rollbackEligible,
        run.rollbackOfRunId ?? null,
        JSON.stringify(run.statusTimeline),
        run.idempotencyKey ?? null,
        run.rollbackOnFailure,
        JSON.stringify(run.guardrailResults),
        JSON.stringify(run.effectSummaries),
        run.executedAtMs,
      ],
    );

    return run;
  }

  async updateWorkflowCommandRun(
    run: WorkflowCommandExecution,
  ): Promise<WorkflowCommandExecution | null> {
    const result = await this.pool.query(
      `UPDATE workflow_command_runs
          SET chain = $2,
              steps_json = $3::jsonb,
              error_count = $4,
              actor_id = $5,
              source_surface = $6,
              dry_run = $7,
              execution_mode = $8,
              guardrail_profile = $9,
              status = $10,
              started_at_ms = $11,
              finished_at_ms = $12,
              rollback_window_until_ms = $13,
              rollback_eligible = $14,
              rollback_of_run_id = $15,
              status_timeline_json = $16::jsonb,
              idempotency_key = $17,
              rollback_on_failure = $18,
              guardrail_results_json = $19::jsonb,
              effect_summaries_json = $20::jsonb,
              executed_at_ms = $21
        WHERE id = $1
        RETURNING id, chain, steps_json, error_count, actor_id, source_surface, dry_run, execution_mode, guardrail_profile, status, started_at_ms, finished_at_ms, rollback_window_until_ms, rollback_eligible, rollback_of_run_id, status_timeline_json, idempotency_key, rollback_on_failure, guardrail_results_json, effect_summaries_json, executed_at_ms`,
      [
        run.id,
        run.chain,
        JSON.stringify(run.steps),
        run.errorCount,
        run.actorId,
        run.sourceSurface,
        run.executionMode === 'dry-run',
        run.executionMode,
        run.guardrailProfile,
        run.status,
        run.startedAtMs,
        run.finishedAtMs ?? null,
        run.rollbackWindowUntilMs ?? null,
        run.rollbackEligible,
        run.rollbackOfRunId ?? null,
        JSON.stringify(run.statusTimeline),
        run.idempotencyKey ?? null,
        run.rollbackOnFailure,
        JSON.stringify(run.guardrailResults),
        JSON.stringify(run.effectSummaries),
        run.executedAtMs,
      ],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return asWorkflowCommandRun(row as Record<string, unknown>);
  }

  async getWorkflowCommandRunById(
    runId: string,
  ): Promise<WorkflowCommandExecution | null> {
    const result = await this.pool.query(
      `SELECT id, chain, steps_json, error_count, actor_id, source_surface, dry_run, execution_mode, guardrail_profile, status, started_at_ms, finished_at_ms, rollback_window_until_ms, rollback_eligible, rollback_of_run_id, status_timeline_json, idempotency_key, rollback_on_failure, guardrail_results_json, effect_summaries_json, executed_at_ms
       FROM workflow_command_runs
       WHERE id = $1`,
      [runId],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return asWorkflowCommandRun(row as Record<string, unknown>);
  }

  async markWorkflowCommandRunRolledBack(
    runId: string,
    rolledBackAtMs: number,
    rollbackRunId?: string,
  ): Promise<WorkflowCommandExecution | null> {
    const result = await this.pool.query(
      `UPDATE workflow_command_runs
          SET status = 'rolled_back',
              finished_at_ms = $2,
              rollback_eligible = false,
              rollback_of_run_id = COALESCE($3, rollback_of_run_id),
              status_timeline_json = COALESCE(status_timeline_json, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('status', 'rolled_back', 'atMs', $2, 'note', 'Run was rolled back.'))
        WHERE id = $1
        RETURNING id, chain, steps_json, error_count, actor_id, source_surface, dry_run, execution_mode, guardrail_profile, status, started_at_ms, finished_at_ms, rollback_window_until_ms, rollback_eligible, rollback_of_run_id, status_timeline_json, idempotency_key, rollback_on_failure, guardrail_results_json, effect_summaries_json, executed_at_ms`,
      [runId, rolledBackAtMs, rollbackRunId ?? null],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return asWorkflowCommandRun(row as Record<string, unknown>);
  }

  async findRunByIdempotencyKey(
    scope: 'playbook' | 'command',
    idempotencyKey: string,
  ): Promise<PlaybookRun | WorkflowCommandExecution | null> {
    if (scope === 'playbook') {
      const result = await this.pool.query(
        `SELECT id, playbook_id, chain, dry_run, execution_mode, guardrail_profile, status, executed_steps, error_count, actor_id, source_surface, started_at_ms, finished_at_ms, rollback_window_until_ms, rollback_eligible, rollback_of_run_id, status_timeline_json, idempotency_key, rollback_on_failure, guardrail_results_json, effect_summaries_json, steps_json, created_at_ms
         FROM workflow_playbook_runs
         WHERE idempotency_key = $1
         ORDER BY created_at_ms DESC
         LIMIT 1`,
        [idempotencyKey],
      );
      const row = result.rows[0];
      if (!row) {
        return null;
      }
      return asPlaybookRun(row as Record<string, unknown>);
    }

    const result = await this.pool.query(
      `SELECT id, chain, steps_json, error_count, actor_id, source_surface, dry_run, execution_mode, guardrail_profile, status, started_at_ms, finished_at_ms, rollback_window_until_ms, rollback_eligible, rollback_of_run_id, status_timeline_json, idempotency_key, rollback_on_failure, guardrail_results_json, effect_summaries_json, executed_at_ms
       FROM workflow_command_runs
       WHERE idempotency_key = $1
       ORDER BY executed_at_ms DESC
       LIMIT 1`,
      [idempotencyKey],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return asWorkflowCommandRun(row as Record<string, unknown>);
  }

  async listWorkflowCommandRuns(
    limit: number,
    filters?: WorkflowCommandRunFilters,
  ): Promise<WorkflowCommandExecution[]> {
    const predicates: string[] = [];
    const params: unknown[] = [];

    if (filters?.actorId) {
      const index = params.push(filters.actorId);
      predicates.push(`actor_id = $${index}`);
    }

    if (filters?.sourceSurface) {
      const index = params.push(filters.sourceSurface);
      predicates.push(`source_surface = $${index}`);
    }

    if (typeof filters?.executionMode === 'string') {
      const index = params.push(filters.executionMode);
      predicates.push(`execution_mode = $${index}`);
    }

    if (typeof filters?.status === 'string') {
      const index = params.push(filters.status);
      predicates.push(`status = $${index}`);
    }

    if (filters?.idempotencyKey) {
      const index = params.push(filters.idempotencyKey);
      predicates.push(`idempotency_key = $${index}`);
    }

    if (typeof filters?.hasErrors === 'boolean') {
      predicates.push(filters.hasErrors ? 'error_count > 0' : 'error_count = 0');
    }

    const where = predicates.length > 0 ? `WHERE ${predicates.join(' AND ')}` : '';
    const limitIndex = params.push(limit);

    const result = await this.pool.query(
      `SELECT id, chain, steps_json, error_count, actor_id, source_surface, dry_run, execution_mode, guardrail_profile, status, started_at_ms, finished_at_ms, rollback_window_until_ms, rollback_eligible, rollback_of_run_id, status_timeline_json, idempotency_key, rollback_on_failure, guardrail_results_json, effect_summaries_json, executed_at_ms
       FROM workflow_command_runs
       ${where}
       ORDER BY executed_at_ms DESC
       LIMIT $${limitIndex}`,
      params,
    );

    return result.rows.map(row => asWorkflowCommandRun(row as Record<string, unknown>));
  }

  async listScenarioBranches(): Promise<ScenarioBranch[]> {
    const result = await this.pool.query(
      `SELECT id, name, status, base_branch_id, notes, created_at_ms, updated_at_ms, adopted_at_ms
       FROM scenario_branches
       ORDER BY updated_at_ms DESC`,
    );

    return result.rows.map(row => ({
      id: String(row.id),
      name: String(row.name),
      status: row.status === 'adopted' ? 'adopted' : 'draft',
      baseBranchId: row.base_branch_id ? String(row.base_branch_id) : undefined,
      notes: row.notes ? String(row.notes) : undefined,
      createdAtMs: Number(row.created_at_ms),
      updatedAtMs: Number(row.updated_at_ms),
      adoptedAtMs: row.adopted_at_ms ? Number(row.adopted_at_ms) : undefined,
    }));
  }

  async getScenarioBranchById(branchId: string): Promise<ScenarioBranch | null> {
    const result = await this.pool.query(
      `SELECT id, name, status, base_branch_id, notes, created_at_ms, updated_at_ms, adopted_at_ms
       FROM scenario_branches
       WHERE id = $1`,
      [branchId],
    );

    const row = result.rows[0];
    if (!row) return null;

    return {
      id: String(row.id),
      name: String(row.name),
      status: row.status === 'adopted' ? 'adopted' : 'draft',
      baseBranchId: row.base_branch_id ? String(row.base_branch_id) : undefined,
      notes: row.notes ? String(row.notes) : undefined,
      createdAtMs: Number(row.created_at_ms),
      updatedAtMs: Number(row.updated_at_ms),
      adoptedAtMs: row.adopted_at_ms ? Number(row.adopted_at_ms) : undefined,
    };
  }

  async createScenarioBranch(branch: ScenarioBranch): Promise<ScenarioBranch> {
    await this.pool.query(
      `INSERT INTO scenario_branches
         (id, name, status, base_branch_id, notes, created_at_ms, updated_at_ms, adopted_at_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        branch.id,
        branch.name,
        branch.status,
        branch.baseBranchId ?? null,
        branch.notes ?? null,
        branch.createdAtMs,
        branch.updatedAtMs,
        branch.adoptedAtMs ?? null,
      ],
    );

    return branch;
  }

  async addScenarioMutation(
    mutation: ScenarioMutation,
  ): Promise<ScenarioMutation | null> {
    const branch = await this.getScenarioBranchById(mutation.branchId);
    if (!branch) return null;

    await this.pool.query(
      `INSERT INTO scenario_mutations
         (id, branch_id, kind, payload_json, created_at_ms)
       VALUES ($1, $2, $3, $4::jsonb, $5)`,
      [
        mutation.id,
        mutation.branchId,
        mutation.kind,
        JSON.stringify(mutation.payload),
        mutation.createdAtMs,
      ],
    );

    await this.pool.query(
      `UPDATE scenario_branches
          SET updated_at_ms = $1
        WHERE id = $2`,
      [mutation.createdAtMs, mutation.branchId],
    );

    return mutation;
  }

  async listScenarioMutations(branchId: string): Promise<ScenarioMutation[]> {
    const result = await this.pool.query(
      `SELECT id, branch_id, kind, payload_json, created_at_ms
       FROM scenario_mutations
       WHERE branch_id = $1
       ORDER BY created_at_ms ASC`,
      [branchId],
    );

    return result.rows.map(row => ({
      id: String(row.id),
      branchId: String(row.branch_id),
      kind: String(row.kind),
      payload: asRecord(row.payload_json),
      createdAtMs: Number(row.created_at_ms),
    }));
  }

  async adoptScenarioBranch(
    branchId: string,
    adoptedAtMs: number,
  ): Promise<ScenarioBranch | null> {
    const result = await this.pool.query(
      `UPDATE scenario_branches
          SET status = 'adopted',
              adopted_at_ms = $1,
              updated_at_ms = $1
        WHERE id = $2
        RETURNING id, name, status, base_branch_id, notes, created_at_ms, updated_at_ms, adopted_at_ms`,
      [adoptedAtMs, branchId],
    );

    const row = result.rows[0];
    if (!row) return null;

    return {
      id: String(row.id),
      name: String(row.name),
      status: 'adopted',
      baseBranchId: row.base_branch_id ? String(row.base_branch_id) : undefined,
      notes: row.notes ? String(row.notes) : undefined,
      createdAtMs: Number(row.created_at_ms),
      updatedAtMs: Number(row.updated_at_ms),
      adoptedAtMs: Number(row.adopted_at_ms),
    };
  }

  async listDelegateLanes(
    limit: number,
    filters?: DelegateLaneFilters,
  ): Promise<DelegateLane[]> {
    const clauses: string[] = [];
    const values: unknown[] = [];

    if (filters?.status) {
      values.push(filters.status);
      clauses.push(`status = $${values.length}`);
    }
    if (filters?.assignee) {
      values.push(filters.assignee);
      clauses.push(`assignee = $${values.length}`);
    }
    if (filters?.assignedBy) {
      values.push(filters.assignedBy);
      clauses.push(`assigned_by = $${values.length}`);
    }
    if (filters?.priority) {
      values.push(filters.priority);
      clauses.push(`priority = $${values.length}`);
    }

    values.push(limit);
    const limitPlaceholder = `$${values.length}`;
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';

    const result = await this.pool.query(
      `SELECT id, title, priority, status, assignee, assigned_by, payload_json, created_at_ms, updated_at_ms,
              due_at_ms, accepted_at_ms, completed_at_ms, rejected_at_ms
       FROM delegate_lanes
       ${where}
       ORDER BY updated_at_ms DESC
       LIMIT ${limitPlaceholder}`,
      values,
    );

    return result.rows.map(row => asDelegateLane(row as Record<string, unknown>));
  }

  async getDelegateLaneById(laneId: string): Promise<DelegateLane | null> {
    const result = await this.pool.query(
      `SELECT id, title, priority, status, assignee, assigned_by, payload_json, created_at_ms, updated_at_ms,
              due_at_ms, accepted_at_ms, completed_at_ms, rejected_at_ms
       FROM delegate_lanes
       WHERE id = $1`,
      [laneId],
    );

    const row = result.rows[0];
    if (!row) return null;

    return asDelegateLane(row as Record<string, unknown>);
  }

  async createDelegateLane(lane: DelegateLane): Promise<DelegateLane> {
    await this.pool.query(
      `INSERT INTO delegate_lanes
         (id, title, priority, status, assignee, assigned_by, payload_json, created_at_ms, updated_at_ms,
          due_at_ms, accepted_at_ms, completed_at_ms, rejected_at_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12, $13)`,
      [
        lane.id,
        lane.title,
        lane.priority,
        lane.status,
        lane.assignee,
        lane.assignedBy,
        JSON.stringify(lane.payload),
        lane.createdAtMs,
        lane.updatedAtMs,
        lane.dueAtMs ?? null,
        lane.acceptedAtMs ?? null,
        lane.completedAtMs ?? null,
        lane.rejectedAtMs ?? null,
      ],
    );
    return lane;
  }

  async updateDelegateLane(lane: DelegateLane): Promise<DelegateLane> {
    await this.pool.query(
      `UPDATE delegate_lanes
          SET title = $2,
              priority = $3,
              status = $4,
              assignee = $5,
              assigned_by = $6,
              payload_json = $7::jsonb,
              updated_at_ms = $8,
              due_at_ms = $9,
              accepted_at_ms = $10,
              completed_at_ms = $11,
              rejected_at_ms = $12
        WHERE id = $1`,
      [
        lane.id,
        lane.title,
        lane.priority,
        lane.status,
        lane.assignee,
        lane.assignedBy,
        JSON.stringify(lane.payload),
        lane.updatedAtMs,
        lane.dueAtMs ?? null,
        lane.acceptedAtMs ?? null,
        lane.completedAtMs ?? null,
        lane.rejectedAtMs ?? null,
      ],
    );
    return lane;
  }

  async createDelegateLaneEvent(event: DelegateLaneEvent): Promise<DelegateLaneEvent> {
    await this.pool.query(
      `INSERT INTO delegate_lane_events
         (id, lane_id, event_type, actor_id, message, payload_json, created_at_ms)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
      [
        event.id,
        event.laneId,
        event.type,
        event.actorId,
        event.message ?? null,
        event.payload ? JSON.stringify(event.payload) : null,
        event.createdAtMs,
      ],
    );
    return event;
  }

  async listDelegateLaneEvents(
    laneId: string,
    limit: number,
  ): Promise<DelegateLaneEvent[]> {
    const result = await this.pool.query(
      `SELECT id, lane_id, event_type, actor_id, message, payload_json, created_at_ms
       FROM delegate_lane_events
       WHERE lane_id = $1
       ORDER BY created_at_ms DESC
       LIMIT $2`,
      [laneId, limit],
    );
    return result.rows.map(row => asDelegateLaneEvent(row as Record<string, unknown>));
  }

  async recordActionOutcome(input: {
    id: string;
    actionId: string;
    outcome: string;
    notes?: string;
    recordedAtMs: number;
  }): Promise<ActionOutcome> {
    await this.pool.query(
      `INSERT INTO action_outcomes (id, action_id, outcome, notes, recorded_at_ms)
       VALUES ($1, $2, $3, $4, $5)`,
      [input.id, input.actionId, input.outcome, input.notes ?? null, input.recordedAtMs],
    );

    return {
      id: input.id,
      actionId: input.actionId,
      outcome: input.outcome,
      notes: input.notes,
      recordedAtMs: input.recordedAtMs,
    };
  }

  async listActionOutcomes(input: {
    limit: number;
    actionId?: string;
  }): Promise<ActionOutcome[]> {
    const predicates: string[] = [];
    const params: unknown[] = [];

    if (input.actionId) {
      const index = params.push(input.actionId);
      predicates.push(`action_id = $${index}`);
    }

    const where = predicates.length > 0 ? `WHERE ${predicates.join(' AND ')}` : '';
    const limitIndex = params.push(input.limit);

    const result = await this.pool.query(
      `SELECT id, action_id, outcome, notes, recorded_at_ms
       FROM action_outcomes
       ${where}
       ORDER BY recorded_at_ms DESC
       LIMIT $${limitIndex}`,
      params,
    );

    return result.rows.map(row => asActionOutcome(row as Record<string, unknown>));
  }

  async appendOpsActivityEvent(event: OpsActivityEvent): Promise<OpsActivityEvent> {
    await this.pool.query(
      `INSERT INTO ops_activity_events
         (id, kind, title, detail, route, severity, created_at_ms, meta_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       ON CONFLICT (id) DO UPDATE
         SET kind = EXCLUDED.kind,
             title = EXCLUDED.title,
             detail = EXCLUDED.detail,
             route = EXCLUDED.route,
             severity = EXCLUDED.severity,
             created_at_ms = EXCLUDED.created_at_ms,
             meta_json = EXCLUDED.meta_json`,
      [
        event.id,
        event.kind,
        event.title,
        event.detail,
        event.route ?? null,
        event.severity,
        event.createdAtMs,
        JSON.stringify(event.meta ?? null),
      ],
    );
    return event;
  }

  async listOpsActivityEvents(
    limit: number,
    filters?: OpsActivityFilters,
  ): Promise<OpsActivityEvent[]> {
    const predicates: string[] = [];
    const params: unknown[] = [];

    if (filters?.kinds && filters.kinds.length > 0) {
      const index = params.push(filters.kinds);
      predicates.push(`kind = ANY($${index}::text[])`);
    }

    if (filters?.severities && filters.severities.length > 0) {
      const index = params.push(filters.severities);
      predicates.push(`severity = ANY($${index}::text[])`);
    }

    if (filters?.cursor) {
      const createdIndex = params.push(filters.cursor.createdAtMs);
      const idIndex = params.push(filters.cursor.id);
      predicates.push(
        `(created_at_ms < $${createdIndex} OR (created_at_ms = $${createdIndex} AND id < $${idIndex}))`,
      );
    }

    const where = predicates.length > 0 ? `WHERE ${predicates.join(' AND ')}` : '';
    const limitIndex = params.push(limit);
    const result = await this.pool.query(
      `SELECT id, kind, title, detail, route, severity, created_at_ms, meta_json
       FROM ops_activity_events
       ${where}
       ORDER BY created_at_ms DESC, id DESC
       LIMIT $${limitIndex}`,
      params,
    );

    return result.rows.map(row => asOpsActivityEvent(row as Record<string, unknown>));
  }

  async countOpsActivityEvents(): Promise<number> {
    const result = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM ops_activity_events`,
    );
    return Number(result.rows[0]?.count || '0');
  }

  async trimOpsActivityEvents(input: OpsActivityTrimInput): Promise<number> {
    let removed = 0;

    if (
      typeof input.olderThanMs === 'number' &&
      Number.isFinite(input.olderThanMs)
    ) {
      const older = await this.pool.query<{ count: string }>(
        `WITH deleted AS (
           DELETE FROM ops_activity_events
           WHERE created_at_ms < $1
           RETURNING 1
         )
         SELECT COUNT(*)::text AS count FROM deleted`,
        [input.olderThanMs],
      );
      removed += Number(older.rows[0]?.count || '0');
    }

    if (
      typeof input.maxRows === 'number' &&
      Number.isFinite(input.maxRows) &&
      input.maxRows >= 0
    ) {
      const current = await this.countOpsActivityEvents();
      if (current > input.maxRows) {
        const overflow = current - input.maxRows;
        const trimmed = await this.pool.query<{ count: string }>(
          `WITH doomed AS (
             SELECT id
             FROM ops_activity_events
             ORDER BY created_at_ms DESC, id DESC
             OFFSET $1
           ),
           deleted AS (
             DELETE FROM ops_activity_events e
             USING doomed d
             WHERE e.id = d.id
             RETURNING 1
           )
           SELECT COUNT(*)::text AS count FROM deleted`,
          [input.maxRows],
        );
        const actuallyRemoved = Number(trimmed.rows[0]?.count || '0');
        removed += actuallyRemoved > 0 ? actuallyRemoved : overflow;
      }
    }

    return removed;
  }

  async trimWorkerJobAttempts(input: OpsActivityTrimInput): Promise<number> {
    let removed = 0;

    if (
      typeof input.olderThanMs === 'number' &&
      Number.isFinite(input.olderThanMs)
    ) {
      const older = await this.pool.query<{ count: string }>(
        `WITH deleted AS (
           DELETE FROM worker_job_attempts
           WHERE created_at_ms < $1
           RETURNING 1
         )
         SELECT COUNT(*)::text AS count FROM deleted`,
        [input.olderThanMs],
      );
      removed += Number(older.rows[0]?.count || '0');
    }

    if (
      typeof input.maxRows === 'number' &&
      Number.isFinite(input.maxRows) &&
      input.maxRows >= 0
    ) {
      const current = await this.countWorkerJobAttempts();
      if (current > input.maxRows) {
        const trimmed = await this.pool.query<{ count: string }>(
          `WITH doomed AS (
             SELECT id
             FROM worker_job_attempts
             ORDER BY created_at_ms DESC, id DESC
             OFFSET $1
           ),
           deleted AS (
             DELETE FROM worker_job_attempts t
             USING doomed d
             WHERE t.id = d.id
             RETURNING 1
           )
           SELECT COUNT(*)::text AS count FROM deleted`,
          [input.maxRows],
        );
        removed += Number(trimmed.rows[0]?.count || '0');
      }
    }

    return removed;
  }

  async trimWorkerFingerprintClaimEvents(input: OpsActivityTrimInput): Promise<number> {
    let removed = 0;

    if (
      typeof input.olderThanMs === 'number' &&
      Number.isFinite(input.olderThanMs)
    ) {
      const older = await this.pool.query<{ count: string }>(
        `WITH deleted AS (
           DELETE FROM worker_fingerprint_claim_events
           WHERE created_at_ms < $1
           RETURNING 1
         )
         SELECT COUNT(*)::text AS count FROM deleted`,
        [input.olderThanMs],
      );
      removed += Number(older.rows[0]?.count || '0');
    }

    if (
      typeof input.maxRows === 'number' &&
      Number.isFinite(input.maxRows) &&
      input.maxRows >= 0
    ) {
      const current = await this.countWorkerFingerprintClaimEvents();
      if (current > input.maxRows) {
        const trimmed = await this.pool.query<{ count: string }>(
          `WITH doomed AS (
             SELECT id
             FROM worker_fingerprint_claim_events
             ORDER BY created_at_ms DESC, id DESC
             OFFSET $1
           ),
           deleted AS (
             DELETE FROM worker_fingerprint_claim_events t
             USING doomed d
             WHERE t.id = d.id
             RETURNING 1
           )
           SELECT COUNT(*)::text AS count FROM deleted`,
          [input.maxRows],
        );
        removed += Number(trimmed.rows[0]?.count || '0');
      }
    }

    return removed;
  }

  async trimWorkerDeadLetters(input: OpsActivityTrimInput): Promise<number> {
    let removed = 0;

    if (
      typeof input.olderThanMs === 'number' &&
      Number.isFinite(input.olderThanMs)
    ) {
      const older = await this.pool.query<{ count: string }>(
        `WITH deleted AS (
           DELETE FROM worker_dead_letters
           WHERE created_at_ms < $1
           RETURNING 1
         )
         SELECT COUNT(*)::text AS count FROM deleted`,
        [input.olderThanMs],
      );
      removed += Number(older.rows[0]?.count || '0');
    }

    if (
      typeof input.maxRows === 'number' &&
      Number.isFinite(input.maxRows) &&
      input.maxRows >= 0
    ) {
      const current = await this.countWorkerDeadLetters();
      if (current > input.maxRows) {
        const trimmed = await this.pool.query<{ count: string }>(
          `WITH doomed AS (
             SELECT id
             FROM worker_dead_letters
             ORDER BY created_at_ms DESC, id DESC
             OFFSET $1
           ),
           deleted AS (
             DELETE FROM worker_dead_letters t
             USING doomed d
             WHERE t.id = d.id
             RETURNING 1
           )
           SELECT COUNT(*)::text AS count FROM deleted`,
          [input.maxRows],
        );
        removed += Number(trimmed.rows[0]?.count || '0');
      }
    }

    return removed;
  }

  async createWorkerJobAttempt(attempt: WorkerJobAttempt): Promise<WorkerJobAttempt> {
    const result = await this.pool.query(
      `INSERT INTO worker_job_attempts
         (id, worker_id, job_id, job_name, job_fingerprint, receipt, attempt, outcome, processing_ms, error_message, payload_json, created_at_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)
       ON CONFLICT (id) DO UPDATE
         SET worker_id = EXCLUDED.worker_id,
             job_id = EXCLUDED.job_id,
             job_name = EXCLUDED.job_name,
             job_fingerprint = EXCLUDED.job_fingerprint,
             receipt = EXCLUDED.receipt,
             attempt = EXCLUDED.attempt,
             outcome = EXCLUDED.outcome,
             processing_ms = EXCLUDED.processing_ms,
             error_message = EXCLUDED.error_message,
             payload_json = EXCLUDED.payload_json,
             created_at_ms = EXCLUDED.created_at_ms
       RETURNING id, worker_id, job_id, job_name, job_fingerprint, receipt, attempt, outcome, processing_ms, error_message, payload_json, created_at_ms`,
      [
        attempt.id,
        attempt.workerId,
        attempt.jobId,
        attempt.jobName,
        attempt.jobFingerprint ?? null,
        attempt.receipt,
        attempt.attempt,
        attempt.outcome,
        attempt.processingMs ?? null,
        attempt.errorMessage ?? null,
        JSON.stringify(attempt.payload ?? null),
        attempt.createdAtMs,
      ],
    );
    return asWorkerJobAttempt(result.rows[0] as Record<string, unknown>);
  }

  async listWorkerJobAttempts(
    limit: number,
    filters?: WorkerJobAttemptFilters,
  ): Promise<WorkerJobAttempt[]> {
    const predicates: string[] = [];
    const params: unknown[] = [];

    if (
      typeof filters?.sinceMs === 'number' &&
      Number.isFinite(filters.sinceMs)
    ) {
      const index = params.push(Math.trunc(filters.sinceMs));
      predicates.push(`created_at_ms >= $${index}`);
    }

    if (filters?.workerId) {
      const index = params.push(filters.workerId);
      predicates.push(`worker_id = $${index}`);
    }

    if (filters?.jobName) {
      const index = params.push(filters.jobName);
      predicates.push(`job_name = $${index}`);
    }

    if (filters?.outcomes && filters.outcomes.length > 0) {
      const index = params.push(filters.outcomes);
      predicates.push(`outcome = ANY($${index}::text[])`);
    }

    const where = predicates.length > 0 ? `WHERE ${predicates.join(' AND ')}` : '';
    const limitIndex = params.push(limit);
    const result = await this.pool.query(
      `SELECT id, worker_id, job_id, job_name, job_fingerprint, receipt, attempt, outcome, processing_ms, error_message, payload_json, created_at_ms
       FROM worker_job_attempts
       ${where}
       ORDER BY created_at_ms DESC
       LIMIT $${limitIndex}`,
      params,
    );

    return result.rows.map(row => asWorkerJobAttempt(row as Record<string, unknown>));
  }

  async countWorkerJobAttempts(): Promise<number> {
    const result = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM worker_job_attempts`,
    );
    return Number(result.rows[0]?.count || '0');
  }

  async hasSuccessfulWorkerJobFingerprint(fingerprint: string): Promise<boolean> {
    if (fingerprint.length === 0) {
      return false;
    }

    const result = await this.pool.query<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1
         FROM worker_job_attempts
         WHERE job_fingerprint = $1
           AND outcome = 'acked'
       ) AS exists`,
      [fingerprint],
    );
    return result.rows[0]?.exists === true;
  }

  async createWorkerFingerprintClaimEvent(
    event: WorkerFingerprintClaimEvent,
  ): Promise<WorkerFingerprintClaimEvent> {
    const result = await this.pool.query(
      `INSERT INTO worker_fingerprint_claim_events
         (id, worker_id, fingerprint, lease_key, status, ttl_ms, expires_at_ms, stale_recovered, created_at_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE
         SET worker_id = EXCLUDED.worker_id,
             fingerprint = EXCLUDED.fingerprint,
             lease_key = EXCLUDED.lease_key,
             status = EXCLUDED.status,
             ttl_ms = EXCLUDED.ttl_ms,
             expires_at_ms = EXCLUDED.expires_at_ms,
             stale_recovered = EXCLUDED.stale_recovered,
             created_at_ms = EXCLUDED.created_at_ms
       RETURNING id, worker_id, fingerprint, lease_key, status, ttl_ms, expires_at_ms, stale_recovered, created_at_ms`,
      [
        event.id,
        event.workerId,
        event.fingerprint,
        event.leaseKey,
        event.status,
        event.ttlMs,
        event.expiresAtMs ?? null,
        event.staleRecovered,
        event.createdAtMs,
      ],
    );

    return asWorkerFingerprintClaimEvent(result.rows[0] as Record<string, unknown>);
  }

  async listWorkerFingerprintClaimEvents(
    limit: number,
    filters?: WorkerFingerprintClaimFilters,
  ): Promise<WorkerFingerprintClaimEvent[]> {
    const predicates: string[] = [];
    const params: unknown[] = [];

    if (
      typeof filters?.sinceMs === 'number' &&
      Number.isFinite(filters.sinceMs)
    ) {
      const index = params.push(Math.trunc(filters.sinceMs));
      predicates.push(`created_at_ms >= $${index}`);
    }

    if (filters?.workerId) {
      const index = params.push(filters.workerId);
      predicates.push(`worker_id = $${index}`);
    }

    if (filters?.statuses && filters.statuses.length > 0) {
      const index = params.push(filters.statuses);
      predicates.push(`status = ANY($${index}::text[])`);
    }

    if (typeof filters?.staleRecovered === 'boolean') {
      const index = params.push(filters.staleRecovered);
      predicates.push(`stale_recovered = $${index}`);
    }

    const where = predicates.length > 0 ? `WHERE ${predicates.join(' AND ')}` : '';
    const limitIndex = params.push(limit);
    const result = await this.pool.query(
      `SELECT id, worker_id, fingerprint, lease_key, status, ttl_ms, expires_at_ms, stale_recovered, created_at_ms
       FROM worker_fingerprint_claim_events
       ${where}
       ORDER BY created_at_ms DESC, id DESC
       LIMIT $${limitIndex}`,
      params,
    );

    return result.rows.map(row => asWorkerFingerprintClaimEvent(row as Record<string, unknown>));
  }

  async countWorkerFingerprintClaimEvents(
    filters?: WorkerFingerprintClaimFilters,
  ): Promise<number> {
    const predicates: string[] = [];
    const params: unknown[] = [];

    if (
      typeof filters?.sinceMs === 'number' &&
      Number.isFinite(filters.sinceMs)
    ) {
      const index = params.push(Math.trunc(filters.sinceMs));
      predicates.push(`created_at_ms >= $${index}`);
    }

    if (filters?.workerId) {
      const index = params.push(filters.workerId);
      predicates.push(`worker_id = $${index}`);
    }

    if (filters?.statuses && filters.statuses.length > 0) {
      const index = params.push(filters.statuses);
      predicates.push(`status = ANY($${index}::text[])`);
    }

    if (typeof filters?.staleRecovered === 'boolean') {
      const index = params.push(filters.staleRecovered);
      predicates.push(`stale_recovered = $${index}`);
    }

    const where = predicates.length > 0 ? `WHERE ${predicates.join(' AND ')}` : '';
    const result = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM worker_fingerprint_claim_events
       ${where}`,
      params,
    );
    return Number(result.rows[0]?.count || '0');
  }

  async createWorkerDeadLetter(entry: WorkerDeadLetter): Promise<WorkerDeadLetter> {
    const result = await this.pool.query(
      `INSERT INTO worker_dead_letters
         (id, attempt_id, worker_id, job_id, job_name, receipt, attempt, status, replay_count, last_replayed_at_ms, resolved_at_ms, resolution_note, error_message, payload_json, created_at_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15)
       ON CONFLICT (id) DO UPDATE
         SET attempt_id = EXCLUDED.attempt_id,
             worker_id = EXCLUDED.worker_id,
             job_id = EXCLUDED.job_id,
             job_name = EXCLUDED.job_name,
             receipt = EXCLUDED.receipt,
             attempt = EXCLUDED.attempt,
             status = EXCLUDED.status,
             replay_count = EXCLUDED.replay_count,
             last_replayed_at_ms = EXCLUDED.last_replayed_at_ms,
             resolved_at_ms = EXCLUDED.resolved_at_ms,
             resolution_note = EXCLUDED.resolution_note,
             error_message = EXCLUDED.error_message,
             payload_json = EXCLUDED.payload_json,
             created_at_ms = EXCLUDED.created_at_ms
       RETURNING id, attempt_id, worker_id, job_id, job_name, receipt, attempt, status, replay_count, last_replayed_at_ms, resolved_at_ms, resolution_note, error_message, payload_json, created_at_ms`,
      [
        entry.id,
        entry.attemptId,
        entry.workerId,
        entry.jobId,
        entry.jobName,
        entry.receipt,
        entry.attempt,
        entry.status,
        entry.replayCount,
        entry.lastReplayedAtMs ?? null,
        entry.resolvedAtMs ?? null,
        entry.resolutionNote ?? null,
        entry.errorMessage ?? null,
        JSON.stringify(entry.payload ?? null),
        entry.createdAtMs,
      ],
    );
    return asWorkerDeadLetter(result.rows[0] as Record<string, unknown>);
  }

  async getWorkerDeadLetterById(deadLetterId: string): Promise<WorkerDeadLetter | null> {
    const result = await this.pool.query(
      `SELECT id, attempt_id, worker_id, job_id, job_name, receipt, attempt, status, replay_count, last_replayed_at_ms, resolved_at_ms, resolution_note, error_message, payload_json, created_at_ms
       FROM worker_dead_letters
       WHERE id = $1`,
      [deadLetterId],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return asWorkerDeadLetter(row as Record<string, unknown>);
  }

  async listWorkerDeadLetters(
    limit: number,
    filters?: WorkerDeadLetterFilters,
  ): Promise<WorkerDeadLetter[]> {
    const predicates: string[] = [];
    const params: unknown[] = [];

    if (filters?.status) {
      const index = params.push(filters.status);
      predicates.push(`status = $${index}`);
    }
    if (filters?.workerId) {
      const index = params.push(filters.workerId);
      predicates.push(`worker_id = $${index}`);
    }
    if (filters?.jobName) {
      const index = params.push(filters.jobName);
      predicates.push(`job_name = $${index}`);
    }

    const where = predicates.length > 0 ? `WHERE ${predicates.join(' AND ')}` : '';
    const limitIndex = params.push(limit);

    const result = await this.pool.query(
      `SELECT id, attempt_id, worker_id, job_id, job_name, receipt, attempt, status, replay_count, last_replayed_at_ms, resolved_at_ms, resolution_note, error_message, payload_json, created_at_ms
       FROM worker_dead_letters
       ${where}
       ORDER BY created_at_ms DESC
       LIMIT $${limitIndex}`,
      params,
    );
    return result.rows.map(row => asWorkerDeadLetter(row as Record<string, unknown>));
  }

  async updateWorkerDeadLetter(entry: WorkerDeadLetter): Promise<WorkerDeadLetter> {
    const result = await this.pool.query(
      `UPDATE worker_dead_letters
          SET attempt_id = $2,
              worker_id = $3,
              job_id = $4,
              job_name = $5,
              receipt = $6,
              attempt = $7,
              status = $8,
              replay_count = $9,
              last_replayed_at_ms = $10,
              resolved_at_ms = $11,
              resolution_note = $12,
              error_message = $13,
              payload_json = $14::jsonb,
              created_at_ms = $15
        WHERE id = $1
        RETURNING id, attempt_id, worker_id, job_id, job_name, receipt, attempt, status, replay_count, last_replayed_at_ms, resolved_at_ms, resolution_note, error_message, payload_json, created_at_ms`,
      [
        entry.id,
        entry.attemptId,
        entry.workerId,
        entry.jobId,
        entry.jobName,
        entry.receipt,
        entry.attempt,
        entry.status,
        entry.replayCount,
        entry.lastReplayedAtMs ?? null,
        entry.resolvedAtMs ?? null,
        entry.resolutionNote ?? null,
        entry.errorMessage ?? null,
        JSON.stringify(entry.payload ?? null),
        entry.createdAtMs,
      ],
    );
    const row = result.rows[0];
    if (!row) {
      return entry;
    }
    return asWorkerDeadLetter(row as Record<string, unknown>);
  }

  async countWorkerDeadLetters(): Promise<number> {
    const result = await this.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM worker_dead_letters`,
    );
    return Number(result.rows[0]?.count || '0');
  }

  async acquireSystemLease(input: {
    leaseKey: string;
    ownerId: string;
    ttlMs: number;
  }): Promise<boolean> {
    const now = Date.now();
    const expiresAtMs = now + Math.max(1, Math.trunc(input.ttlMs));
    const result = await this.pool.query<{ lease_key: string }>(
      `INSERT INTO system_leases (lease_key, owner_id, expires_at_ms, updated_at_ms)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (lease_key) DO UPDATE
         SET owner_id = EXCLUDED.owner_id,
             expires_at_ms = EXCLUDED.expires_at_ms,
             updated_at_ms = EXCLUDED.updated_at_ms
       WHERE system_leases.expires_at_ms <= EXCLUDED.updated_at_ms
          OR system_leases.owner_id = EXCLUDED.owner_id
      RETURNING lease_key`,
      [input.leaseKey, input.ownerId, expiresAtMs, now],
    );
    return result.rows.length > 0;
  }

  async getSystemLease(input: {
    leaseKey: string;
  }): Promise<{ leaseKey: string; ownerId: string; expiresAtMs: number } | null> {
    const result = await this.pool.query<{
      lease_key: string;
      owner_id: string;
      expires_at_ms: string;
    }>(
      `SELECT lease_key, owner_id, expires_at_ms::text AS expires_at_ms
       FROM system_leases
       WHERE lease_key = $1`,
      [input.leaseKey],
    );

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return {
      leaseKey: row.lease_key,
      ownerId: row.owner_id,
      expiresAtMs: Number(row.expires_at_ms),
    };
  }

  async releaseSystemLease(input: {
    leaseKey: string;
    ownerId: string;
  }): Promise<boolean> {
    const result = await this.pool.query<{ lease_key: string }>(
      `DELETE FROM system_leases
       WHERE lease_key = $1 AND owner_id = $2
       RETURNING lease_key`,
      [input.leaseKey, input.ownerId],
    );
    return result.rows.length > 0;
  }

  async getEgressPolicy(): Promise<EgressPolicy> {
    const result = await this.pool.query(
      `SELECT allow_cloud, allowed_providers_json, redaction_mode
       FROM policy_egress
       WHERE id = 'default'`,
    );

    const row = result.rows[0];
    return {
      allowCloud: !!row.allow_cloud,
      allowedProviders: Array.isArray(row.allowed_providers_json)
        ? (row.allowed_providers_json as string[])
        : [],
      redactionMode: String(row.redaction_mode) as EgressPolicy['redactionMode'],
    };
  }

  async setEgressPolicy(policy: EgressPolicy): Promise<EgressPolicy> {
    await this.pool.query(
      `UPDATE policy_egress
          SET allow_cloud = $1,
              allowed_providers_json = $2::jsonb,
              redaction_mode = $3,
              updated_at_ms = $4
        WHERE id = 'default'`,
      [
        policy.allowCloud,
        JSON.stringify(policy.allowedProviders),
        policy.redactionMode,
        Date.now(),
      ],
    );

    return this.getEgressPolicy();
  }

  async listEgressAudit(limit: number): Promise<EgressAuditEntry[]> {
    const result = await this.pool.query(
      `SELECT id, event_type, provider, payload_json, created_at_ms
       FROM policy_egress_audit
       ORDER BY created_at_ms DESC
       LIMIT $1`,
      [limit],
    );

    return result.rows.map(row => ({
      id: String(row.id),
      eventType: String(row.event_type),
      provider: row.provider ? String(row.provider) : undefined,
      payload: row.payload_json ? asRecord(row.payload_json) : undefined,
      createdAtMs: Number(row.created_at_ms),
    }));
  }

  async recordEgressAudit(entry: EgressAuditEntry): Promise<EgressAuditEntry> {
    await this.pool.query(
      `INSERT INTO policy_egress_audit
         (id, event_type, provider, payload_json, created_at_ms)
       VALUES ($1, $2, $3, $4::jsonb, $5)`,
      [
        entry.id,
        entry.eventType,
        entry.provider ?? null,
        JSON.stringify(entry.payload ?? null),
        entry.createdAtMs,
      ],
    );

    return entry;
  }

  async createCorrection(correction: Correction): Promise<Correction> {
    await this.pool.query(
      `INSERT INTO intelligence_corrections
         (id, input_json, correct_output_json, created_at_ms)
       VALUES ($1, $2::jsonb, $3::jsonb, $4)`,
      [
        correction.id,
        JSON.stringify(correction.input),
        JSON.stringify(correction.correctOutput),
        correction.createdAtMs,
      ],
    );
    return correction;
  }

  async listCorrections(limit: number): Promise<Correction[]> {
    const result = await this.pool.query(
      `SELECT id, input_json, correct_output_json, created_at_ms
       FROM intelligence_corrections
       ORDER BY created_at_ms DESC
       LIMIT $1`,
      [limit],
    );

    return result.rows.map(row => ({
      id: String(row.id),
      input: asRecord(row.input_json),
      correctOutput: asRecord(row.correct_output_json),
      createdAtMs: Number(row.created_at_ms),
    }));
  }

  async appendLedgerEvent(event: LedgerEvent): Promise<LedgerEvent> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const versionResult = await client.query<{ version: number }>(
        `INSERT INTO ledger_stream_versions (workspace_id, aggregate_id, version)
         VALUES ($1, $2, 1)
         ON CONFLICT (workspace_id, aggregate_id)
         DO UPDATE SET version = ledger_stream_versions.version + 1
         RETURNING version`,
        [event.workspaceId, event.aggregateId],
      );

      const version = Number(versionResult.rows[0]?.version || 1);

      await client.query(
        `INSERT INTO ledger_events
           (event_id, workspace_id, aggregate_id, aggregate_type, event_type, payload_json,
            actor_id, occurred_at_ms, version)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)`,
        [
          event.eventId,
          event.workspaceId,
          event.aggregateId,
          event.aggregateType,
          event.type,
          JSON.stringify(event.payload),
          event.actorId,
          event.occurredAtMs,
          version,
        ],
      );

      await client.query('COMMIT');

      return {
        ...event,
        version,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async streamLedgerEvents(input: {
    workspaceId: string;
    cursor?: string;
    limit: number;
  }): Promise<{ events: LedgerEvent[]; nextCursor?: string }> {
    const cursor = decodeLedgerCursor(input.cursor);
    const params: unknown[] = [input.workspaceId];

    let cursorPredicate = '';
    if (cursor) {
      const occurredAtParam = params.push(cursor.occurredAtMs);
      const streamPositionParam = params.push(cursor.streamPosition);
      cursorPredicate =
        ` AND (occurred_at_ms < $${occurredAtParam} ` +
        `OR (occurred_at_ms = $${occurredAtParam} AND stream_position < $${streamPositionParam}))`;
    }

    const limitParam = params.push(input.limit + 1);
    const result = await this.pool.query(
      `SELECT event_id, workspace_id, aggregate_id, aggregate_type, event_type, payload_json,
              actor_id, occurred_at_ms, version, stream_position
       FROM ledger_events
       WHERE workspace_id = $1
       ${cursorPredicate}
       ORDER BY occurred_at_ms DESC, stream_position DESC
       LIMIT $${limitParam}`,
      params,
    );

    const mapped = result.rows.map(row => ({
      event: {
        eventId: String(row.event_id),
        workspaceId: String(row.workspace_id),
        aggregateId: String(row.aggregate_id),
        aggregateType: String(row.aggregate_type),
        type: String(row.event_type),
        payload: asRecord(row.payload_json),
        actorId: String(row.actor_id),
        occurredAtMs: Number(row.occurred_at_ms),
        version: Number(row.version),
      },
      streamPosition: Number(row.stream_position),
    }));

    const hasMore = mapped.length > input.limit;
    const items = hasMore ? mapped.slice(0, input.limit) : mapped;
    const last = items[items.length - 1];
    const nextCursor =
      hasMore && last
        ? encodeLedgerCursor({
            occurredAtMs: last.event.occurredAtMs,
            streamPosition: last.streamPosition,
          })
        : undefined;

    return {
      events: items.map(item => item.event),
      nextCursor,
    };
  }
}

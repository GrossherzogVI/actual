import { Pool } from 'pg';

import type {
  CloseRun,
  Correction,
  DelegateLane,
  EgressAuditEntry,
  EgressPolicy,
  LedgerEvent,
  OpsState,
  PlaybookRun,
  ScenarioBranch,
  ScenarioMutation,
  WorkflowCommandExecution,
  WorkflowPlaybook,
} from '../types';

import {
  decodeLedgerCursor,
  encodeLedgerCursor,
} from './ledger-cursor';
import { POSTGRES_MIGRATIONS } from './postgres-migrations';
import type { GatewayRepository } from './types';

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
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
         (id, title, status, assignee, assigned_by, payload_json, created_at_ms, updated_at_ms)
       VALUES (
         'default-lane-mobile',
         'Re-negotiate mobile contract',
         'assigned',
         'assistant',
         'owner',
         '{\"contractId\":\"mobile-1\",\"deadline\":\"2026-03-05\"}'::jsonb,
         $1,
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
         (id, playbook_id, dry_run, executed_steps, steps_json, created_at_ms)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
      [
        run.id,
        run.playbookId,
        run.dryRun,
        run.executedSteps,
        JSON.stringify(run.steps),
        run.createdAtMs,
      ],
    );
    return run;
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

  async createWorkflowCommandRun(
    run: WorkflowCommandExecution,
  ): Promise<WorkflowCommandExecution> {
    await this.pool.query(
      `INSERT INTO workflow_command_runs
         (id, chain, steps_json, error_count, executed_at_ms)
       VALUES ($1, $2, $3::jsonb, $4, $5)`,
      [
        run.id,
        run.chain,
        JSON.stringify(run.steps),
        run.errorCount,
        run.executedAtMs,
      ],
    );

    return run;
  }

  async listWorkflowCommandRuns(limit: number): Promise<WorkflowCommandExecution[]> {
    const result = await this.pool.query(
      `SELECT id, chain, steps_json, error_count, executed_at_ms
       FROM workflow_command_runs
       ORDER BY executed_at_ms DESC
       LIMIT $1`,
      [limit],
    );

    return result.rows.map(row => ({
      id: String(row.id),
      chain: String(row.chain),
      steps: Array.isArray(row.steps_json)
        ? (row.steps_json as WorkflowCommandExecution['steps'])
        : [],
      errorCount: Number(row.error_count),
      executedAtMs: Number(row.executed_at_ms),
    }));
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

  async listDelegateLanes(): Promise<DelegateLane[]> {
    const result = await this.pool.query(
      `SELECT id, title, status, assignee, assigned_by, payload_json, created_at_ms, updated_at_ms,
              accepted_at_ms, completed_at_ms, rejected_at_ms
       FROM delegate_lanes
       ORDER BY updated_at_ms DESC`,
    );

    return result.rows.map(row => ({
      id: String(row.id),
      title: String(row.title),
      status: String(row.status) as DelegateLane['status'],
      assignee: String(row.assignee),
      assignedBy: String(row.assigned_by),
      payload: asRecord(row.payload_json),
      createdAtMs: Number(row.created_at_ms),
      updatedAtMs: Number(row.updated_at_ms),
      acceptedAtMs: row.accepted_at_ms ? Number(row.accepted_at_ms) : undefined,
      completedAtMs: row.completed_at_ms ? Number(row.completed_at_ms) : undefined,
      rejectedAtMs: row.rejected_at_ms ? Number(row.rejected_at_ms) : undefined,
    }));
  }

  async getDelegateLaneById(laneId: string): Promise<DelegateLane | null> {
    const result = await this.pool.query(
      `SELECT id, title, status, assignee, assigned_by, payload_json, created_at_ms, updated_at_ms,
              accepted_at_ms, completed_at_ms, rejected_at_ms
       FROM delegate_lanes
       WHERE id = $1`,
      [laneId],
    );

    const row = result.rows[0];
    if (!row) return null;

    return {
      id: String(row.id),
      title: String(row.title),
      status: String(row.status) as DelegateLane['status'],
      assignee: String(row.assignee),
      assignedBy: String(row.assigned_by),
      payload: asRecord(row.payload_json),
      createdAtMs: Number(row.created_at_ms),
      updatedAtMs: Number(row.updated_at_ms),
      acceptedAtMs: row.accepted_at_ms ? Number(row.accepted_at_ms) : undefined,
      completedAtMs: row.completed_at_ms ? Number(row.completed_at_ms) : undefined,
      rejectedAtMs: row.rejected_at_ms ? Number(row.rejected_at_ms) : undefined,
    };
  }

  async createDelegateLane(lane: DelegateLane): Promise<DelegateLane> {
    await this.pool.query(
      `INSERT INTO delegate_lanes
         (id, title, status, assignee, assigned_by, payload_json, created_at_ms, updated_at_ms,
          accepted_at_ms, completed_at_ms, rejected_at_ms)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11)`,
      [
        lane.id,
        lane.title,
        lane.status,
        lane.assignee,
        lane.assignedBy,
        JSON.stringify(lane.payload),
        lane.createdAtMs,
        lane.updatedAtMs,
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
              status = $3,
              assignee = $4,
              assigned_by = $5,
              payload_json = $6::jsonb,
              updated_at_ms = $7,
              accepted_at_ms = $8,
              completed_at_ms = $9,
              rejected_at_ms = $10
        WHERE id = $1`,
      [
        lane.id,
        lane.title,
        lane.status,
        lane.assignee,
        lane.assignedBy,
        JSON.stringify(lane.payload),
        lane.updatedAtMs,
        lane.acceptedAtMs ?? null,
        lane.completedAtMs ?? null,
        lane.rejectedAtMs ?? null,
      ],
    );
    return lane;
  }

  async recordActionOutcome(input: {
    id: string;
    actionId: string;
    outcome: string;
    notes?: string;
    recordedAtMs: number;
  }): Promise<Record<string, unknown>> {
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

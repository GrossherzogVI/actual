export const POSTGRES_MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS ops_state (
      id TEXT PRIMARY KEY,
      pending_reviews INTEGER NOT NULL DEFAULT 0,
      urgent_reviews INTEGER NOT NULL DEFAULT 0,
      expiring_contracts INTEGER NOT NULL DEFAULT 0,
      updated_at_ms BIGINT NOT NULL
    );`,
  `CREATE TABLE IF NOT EXISTS workflow_playbooks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      commands_json JSONB NOT NULL,
      created_at_ms BIGINT NOT NULL,
      updated_at_ms BIGINT NOT NULL
    );`,
  `CREATE TABLE IF NOT EXISTS workflow_playbook_runs (
      id TEXT PRIMARY KEY,
      playbook_id TEXT NOT NULL REFERENCES workflow_playbooks(id),
      dry_run BOOLEAN NOT NULL,
      executed_steps INTEGER NOT NULL,
      steps_json JSONB NOT NULL,
      created_at_ms BIGINT NOT NULL
    );`,
  `CREATE TABLE IF NOT EXISTS workflow_close_runs (
      id TEXT PRIMARY KEY,
      period TEXT NOT NULL,
      exception_count INTEGER NOT NULL,
      summary_json JSONB NOT NULL,
      created_at_ms BIGINT NOT NULL
    );`,
  `CREATE TABLE IF NOT EXISTS workflow_command_runs (
      id TEXT PRIMARY KEY,
      chain TEXT NOT NULL,
      steps_json JSONB NOT NULL,
      error_count INTEGER NOT NULL,
      actor_id TEXT NOT NULL DEFAULT 'owner',
      source_surface TEXT NOT NULL DEFAULT 'unknown',
      dry_run BOOLEAN NOT NULL DEFAULT false,
      executed_at_ms BIGINT NOT NULL
    );`,
  `ALTER TABLE workflow_command_runs ADD COLUMN IF NOT EXISTS actor_id TEXT NOT NULL DEFAULT 'owner';`,
  `ALTER TABLE workflow_command_runs ADD COLUMN IF NOT EXISTS source_surface TEXT NOT NULL DEFAULT 'unknown';`,
  `ALTER TABLE workflow_command_runs ADD COLUMN IF NOT EXISTS dry_run BOOLEAN NOT NULL DEFAULT false;`,
  `CREATE INDEX IF NOT EXISTS idx_workflow_command_runs_executed
    ON workflow_command_runs(executed_at_ms DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_workflow_command_runs_actor
    ON workflow_command_runs(actor_id, executed_at_ms DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_workflow_command_runs_surface
    ON workflow_command_runs(source_surface, executed_at_ms DESC);`,
  `CREATE TABLE IF NOT EXISTS scenario_branches (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      base_branch_id TEXT,
      notes TEXT,
      created_at_ms BIGINT NOT NULL,
      updated_at_ms BIGINT NOT NULL,
      adopted_at_ms BIGINT
    );`,
  `CREATE TABLE IF NOT EXISTS scenario_mutations (
      id TEXT PRIMARY KEY,
      branch_id TEXT NOT NULL REFERENCES scenario_branches(id),
      kind TEXT NOT NULL,
      payload_json JSONB NOT NULL,
      created_at_ms BIGINT NOT NULL
    );`,
  `CREATE INDEX IF NOT EXISTS idx_scenario_mutations_branch ON scenario_mutations(branch_id, created_at_ms);`,
  `CREATE TABLE IF NOT EXISTS delegate_lanes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'normal',
      status TEXT NOT NULL,
      assignee TEXT NOT NULL,
      assigned_by TEXT NOT NULL,
      payload_json JSONB NOT NULL,
      created_at_ms BIGINT NOT NULL,
      updated_at_ms BIGINT NOT NULL,
      due_at_ms BIGINT,
      accepted_at_ms BIGINT,
      completed_at_ms BIGINT,
      rejected_at_ms BIGINT
    );`,
  `ALTER TABLE delegate_lanes ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal';`,
  `ALTER TABLE delegate_lanes ADD COLUMN IF NOT EXISTS due_at_ms BIGINT;`,
  `CREATE INDEX IF NOT EXISTS idx_delegate_lanes_status ON delegate_lanes(status, updated_at_ms DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_delegate_lanes_assignee ON delegate_lanes(assignee, updated_at_ms DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_delegate_lanes_priority ON delegate_lanes(priority, updated_at_ms DESC);`,
  `CREATE TABLE IF NOT EXISTS delegate_lane_events (
      id TEXT PRIMARY KEY,
      lane_id TEXT NOT NULL REFERENCES delegate_lanes(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      message TEXT,
      payload_json JSONB,
      created_at_ms BIGINT NOT NULL
    );`,
  `CREATE INDEX IF NOT EXISTS idx_delegate_lane_events_lane ON delegate_lane_events(lane_id, created_at_ms DESC);`,
  `CREATE TABLE IF NOT EXISTS action_outcomes (
      id TEXT PRIMARY KEY,
      action_id TEXT NOT NULL,
      outcome TEXT NOT NULL,
      notes TEXT,
      recorded_at_ms BIGINT NOT NULL
    );`,
  `CREATE TABLE IF NOT EXISTS policy_egress (
      id TEXT PRIMARY KEY,
      allow_cloud BOOLEAN NOT NULL,
      allowed_providers_json JSONB NOT NULL,
      redaction_mode TEXT NOT NULL,
      updated_at_ms BIGINT NOT NULL
    );`,
  `CREATE TABLE IF NOT EXISTS policy_egress_audit (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      provider TEXT,
      payload_json JSONB,
      created_at_ms BIGINT NOT NULL
    );`,
  `CREATE INDEX IF NOT EXISTS idx_policy_egress_audit_created ON policy_egress_audit(created_at_ms DESC);`,
  `CREATE TABLE IF NOT EXISTS intelligence_corrections (
      id TEXT PRIMARY KEY,
      input_json JSONB NOT NULL,
      correct_output_json JSONB NOT NULL,
      created_at_ms BIGINT NOT NULL
    );`,
  `CREATE TABLE IF NOT EXISTS ledger_events (
      event_id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      aggregate_id TEXT NOT NULL,
      aggregate_type TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload_json JSONB NOT NULL,
      actor_id TEXT NOT NULL,
      occurred_at_ms BIGINT NOT NULL,
      stream_position BIGSERIAL UNIQUE,
      version INTEGER NOT NULL
    );`,
  `ALTER TABLE ledger_events ADD COLUMN IF NOT EXISTS stream_position BIGSERIAL;`,
  `CREATE TABLE IF NOT EXISTS ledger_stream_versions (
      workspace_id TEXT NOT NULL,
      aggregate_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      PRIMARY KEY (workspace_id, aggregate_id)
    );`,
  `CREATE INDEX IF NOT EXISTS idx_ledger_events_workspace_time ON ledger_events(workspace_id, occurred_at_ms DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_ledger_events_workspace_time_position
    ON ledger_events(workspace_id, occurred_at_ms DESC, stream_position DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_ledger_events_workspace_aggregate_version
    ON ledger_events(workspace_id, aggregate_id, version DESC);`,
];

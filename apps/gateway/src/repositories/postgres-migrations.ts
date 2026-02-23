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
      chain TEXT NOT NULL DEFAULT '',
      dry_run BOOLEAN NOT NULL,
      execution_mode TEXT NOT NULL DEFAULT 'dry-run',
      guardrail_profile TEXT NOT NULL DEFAULT 'strict',
      status TEXT NOT NULL DEFAULT 'completed',
      executed_steps INTEGER NOT NULL,
      error_count INTEGER NOT NULL DEFAULT 0,
      actor_id TEXT NOT NULL DEFAULT 'owner',
      source_surface TEXT NOT NULL DEFAULT 'unknown',
      started_at_ms BIGINT NOT NULL DEFAULT 0,
      finished_at_ms BIGINT,
      rollback_window_until_ms BIGINT,
      rollback_eligible BOOLEAN NOT NULL DEFAULT false,
      rollback_of_run_id TEXT,
      status_timeline_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      idempotency_key TEXT,
      rollback_on_failure BOOLEAN NOT NULL DEFAULT false,
      guardrail_results_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      effect_summaries_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      steps_json JSONB NOT NULL,
      created_at_ms BIGINT NOT NULL
    );`,
  `ALTER TABLE workflow_playbook_runs ADD COLUMN IF NOT EXISTS chain TEXT NOT NULL DEFAULT '';`,
  `ALTER TABLE workflow_playbook_runs ADD COLUMN IF NOT EXISTS execution_mode TEXT NOT NULL DEFAULT 'dry-run';`,
  `ALTER TABLE workflow_playbook_runs ADD COLUMN IF NOT EXISTS guardrail_profile TEXT NOT NULL DEFAULT 'strict';`,
  `ALTER TABLE workflow_playbook_runs ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'completed';`,
  `ALTER TABLE workflow_playbook_runs ADD COLUMN IF NOT EXISTS error_count INTEGER NOT NULL DEFAULT 0;`,
  `ALTER TABLE workflow_playbook_runs ADD COLUMN IF NOT EXISTS actor_id TEXT NOT NULL DEFAULT 'owner';`,
  `ALTER TABLE workflow_playbook_runs ADD COLUMN IF NOT EXISTS source_surface TEXT NOT NULL DEFAULT 'unknown';`,
  `ALTER TABLE workflow_playbook_runs ADD COLUMN IF NOT EXISTS started_at_ms BIGINT NOT NULL DEFAULT 0;`,
  `ALTER TABLE workflow_playbook_runs ADD COLUMN IF NOT EXISTS finished_at_ms BIGINT;`,
  `ALTER TABLE workflow_playbook_runs ADD COLUMN IF NOT EXISTS rollback_window_until_ms BIGINT;`,
  `ALTER TABLE workflow_playbook_runs ADD COLUMN IF NOT EXISTS rollback_eligible BOOLEAN NOT NULL DEFAULT false;`,
  `ALTER TABLE workflow_playbook_runs ADD COLUMN IF NOT EXISTS rollback_of_run_id TEXT;`,
  `ALTER TABLE workflow_playbook_runs ADD COLUMN IF NOT EXISTS status_timeline_json JSONB NOT NULL DEFAULT '[]'::jsonb;`,
  `ALTER TABLE workflow_playbook_runs ADD COLUMN IF NOT EXISTS idempotency_key TEXT;`,
  `ALTER TABLE workflow_playbook_runs ADD COLUMN IF NOT EXISTS rollback_on_failure BOOLEAN NOT NULL DEFAULT false;`,
  `ALTER TABLE workflow_playbook_runs ALTER COLUMN rollback_on_failure SET DEFAULT false;`,
  `ALTER TABLE workflow_playbook_runs ADD COLUMN IF NOT EXISTS guardrail_results_json JSONB NOT NULL DEFAULT '[]'::jsonb;`,
  `ALTER TABLE workflow_playbook_runs ADD COLUMN IF NOT EXISTS effect_summaries_json JSONB NOT NULL DEFAULT '[]'::jsonb;`,
  `CREATE INDEX IF NOT EXISTS idx_workflow_playbook_runs_created
    ON workflow_playbook_runs(created_at_ms DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_workflow_playbook_runs_playbook
    ON workflow_playbook_runs(playbook_id, created_at_ms DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_workflow_playbook_runs_status_created
    ON workflow_playbook_runs(status, created_at_ms DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_workflow_playbook_runs_idempotency
    ON workflow_playbook_runs(idempotency_key, created_at_ms DESC);`,
  `CREATE TABLE IF NOT EXISTS workflow_close_runs (
      id TEXT PRIMARY KEY,
      period TEXT NOT NULL,
      exception_count INTEGER NOT NULL,
      summary_json JSONB NOT NULL,
      created_at_ms BIGINT NOT NULL
    );`,
  `CREATE INDEX IF NOT EXISTS idx_workflow_close_runs_created
    ON workflow_close_runs(created_at_ms DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_workflow_close_runs_period
    ON workflow_close_runs(period, created_at_ms DESC);`,
  `CREATE TABLE IF NOT EXISTS workflow_command_runs (
      id TEXT PRIMARY KEY,
      chain TEXT NOT NULL,
      steps_json JSONB NOT NULL,
      error_count INTEGER NOT NULL,
      actor_id TEXT NOT NULL DEFAULT 'owner',
      source_surface TEXT NOT NULL DEFAULT 'unknown',
      dry_run BOOLEAN NOT NULL DEFAULT false,
      execution_mode TEXT NOT NULL DEFAULT 'live',
      guardrail_profile TEXT NOT NULL DEFAULT 'strict',
      status TEXT NOT NULL DEFAULT 'completed',
      started_at_ms BIGINT NOT NULL DEFAULT 0,
      finished_at_ms BIGINT,
      rollback_window_until_ms BIGINT,
      rollback_eligible BOOLEAN NOT NULL DEFAULT false,
      rollback_of_run_id TEXT,
      status_timeline_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      idempotency_key TEXT,
      rollback_on_failure BOOLEAN NOT NULL DEFAULT false,
      guardrail_results_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      effect_summaries_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      executed_at_ms BIGINT NOT NULL
    );`,
  `ALTER TABLE workflow_command_runs ADD COLUMN IF NOT EXISTS actor_id TEXT NOT NULL DEFAULT 'owner';`,
  `ALTER TABLE workflow_command_runs ADD COLUMN IF NOT EXISTS source_surface TEXT NOT NULL DEFAULT 'unknown';`,
  `ALTER TABLE workflow_command_runs ADD COLUMN IF NOT EXISTS dry_run BOOLEAN NOT NULL DEFAULT false;`,
  `ALTER TABLE workflow_command_runs ADD COLUMN IF NOT EXISTS execution_mode TEXT NOT NULL DEFAULT 'live';`,
  `ALTER TABLE workflow_command_runs ADD COLUMN IF NOT EXISTS guardrail_profile TEXT NOT NULL DEFAULT 'strict';`,
  `ALTER TABLE workflow_command_runs ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'completed';`,
  `ALTER TABLE workflow_command_runs ADD COLUMN IF NOT EXISTS started_at_ms BIGINT NOT NULL DEFAULT 0;`,
  `ALTER TABLE workflow_command_runs ADD COLUMN IF NOT EXISTS finished_at_ms BIGINT;`,
  `ALTER TABLE workflow_command_runs ADD COLUMN IF NOT EXISTS rollback_window_until_ms BIGINT;`,
  `ALTER TABLE workflow_command_runs ADD COLUMN IF NOT EXISTS rollback_eligible BOOLEAN NOT NULL DEFAULT false;`,
  `ALTER TABLE workflow_command_runs ADD COLUMN IF NOT EXISTS rollback_of_run_id TEXT;`,
  `ALTER TABLE workflow_command_runs ADD COLUMN IF NOT EXISTS status_timeline_json JSONB NOT NULL DEFAULT '[]'::jsonb;`,
  `ALTER TABLE workflow_command_runs ADD COLUMN IF NOT EXISTS idempotency_key TEXT;`,
  `ALTER TABLE workflow_command_runs ADD COLUMN IF NOT EXISTS rollback_on_failure BOOLEAN NOT NULL DEFAULT false;`,
  `ALTER TABLE workflow_command_runs ALTER COLUMN rollback_on_failure SET DEFAULT false;`,
  `ALTER TABLE workflow_command_runs ADD COLUMN IF NOT EXISTS guardrail_results_json JSONB NOT NULL DEFAULT '[]'::jsonb;`,
  `ALTER TABLE workflow_command_runs ADD COLUMN IF NOT EXISTS effect_summaries_json JSONB NOT NULL DEFAULT '[]'::jsonb;`,
  `CREATE INDEX IF NOT EXISTS idx_workflow_command_runs_executed
    ON workflow_command_runs(executed_at_ms DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_workflow_command_runs_actor
    ON workflow_command_runs(actor_id, executed_at_ms DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_workflow_command_runs_surface
    ON workflow_command_runs(source_surface, executed_at_ms DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_workflow_command_runs_status_executed
    ON workflow_command_runs(status, executed_at_ms DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_workflow_command_runs_idempotency
    ON workflow_command_runs(idempotency_key, executed_at_ms DESC);`,
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
  `CREATE INDEX IF NOT EXISTS idx_action_outcomes_action_time
    ON action_outcomes(action_id, recorded_at_ms DESC);`,
  `CREATE TABLE IF NOT EXISTS ops_activity_events (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      detail TEXT NOT NULL,
      route TEXT,
      severity TEXT NOT NULL,
      created_at_ms BIGINT NOT NULL,
      meta_json JSONB
    );`,
  `CREATE INDEX IF NOT EXISTS idx_ops_activity_created
    ON ops_activity_events(created_at_ms DESC, id DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_ops_activity_kind_created
    ON ops_activity_events(kind, created_at_ms DESC, id DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_ops_activity_severity_created
    ON ops_activity_events(severity, created_at_ms DESC, id DESC);`,
  `CREATE TABLE IF NOT EXISTS worker_job_attempts (
      id TEXT PRIMARY KEY,
      worker_id TEXT NOT NULL,
      job_id TEXT NOT NULL,
      job_name TEXT NOT NULL,
      job_fingerprint TEXT,
      receipt TEXT NOT NULL,
      attempt INTEGER NOT NULL,
      outcome TEXT NOT NULL,
      processing_ms INTEGER,
      error_message TEXT,
      payload_json JSONB,
      created_at_ms BIGINT NOT NULL
    );`,
  `ALTER TABLE worker_job_attempts ADD COLUMN IF NOT EXISTS job_fingerprint TEXT;`,
  `CREATE INDEX IF NOT EXISTS idx_worker_job_attempts_created
    ON worker_job_attempts(created_at_ms DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_worker_job_attempts_job
    ON worker_job_attempts(job_id, created_at_ms DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_worker_job_attempts_outcome
    ON worker_job_attempts(outcome, created_at_ms DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_worker_job_attempts_fingerprint_outcome
    ON worker_job_attempts(job_fingerprint, outcome, created_at_ms DESC);`,
  `CREATE TABLE IF NOT EXISTS worker_fingerprint_claim_events (
      id TEXT PRIMARY KEY,
      worker_id TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      lease_key TEXT NOT NULL,
      status TEXT NOT NULL,
      ttl_ms INTEGER NOT NULL,
      expires_at_ms BIGINT,
      stale_recovered BOOLEAN NOT NULL DEFAULT FALSE,
      created_at_ms BIGINT NOT NULL
    );`,
  `ALTER TABLE worker_fingerprint_claim_events ADD COLUMN IF NOT EXISTS stale_recovered BOOLEAN NOT NULL DEFAULT FALSE;`,
  `CREATE INDEX IF NOT EXISTS idx_worker_fingerprint_claim_events_created
    ON worker_fingerprint_claim_events(created_at_ms DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_worker_fingerprint_claim_events_status
    ON worker_fingerprint_claim_events(status, created_at_ms DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_worker_fingerprint_claim_events_fingerprint
    ON worker_fingerprint_claim_events(fingerprint, created_at_ms DESC);`,
  `CREATE TABLE IF NOT EXISTS worker_dead_letters (
      id TEXT PRIMARY KEY,
      attempt_id TEXT NOT NULL,
      worker_id TEXT NOT NULL,
      job_id TEXT NOT NULL,
      job_name TEXT NOT NULL,
      receipt TEXT NOT NULL,
      attempt INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      replay_count INTEGER NOT NULL DEFAULT 0,
      last_replayed_at_ms BIGINT,
      resolved_at_ms BIGINT,
      resolution_note TEXT,
      error_message TEXT,
      payload_json JSONB,
      created_at_ms BIGINT NOT NULL
    );`,
  `ALTER TABLE worker_dead_letters ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open';`,
  `ALTER TABLE worker_dead_letters ADD COLUMN IF NOT EXISTS replay_count INTEGER NOT NULL DEFAULT 0;`,
  `ALTER TABLE worker_dead_letters ADD COLUMN IF NOT EXISTS last_replayed_at_ms BIGINT;`,
  `ALTER TABLE worker_dead_letters ADD COLUMN IF NOT EXISTS resolved_at_ms BIGINT;`,
  `ALTER TABLE worker_dead_letters ADD COLUMN IF NOT EXISTS resolution_note TEXT;`,
  `CREATE INDEX IF NOT EXISTS idx_worker_dead_letters_created
    ON worker_dead_letters(created_at_ms DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_worker_dead_letters_job
    ON worker_dead_letters(job_id, created_at_ms DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_worker_dead_letters_status
    ON worker_dead_letters(status, created_at_ms DESC);`,
  `CREATE TABLE IF NOT EXISTS system_leases (
      lease_key TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      expires_at_ms BIGINT NOT NULL,
      updated_at_ms BIGINT NOT NULL
    );`,
  `CREATE INDEX IF NOT EXISTS idx_system_leases_expiration
    ON system_leases(expires_at_ms);`,
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

import { getAccountDb } from '../src/account-db.js';

export const up = async function () {
  const db = getAccountDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS ops_playbooks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      commands_json TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ops_playbook_runs (
      id TEXT PRIMARY KEY,
      playbook_id TEXT NOT NULL,
      dry_run INTEGER NOT NULL DEFAULT 1,
      result_json TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (playbook_id) REFERENCES ops_playbooks(id)
    );

    CREATE TABLE IF NOT EXISTS ops_close_runs (
      id TEXT PRIMARY KEY,
      period TEXT NOT NULL,
      summary_json TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ops_action_outcomes (
      id TEXT PRIMARY KEY,
      action_id TEXT NOT NULL,
      outcome TEXT NOT NULL,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS scenario_branches (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      base_date TEXT,
      notes TEXT,
      status TEXT DEFAULT 'draft',
      adopted_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS scenario_mutations (
      id TEXT PRIMARY KEY,
      branch_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (branch_id) REFERENCES scenario_branches(id)
    );

    CREATE TABLE IF NOT EXISTS delegate_lanes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'assigned',
      assignee TEXT,
      assigned_by TEXT,
      payload_json TEXT,
      accepted_at TEXT,
      completed_at TEXT,
      rejected_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS policy_egress (
      id TEXT PRIMARY KEY,
      allow_cloud INTEGER NOT NULL DEFAULT 0,
      allowed_providers_json TEXT NOT NULL DEFAULT '[]',
      redaction_mode TEXT NOT NULL DEFAULT 'strict',
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS policy_egress_audit (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      provider TEXT,
      payload_json TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS intelligence_corrections (
      id TEXT PRIMARY KEY,
      input_json TEXT NOT NULL,
      correct_output_json TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_ops_playbook_runs_playbook_id
      ON ops_playbook_runs(playbook_id);
    CREATE INDEX IF NOT EXISTS idx_scenario_mutations_branch_id
      ON scenario_mutations(branch_id);
    CREATE INDEX IF NOT EXISTS idx_delegate_lanes_status
      ON delegate_lanes(status);
    CREATE INDEX IF NOT EXISTS idx_policy_egress_audit_created_at
      ON policy_egress_audit(created_at DESC);
  `);

  const existingDefaultPolicy = db.first(
    'SELECT id FROM policy_egress WHERE id = ?',
    ['default'],
  );

  if (!existingDefaultPolicy) {
    db.mutate(
      `INSERT INTO policy_egress
        (id, allow_cloud, allowed_providers_json, redaction_mode)
       VALUES ('default', 0, '[]', 'strict')`,
      [],
    );
  }
};

export const down = async function () {
  // These tables hold audit/workflow metadata and are safe to keep across rollbacks.
};

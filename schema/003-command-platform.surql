-- Finance OS Command Platform
-- Level-5 gateway: command runs, playbooks, delegate lanes, scenario branches

-- ─── Command Runs ───────────────────────────────────────────────────────────

DEFINE TABLE command_run SCHEMAFULL;
DEFINE FIELD chain ON command_run TYPE string;
DEFINE FIELD commands ON command_run TYPE array;
DEFINE FIELD status ON command_run TYPE string;
DEFINE FIELD execution_mode ON command_run TYPE string;
DEFINE FIELD actor_id ON command_run TYPE string;
DEFINE FIELD source_surface ON command_run TYPE string DEFAULT 'finance-os-web';
DEFINE FIELD created_at ON command_run TYPE datetime DEFAULT time::now();
DEFINE FIELD finished_at ON command_run TYPE option<datetime>;

-- ─── Playbooks ──────────────────────────────────────────────────────────────

DEFINE TABLE playbook SCHEMAFULL;
DEFINE FIELD name ON playbook TYPE string;
DEFINE FIELD description ON playbook TYPE string;
DEFINE FIELD commands ON playbook TYPE array;
DEFINE FIELD created_at ON playbook TYPE datetime DEFAULT time::now();
DEFINE FIELD updated_at ON playbook TYPE datetime DEFAULT time::now();

-- ─── Playbook Runs ──────────────────────────────────────────────────────────

DEFINE TABLE playbook_run SCHEMAFULL;
DEFINE FIELD playbook ON playbook_run TYPE record<playbook>;
DEFINE FIELD chain ON playbook_run TYPE string;
DEFINE FIELD status ON playbook_run TYPE string;
DEFINE FIELD execution_mode ON playbook_run TYPE string;
DEFINE FIELD guardrail_profile ON playbook_run TYPE string DEFAULT 'strict';
DEFINE FIELD steps ON playbook_run TYPE array;
DEFINE FIELD started_at ON playbook_run TYPE datetime DEFAULT time::now();
DEFINE FIELD finished_at ON playbook_run TYPE option<datetime>;
DEFINE FIELD actor_id ON playbook_run TYPE string;
DEFINE FIELD source_surface ON playbook_run TYPE string DEFAULT 'finance-os-web';

-- ─── Delegate Lanes ─────────────────────────────────────────────────────────

DEFINE TABLE delegate_lane SCHEMAFULL;
DEFINE FIELD title ON delegate_lane TYPE string;
DEFINE FIELD priority ON delegate_lane TYPE string DEFAULT 'normal';
DEFINE FIELD status ON delegate_lane TYPE string DEFAULT 'assigned';
DEFINE FIELD assignee ON delegate_lane TYPE string;
DEFINE FIELD assigned_by ON delegate_lane TYPE string;
DEFINE FIELD payload ON delegate_lane TYPE object;
DEFINE FIELD created_at ON delegate_lane TYPE datetime DEFAULT time::now();
DEFINE FIELD updated_at ON delegate_lane TYPE datetime DEFAULT time::now();
DEFINE FIELD due_at ON delegate_lane TYPE option<datetime>;
DEFINE FIELD accepted_at ON delegate_lane TYPE option<datetime>;
DEFINE FIELD completed_at ON delegate_lane TYPE option<datetime>;
DEFINE FIELD rejected_at ON delegate_lane TYPE option<datetime>;

-- ─── Delegate Lane Events ───────────────────────────────────────────────────

DEFINE TABLE delegate_lane_event SCHEMAFULL;
DEFINE FIELD lane ON delegate_lane_event TYPE record<delegate_lane>;
DEFINE FIELD type ON delegate_lane_event TYPE string;
DEFINE FIELD actor_id ON delegate_lane_event TYPE string;
DEFINE FIELD message ON delegate_lane_event TYPE option<string>;
DEFINE FIELD payload ON delegate_lane_event TYPE option<object>;
DEFINE FIELD created_at ON delegate_lane_event TYPE datetime DEFAULT time::now();

-- ─── Scenario Branches ──────────────────────────────────────────────────────

DEFINE TABLE scenario_branch SCHEMAFULL;
DEFINE FIELD name ON scenario_branch TYPE string;
DEFINE FIELD status ON scenario_branch TYPE string DEFAULT 'draft';
DEFINE FIELD base_branch ON scenario_branch TYPE option<record<scenario_branch>>;
DEFINE FIELD notes ON scenario_branch TYPE option<string>;
DEFINE FIELD created_at ON scenario_branch TYPE datetime DEFAULT time::now();
DEFINE FIELD updated_at ON scenario_branch TYPE datetime DEFAULT time::now();
DEFINE FIELD adopted_at ON scenario_branch TYPE option<datetime>;

-- ─── Scenario Mutations ─────────────────────────────────────────────────────

DEFINE TABLE scenario_mutation SCHEMAFULL;
DEFINE FIELD branch ON scenario_mutation TYPE record<scenario_branch>;
DEFINE FIELD kind ON scenario_mutation TYPE string;
DEFINE FIELD payload ON scenario_mutation TYPE object;
DEFINE FIELD created_at ON scenario_mutation TYPE datetime DEFAULT time::now();

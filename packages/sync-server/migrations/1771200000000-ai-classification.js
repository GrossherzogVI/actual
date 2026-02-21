import { getAccountDb } from '../src/account-db.js';

export const up = async function () {
  const db = getAccountDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS ai_classifications (
      id TEXT PRIMARY KEY,
      file_id TEXT NOT NULL,
      transaction_id TEXT NOT NULL,
      proposed_category TEXT NOT NULL,
      confidence REAL NOT NULL,
      reasoning TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected','auto_applied')),
      created_at TEXT DEFAULT (datetime('now')),
      resolved_at TEXT,
      UNIQUE(file_id, transaction_id)
    );

    CREATE INDEX IF NOT EXISTS idx_ai_classifications_file_id ON ai_classifications(file_id);
    CREATE INDEX IF NOT EXISTS idx_ai_classifications_status ON ai_classifications(status);

    CREATE TABLE IF NOT EXISTS ai_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_id TEXT NOT NULL,
      action TEXT NOT NULL CHECK(action IN ('classify','create_rule','auto_apply','batch_classify')),
      details TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_ai_audit_log_file_id ON ai_audit_log(file_id);

    CREATE TABLE IF NOT EXISTS ai_rule_suggestions (
      id TEXT PRIMARY KEY,
      file_id TEXT NOT NULL,
      payee_pattern TEXT NOT NULL,
      match_field TEXT NOT NULL DEFAULT 'payee' CHECK(match_field IN ('payee','imported_payee','notes')),
      match_op TEXT NOT NULL DEFAULT 'contains' CHECK(match_op IN ('is','contains')),
      category TEXT NOT NULL,
      hit_count INTEGER DEFAULT 1,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','accepted','dismissed')),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_ai_rule_suggestions_file_id ON ai_rule_suggestions(file_id);
    CREATE INDEX IF NOT EXISTS idx_ai_rule_suggestions_status ON ai_rule_suggestions(status);
  `);
};

export const down = async function () {
  const db = getAccountDb();

  db.exec(`
    DROP TABLE IF EXISTS ai_rule_suggestions;
    DROP TABLE IF EXISTS ai_audit_log;
    DROP TABLE IF EXISTS ai_classifications;
  `);
};

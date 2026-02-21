import { getAccountDb } from '../src/account-db.js';

export const up = async function () {
  const db = getAccountDb();

  // Drop old scaffold tables (Phase 0)
  db.exec(`
    DROP TABLE IF EXISTS contract_documents;
    DROP TABLE IF EXISTS invoices;
    DROP TABLE IF EXISTS expected_events;
    DROP TABLE IF EXISTS contracts;
    DROP TABLE IF EXISTS ai_rule_suggestions;
    DROP TABLE IF EXISTS ai_audit_log;
    DROP TABLE IF EXISTS ai_classifications;
  `);

  // 2.1 Enriched Contracts Table
  db.exec(`
    CREATE TABLE contracts (
      id TEXT PRIMARY KEY,

      -- Identity
      name TEXT NOT NULL,
      provider TEXT,
      type TEXT NOT NULL DEFAULT 'other'
        CHECK(type IN ('subscription','insurance','utility','loan','membership','rent','tax','other')),
      category_id TEXT,

      -- Payment link
      schedule_id TEXT,
      amount INTEGER,
      currency TEXT DEFAULT 'EUR',
      interval TEXT NOT NULL DEFAULT 'monthly'
        CHECK(interval IN ('weekly','monthly','quarterly','semi-annual','annual','custom')),
      custom_interval_days INTEGER,
      payment_account_id TEXT,

      -- Contract terms
      start_date TEXT,
      end_date TEXT,
      notice_period_months INTEGER DEFAULT 0,
      auto_renewal INTEGER DEFAULT 1,
      cancellation_deadline TEXT,

      -- Status & health
      status TEXT NOT NULL DEFAULT 'active'
        CHECK(status IN ('active','expiring','cancelled','paused','discovered')),

      -- Meta
      notes TEXT,
      iban TEXT,
      counterparty TEXT,

      -- Timestamps
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),

      -- Soft delete
      tombstone INTEGER DEFAULT 0
    );

    CREATE INDEX idx_contracts_schedule ON contracts(schedule_id);
    CREATE INDEX idx_contracts_status ON contracts(status);
    CREATE INDEX idx_contracts_category ON contracts(category_id);
    CREATE INDEX idx_contracts_type ON contracts(type);
    CREATE INDEX idx_contracts_cancellation ON contracts(cancellation_deadline);
  `);

  // 2.2 Contract Price History
  db.exec(`
    CREATE TABLE contract_price_history (
      id TEXT PRIMARY KEY,
      contract_id TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
      old_amount INTEGER NOT NULL,
      new_amount INTEGER NOT NULL,
      change_date TEXT NOT NULL,
      reason TEXT,
      detected_by TEXT DEFAULT 'manual',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX idx_price_history_contract ON contract_price_history(contract_id);
  `);

  // 2.3 Contract Additional Events
  db.exec(`
    CREATE TABLE contract_events (
      id TEXT PRIMARY KEY,
      contract_id TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      amount INTEGER NOT NULL,
      interval TEXT NOT NULL DEFAULT 'annual'
        CHECK(interval IN ('one_time','monthly','quarterly','semi-annual','annual')),
      month INTEGER,
      day INTEGER,
      next_date TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX idx_contract_events_contract ON contract_events(contract_id);
  `);

  // 2.4 Contract Tags
  db.exec(`
    CREATE TABLE contract_tags (
      contract_id TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
      tag TEXT NOT NULL,
      PRIMARY KEY (contract_id, tag)
    );
  `);

  // 2.5 Contract Documents
  db.exec(`
    CREATE TABLE contract_documents (
      id TEXT PRIMARY KEY,
      contract_id TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      mime_type TEXT,
      file_path TEXT NOT NULL,
      uploaded_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX idx_contract_docs_contract ON contract_documents(contract_id);
  `);

  // 2.6 AI Review Queue
  db.exec(`
    CREATE TABLE review_queue (
      id TEXT PRIMARY KEY,

      type TEXT NOT NULL
        CHECK(type IN (
          'uncategorized',
          'low_confidence',
          'recurring_detected',
          'amount_mismatch',
          'budget_suggestion',
          'parked_expense'
        )),
      priority TEXT NOT NULL DEFAULT 'review'
        CHECK(priority IN ('urgent','review','suggestion')),

      transaction_id TEXT,
      contract_id TEXT,
      schedule_id TEXT,

      ai_suggestion TEXT,
      ai_confidence REAL,

      status TEXT NOT NULL DEFAULT 'pending'
        CHECK(status IN ('pending','accepted','rejected','snoozed','dismissed')),
      snoozed_until TEXT,

      resolved_at TEXT,
      resolved_action TEXT,

      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX idx_review_queue_status ON review_queue(status);
    CREATE INDEX idx_review_queue_type ON review_queue(type);
    CREATE INDEX idx_review_queue_priority ON review_queue(priority);
    CREATE INDEX idx_review_queue_transaction ON review_queue(transaction_id);
  `);

  // 2.7 AI Smart Matching Rules
  db.exec(`
    CREATE TABLE smart_match_rules (
      id TEXT PRIMARY KEY,

      payee_pattern TEXT NOT NULL,
      match_type TEXT NOT NULL DEFAULT 'exact'
        CHECK(match_type IN ('exact','contains','regex','iban')),

      category_id TEXT NOT NULL,

      tier TEXT NOT NULL DEFAULT 'ai_low'
        CHECK(tier IN ('pinned','ai_high','ai_low')),
      confidence REAL DEFAULT 0.0,
      match_count INTEGER DEFAULT 0,
      correct_count INTEGER DEFAULT 0,
      last_matched_at TEXT,

      created_by TEXT DEFAULT 'user',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX idx_smart_match_payee ON smart_match_rules(payee_pattern);
    CREATE INDEX idx_smart_match_tier ON smart_match_rules(tier);
  `);

  // 2.8 Quick Add Frecency
  db.exec(`
    CREATE TABLE category_frecency (
      category_id TEXT PRIMARY KEY,
      use_count INTEGER DEFAULT 0,
      last_used_at TEXT,
      score REAL DEFAULT 0.0
    );

    CREATE TABLE quick_add_presets (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      icon TEXT,
      amount INTEGER,
      category_id TEXT,
      payee TEXT,
      account_id TEXT,
      sort_order INTEGER DEFAULT 0,
      is_auto INTEGER DEFAULT 0,
      use_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
};

export const down = async function () {
  const db = getAccountDb();

  db.exec(`
    DROP TABLE IF EXISTS quick_add_presets;
    DROP TABLE IF EXISTS category_frecency;
    DROP TABLE IF EXISTS smart_match_rules;
    DROP TABLE IF EXISTS review_queue;
    DROP TABLE IF EXISTS contract_documents;
    DROP TABLE IF EXISTS contract_tags;
    DROP TABLE IF EXISTS contract_events;
    DROP TABLE IF EXISTS contract_price_history;
    DROP TABLE IF EXISTS contracts;
  `);
};

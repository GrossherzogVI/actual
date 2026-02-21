import { getAccountDb } from '../src/account-db.js';

export const up = async function () {
  const db = getAccountDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS contracts (
      id TEXT PRIMARY KEY,
      file_id TEXT NOT NULL,
      name TEXT NOT NULL,
      provider TEXT,
      type TEXT CHECK(type IN ('insurance','rent','utility','subscription','tax','loan','other')),
      category_id TEXT,
      amount INTEGER,
      frequency TEXT DEFAULT 'monthly',
      start_date TEXT,
      end_date TEXT,
      cancellation_period_days INTEGER,
      cancellation_deadline TEXT,
      next_payment_date TEXT,
      schedule_id TEXT,
      status TEXT DEFAULT 'active' CHECK(status IN ('active','cancelled','pending_cancel','expired','discovered')),
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_contracts_file_id ON contracts(file_id);
    CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);
    CREATE INDEX IF NOT EXISTS idx_contracts_cancellation_deadline ON contracts(cancellation_deadline);

    CREATE TABLE IF NOT EXISTS contract_documents (
      id TEXT PRIMARY KEY,
      contract_id TEXT REFERENCES contracts(id) ON DELETE CASCADE,
      file_path TEXT NOT NULL,
      file_type TEXT,
      ocr_text TEXT,
      uploaded_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      contract_id TEXT REFERENCES contracts(id) ON DELETE SET NULL,
      file_id TEXT NOT NULL,
      amount INTEGER NOT NULL,
      due_date TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','matched','paid','overdue','cancelled')),
      transaction_id TEXT,
      document_id TEXT REFERENCES contract_documents(id) ON DELETE SET NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_invoices_file_id ON invoices(file_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date);
    CREATE INDEX IF NOT EXISTS idx_invoices_contract_id ON invoices(contract_id);

    CREATE TABLE IF NOT EXISTS expected_events (
      id TEXT PRIMARY KEY,
      file_id TEXT NOT NULL,
      source_type TEXT NOT NULL CHECK(source_type IN ('schedule','contract','invoice')),
      source_id TEXT NOT NULL,
      expected_date TEXT NOT NULL,
      expected_amount INTEGER,
      actual_transaction_id TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','matched','missed')),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_expected_events_file_id ON expected_events(file_id);
    CREATE INDEX IF NOT EXISTS idx_expected_events_expected_date ON expected_events(expected_date);
    CREATE INDEX IF NOT EXISTS idx_expected_events_source ON expected_events(source_type, source_id);
  `);
};

export const down = async function () {
  const db = getAccountDb();

  db.exec(`
    DROP TABLE IF EXISTS expected_events;
    DROP TABLE IF EXISTS invoices;
    DROP TABLE IF EXISTS contract_documents;
    DROP TABLE IF EXISTS contracts;
  `);
};

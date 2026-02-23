import { getAccountDb } from '../src/account-db.js';

export const up = async function () {
  const db = getAccountDb();

  // Helper: ADD COLUMN idempotently (SQLite has no IF NOT EXISTS for columns)
  function addColumnIfNotExists(sql) {
    try {
      db.exec(sql);
    } catch (e) {
      // SQLite error for an already-existing column; message is stable across versions
      const msg = e && typeof e.message === 'string' ? e.message.toLowerCase() : '';
      if (!msg.includes('duplicate column name')) {
        throw e;
      }
    }
  }

  // Add payment deadline columns to contracts table
  addColumnIfNotExists(`
    ALTER TABLE contracts ADD COLUMN payment_method TEXT DEFAULT 'manual_sepa'
      CHECK(payment_method IN ('lastschrift','dauerauftrag','manual_sepa','international','other'));
  `);

  addColumnIfNotExists(`
    ALTER TABLE contracts ADD COLUMN grace_period_days INTEGER DEFAULT 5;
  `);

  addColumnIfNotExists(`
    ALTER TABLE contracts ADD COLUMN soft_deadline_shift TEXT DEFAULT 'before'
      CHECK(soft_deadline_shift IN ('before','after'));
  `);

  addColumnIfNotExists(`
    ALTER TABLE contracts ADD COLUMN hard_deadline_shift TEXT DEFAULT 'after'
      CHECK(hard_deadline_shift IN ('before','after'));
  `);

  addColumnIfNotExists(`
    ALTER TABLE contracts ADD COLUMN lead_time_override INTEGER DEFAULT NULL;
  `);

  addColumnIfNotExists(`
    ALTER TABLE contracts ADD COLUMN show_hard_deadline INTEGER DEFAULT NULL;
  `);
};

export const down = async function () {
  // SQLite doesn't support DROP COLUMN before 3.35.0.
  // These columns are safe to leave in place on rollback.
};

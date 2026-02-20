import { getAccountDb } from '../src/account-db';

export const up = async function () {
  const db = getAccountDb();

  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS webhook_config (
        id TEXT PRIMARY KEY DEFAULT 'default',
        url TEXT NOT NULL DEFAULT '',
        secret TEXT NOT NULL DEFAULT '',
        enabled INTEGER NOT NULL DEFAULT 0,
        events TEXT NOT NULL DEFAULT 'sync,file-upload,file-delete',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS webhook_deliveries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        url TEXT NOT NULL,
        payload TEXT NOT NULL,
        status_code INTEGER,
        response_body TEXT,
        duration_ms INTEGER,
        success INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        attempt INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_created_at
        ON webhook_deliveries(created_at DESC);

      INSERT OR IGNORE INTO webhook_config (id) VALUES ('default');
    `);
  });
};

export const down = async function () {
  const db = getAccountDb();
  db.exec(`
    DROP TABLE IF EXISTS webhook_deliveries;
    DROP TABLE IF EXISTS webhook_config;
  `);
};

/**
 * Execute a callback within a SQLite transaction (BEGIN IMMEDIATE / COMMIT / ROLLBACK).
 * better-sqlite3 is synchronous, so this is straightforward.
 *
 * Accepts the wrapped DB object from getAccountDb() which exposes .exec().
 *
 * Usage:
 *   const result = withTransaction(db, () => {
 *     db.mutate('INSERT ...', [...]);
 *     db.mutate('UPDATE ...', [...]);
 *     return db.first('SELECT ...', [...]);
 *   });
 */
export function withTransaction<T>(
  db: { exec: (sql: string) => void },
  callback: () => T,
): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = callback();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

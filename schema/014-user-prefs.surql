-- 014: User Preferences (upgrade of 007-user-prefs.surql)
-- Stores user-specific settings currently scattered in localStorage.
-- Examples: holiday Bundesland, SEPA payer info (IBAN, BIC, name, address).
--
-- Changes vs. 007:
--   - IF NOT EXISTS guards make this idempotent / safe to re-run
--   - value field upgraded to FLEXIBLE TYPE any (was TYPE string)
--   - updated_at auto-refreshes on every write via VALUE time::now()

DEFINE TABLE IF NOT EXISTS user_pref SCHEMAFUL;

DEFINE FIELD IF NOT EXISTS key ON user_pref TYPE string
  ASSERT $value != NONE AND $value != '';
DEFINE FIELD IF NOT EXISTS value ON user_pref FLEXIBLE TYPE any;
DEFINE FIELD IF NOT EXISTS updated_at ON user_pref TYPE datetime
  DEFAULT time::now()
  VALUE time::now();

-- Unique constraint on key (no-op if already exists)
DEFINE INDEX IF NOT EXISTS idx_user_pref_key ON user_pref FIELDS key UNIQUE;

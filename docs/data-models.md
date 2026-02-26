# Finance OS — Data Models (SurrealDB)

**Generated:** 2026-02-26
**Database:** SurrealDB 3.0, namespace `finance`, database `main`
**Schema files:** `schema/000-auth.surql` through `schema/014-user-prefs.surql`

All tables are `SCHEMAFULL` — undefined fields are rejected at the DB level.

---

## Authentication

### `user`
SurrealDB record access via `DEFINE ACCESS account TYPE RECORD`. Token: 15m, Session: 12h.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `record<user>` | Auto-generated |
| `email` | `string` | Unique (indexed) |
| `pass` | `string` | Argon2 hash |
| `created_at` | `datetime` | Auto: `time::now()` |

**Auth pattern:** `SIGNUP` creates user + hashes password; `SIGNIN` validates with `crypto::argon2::compare`.

---

## Financial Core (`001-financial-core.surql`)

### `account`
| Field | Type | Default | Constraint |
|-------|------|---------|-----------|
| `name` | `string` | — | |
| `type` | `string` | — | `IN ['checking', 'savings', 'credit', 'cash', 'investment']` |
| `balance` | `decimal` | — | |
| `currency` | `string` | `'EUR'` | |
| `closed` | `bool` | `false` | |
| `sort_order` | `int` | `0` | |
| `created_at` | `datetime` | `time::now()` | |
| `updated_at` | `datetime` | `time::now()` | |

### `payee`
| Field | Type | Notes |
|-------|------|-------|
| `name` | `string` | Indexed (`idx_payee_name`) |
| `transfer_account` | `option<record<account>>` | For internal transfers |
| `created_at` | `datetime` | |

### `category`
2-level hierarchy: L1 groups contain L2 categories via `parent` self-reference.

| Field | Type | Notes |
|-------|------|-------|
| `name` | `string` | |
| `parent` | `option<record<category>>` | Indexed; null = L1 group |
| `color` | `option<string>` | Hex color |
| `icon` | `option<string>` | Lucide icon name |
| `sort_order` | `int` | |
| `is_income` | `bool` | Determines income vs expense grouping |
| `created_at` | `datetime` | |

**Note:** Pre-seeded with German category tree via `006-seed-german-categories.surql`.

### `transaction`
Core financial record. References `account`, `payee`, `category` as record links (resolved inline with `SELECT *, payee.name AS payee_name`).

| Field | Type | Notes |
|-------|------|-------|
| `date` | `datetime` | Indexed |
| `amount` | `decimal` | Negative = expense, positive = income |
| `account` | `record<account>` | Indexed; required |
| `payee` | `option<record<payee>>` | |
| `category` | `option<record<category>>` | Indexed |
| `notes` | `option<string>` | |
| `imported` | `bool` | Set true on CSV import |
| `cleared` | `bool` | Bank reconciliation |
| `reconciled` | `bool` | Manual reconciliation |
| `transfer_id` | `option<record<transaction>>` | Paired transfer leg |
| `ai_confidence` | `option<float>` | 0.0–1.0 from Ollama |
| `ai_classified` | `bool` | Was category auto-applied by AI? |
| `created_at` | `datetime` | |
| `updated_at` | `datetime` | |

**Indexes:** `idx_transaction_date`, `idx_transaction_account`, `idx_transaction_category`

### `schedule`
Recurring payment schedules used for calendar projection.

| Field | Type | Constraint |
|-------|------|-----------|
| `name` | `string` | |
| `amount` | `decimal` | |
| `account` | `record<account>` | |
| `category` | `option<record<category>>` | |
| `payee` | `option<record<payee>>` | |
| `frequency` | `string` | `IN ['monthly', 'weekly', 'yearly', 'custom']` |
| `next_date` | `datetime` | |
| `active` | `bool` | Default `true` |
| `created_at` | `datetime` | |

---

## Contracts (`002-contracts.surql`)

### `contract`
Subscription and recurring expense management. Two **computed fields** (no stored values — SurrealDB recomputes on every read).

| Field | Type | Computed? | Notes |
|-------|------|-----------|-------|
| `name` | `string` | | |
| `provider` | `string` | | |
| `category` | `option<record<category>>` | | |
| `type` | `string` | | `IN ['subscription','insurance','utility','loan','membership','other']` |
| `amount` | `decimal` | | Per-interval amount |
| `interval` | `string` | | `IN ['monthly','quarterly','semi-annual','annual','weekly','custom']` |
| `start_date` | `option<datetime>` | | |
| `end_date` | `option<datetime>` | | Used for health computation |
| `notice_period_months` | `option<int>` | | Kündigungsfrist |
| `auto_renewal` | `bool` | | Default `true` |
| `status` | `string` | | Default `'active'` |
| `annual_cost` | `decimal` | **YES** | Normalized annual cost: e.g., monthly × 12 |
| `health` | `string` | **YES** | `'green'`/`'yellow'`/`'red'`/`'grey'` based on `end_date` proximity |
| `created_at` | `datetime` | | |
| `updated_at` | `datetime` | | |

**Health logic:**
- `'grey'` if cancelled
- `'red'` if `end_date` within 30 days
- `'yellow'` if `end_date` within 60 days
- `'green'` otherwise

### `price_history`
Tracks price changes over time.

| Field | Type |
|-------|------|
| `contract` | `record<contract>` |
| `amount` | `decimal` |
| `effective_date` | `datetime` |
| `notes` | `option<string>` |

### `contract_event`
Audit log for contract lifecycle events.

| Field | Type |
|-------|------|
| `contract` | `record<contract>` |
| `type` | `string` |
| `detail` | `option<string>` |

---

## Intelligence (`004-intelligence.surql` + `010-intelligence.surql`)

### `review_item`
Items requiring human or AI review — created by worker classification jobs.

| Field | Type | Notes |
|-------|------|-------|
| `type` | `string` | e.g., `'uncategorized'`, `'low-confidence'`, `'contract-deadline'` |
| `transaction` | `option<record<transaction>>` | |
| `priority` | `string` | `'critical'`/`'high'`/`'medium'`/`'low'` |
| `ai_suggestion` | `option<object>` | `{suggested_category, confidence, raw_response, error}` |
| `status` | `string` | `'pending'`/`'accepted'`/`'dismissed'`/`'snoozed'` |
| `explanation` | `option<string>` | Filled by `explain-classification` job |
| `created_at` | `datetime` | |
| `resolved_at` | `option<datetime>` | |

**Query pattern:** Priority sorted via `CASE` expression (critical=0, high=1, medium=2, low=3).

### `anomaly`
Statistical outliers detected by the worker.

| Field | Type | Notes |
|-------|------|-------|
| `transaction` | `option<record<transaction>>` | |
| `type` | `string` | `'unusual_amount'`/`'new_payee'`/`'frequency_change'`/`'category_drift'` |
| `severity` | `string` | `'low'`/`'medium'`/`'high'` |
| `description` | `string` | German-language description |
| `explanation` | `option<string>` | |
| `resolved` | `bool` | |
| `created_at` | `datetime` | |

### `spending_pattern`
Recurring untracked payments identified by the worker.

| Field | Type | Notes |
|-------|------|-------|
| `type` | `string` | `'recurring_untracked'`/`'seasonal'`/`'increasing'`/`'decreasing'` |
| `description` | `string` | German text |
| `payee_name` | `option<string>` | |
| `amount` | `option<decimal>` | Average amount |
| `frequency` | `option<string>` | |
| `confidence` | `float` | 0.0–1.0 |
| `dismissed` | `bool` | |
| `created_at` | `datetime` | |

---

## Infrastructure (`003-command-platform.surql`)

### `job_queue`
Async communication channel between web frontend and worker. The worker polls this every `queuePollIntervalMs` (default: 1500ms) using an atomic `UPDATE...SET status='claimed'` pattern.

| Field | Type | Notes |
|-------|------|-------|
| `name` | `string` | Job type: `'classify-transaction'`, `'import-csv'`, etc. |
| `payload` | `object` | Job-specific data |
| `status` | `string` | `'pending'`/`'claimed'`/`'failed'` |
| `attempt` | `int` | Retry counter |
| `visible_at` | `datetime` | Enables exponential backoff (job invisible until this time) |
| `claimed_by` | `option<string>` | Worker ID |
| `claimed_at` | `option<datetime>` | |
| `error_message` | `option<string>` | Last error on failure |
| `created_at` | `datetime` | |

**Retry logic:** Max 6 attempts, exponential backoff: `min(60s, 1000ms × 2^attempt)`

---

## Other Tables

| Table | Schema File | Purpose |
|-------|------------|---------|
| `budget` | `008-budget.surql` | Envelope budgeting: per-category monthly amounts |
| `import_batch` | `009-import.surql` | Tracks CSV import sessions |
| `receipt` | `011-receipts.surql` | Uploaded receipts for OCR processing |
| `user_pref` | `007-user-prefs.surql` | Key-value user preferences (dashboard layout, etc.) |

### `budget`
| Field | Type | Notes |
|-------|------|-------|
| `category` | `record<category>` | |
| `month` | `string` | Format: `'2026-02'` |
| `amount` | `decimal` | Budgeted amount |
| `rollover` | `bool` | Carry unspent to next month |
| `created_at` | `datetime` | |
| `updated_at` | `datetime` | |

---

## Record Link Resolution Pattern

SurrealDB record links are resolved inline in queries — no JOINs needed:

```surql
-- Resolves payee.name and category.name in a single query
SELECT *, payee.name AS payee_name, category.name AS category_name
FROM transaction
WHERE account = $accountId
ORDER BY date DESC
LIMIT 50
```

This pattern is used throughout `finance-api.ts` to avoid N+1 fetches.

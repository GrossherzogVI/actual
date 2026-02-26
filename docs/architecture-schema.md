# Finance OS — Architecture: SurrealDB Schema

**Generated:** 2026-02-26
**Part:** `schema/`
**Pattern:** Schema-first, computed fields, database-level authentication

---

## Executive Summary

The SurrealDB schema defines the complete data contract for Finance OS. 15 `.surql` files are applied in order via `schema/apply.sh`. The schema uses `SCHEMAFULL` mode (rejects unknown fields), computed fields (`VALUE` expressions), and SurrealDB record links for efficient related-data traversal.

---

## Schema Files (Load Order)

| File | Tables Defined | Notes |
|------|---------------|-------|
| `000-auth.surql` | `user` | RECORD ACCESS with Argon2 auth, 15m token / 12h session |
| `001-financial-core.surql` | `account`, `payee`, `category`, `transaction`, `schedule` | Core financial tables |
| `002-contracts.surql` | `contract`, `price_history`, `contract_event` | Computed `annual_cost` + `health` |
| `003-command-platform.surql` | `job_queue`, `command_run`, `playbook`, `delegate_lane` | Worker communication channel |
| `004-intelligence.surql` | `review_item`, `classification`, `anomaly` | AI review tables (Phase 1) |
| `005-api-endpoints.surql` | — | DEFINE API endpoints (supplementary) |
| `006-seed-german-categories.surql` | — | Seeds German category tree (L1 + L2) |
| `007-user-prefs.surql` | `user_pref` | Key-value store for UI preferences |
| `008-budget.surql` | `budget` | Envelope budgeting records |
| `009-import.surql` | `import_batch` | CSV import session tracking |
| `010-intelligence.surql` | `spending_pattern` | Recurring pattern detection (Phase 2) |
| `011-receipts.surql` | `receipt` | OCR receipt storage |
| `012-tax.surql` | Tax-related tables | German tax form data |
| `013-sepa.surql` | `sepa_payment` | SEPA credit transfers |
| `014-user-prefs.surql` | Extension fields | Additional preference fields |

**Total: 15 tables** (excluding seeded data)

---

## Key SurrealDB Patterns Used

### Computed Fields (`VALUE`)
Fields computed at query time — never stored, always fresh:
```surql
DEFINE FIELD annual_cost ON contract VALUE
  IF interval = 'monthly' THEN amount * 12
  ELSE IF interval = 'quarterly' THEN amount * 4
  -- ...
  END;

DEFINE FIELD health ON contract VALUE
  IF status = 'cancelled' THEN 'grey'
  ELSE IF end_date - 30d < time::now() THEN 'red'
  -- ...
  END;
```

### Record Links
Strong typing with automatic traversal:
```surql
DEFINE FIELD account ON transaction TYPE record<account>;
DEFINE FIELD payee ON transaction TYPE option<record<payee>>;
DEFINE FIELD category ON transaction TYPE option<record<category>>;
```
Queried as: `SELECT *, payee.name AS payee_name FROM transaction`

### Schema Validation
```surql
DEFINE FIELD type ON account TYPE string
  ASSERT $value IN ['checking', 'savings', 'credit', 'cash', 'investment'];
```

### Unique Indexes
```surql
DEFINE INDEX idx_user_email ON user FIELDS email UNIQUE;
DEFINE INDEX idx_payee_name ON payee FIELDS name;
```

---

## Applying the Schema

```bash
cd schema && ./apply.sh
```

The script loads all `.surql` files into SurrealDB via `surreal import` or equivalent. It is **idempotent** — `DEFINE TABLE/FIELD IF NOT EXISTS` ensures safe re-runs after schema changes.

Connection defaults: `ws://localhost:8000`, `ns=finance`, `db=main`. Override via env vars.

---

## Adding a New Table

1. Create `schema/0NN-{name}.surql` (increment number)
2. Add corresponding TypeScript type in `apps/web/src/core/types/finance.ts`
3. Add API functions in `apps/web/src/core/api/finance-api.ts`
4. Re-run `schema/apply.sh`
5. Register in `schema/apply.sh` if it requires specific ordering

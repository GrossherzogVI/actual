# Finance OS — Integration Architecture

**Generated:** 2026-02-26
**Parts:** web ↔ schema ↔ worker

---

## Overview

All three Level-5 parts communicate through a single integration point: **SurrealDB 3.0**. There is no HTTP API between web and worker, no message broker, no shared in-process memory. SurrealDB acts as both the database and the async communication channel.

```
┌──────────────────┐         ┌─────────────────────────┐
│   apps/web       │         │     apps/worker          │
│  (React SPA)     │         │   (Node.js process)      │
│                  │         │                          │
│  finance-api.ts  │         │   main.ts                │
│  surreal-client  │         │   handlers/              │
└────────┬─────────┘         └────────────┬─────────────┘
         │                                │
         │    WebSocket (ws://...)         │    WebSocket (ws://...)
         │                                │
         └─────────────┬──────────────────┘
                       │
              ┌────────▼─────────┐
              │   SurrealDB 3.0  │
              │  ns: finance     │
              │  db: main        │
              │                  │
              │  15 tables       │
              │  14 schema files │
              └──────────────────┘
```

---

## Integration Points

### 1. Web → SurrealDB (Primary Data Access)

| Type | Protocol | Details |
|------|----------|---------|
| Read/Write | WebSocket (SurrealDB JS SDK 1.3.2) | All CRUD operations via SurrealQL |
| Real-time | WebSocket LIVE query | `subscribeToTransactions()` — `db.live()` |
| Auth | SurrealDB RECORD ACCESS | `SIGNUP`/`SIGNIN` with Argon2, 15m token |

**Connection:** `surreal-client.ts` — singleton, promise-based guard, auto-reconnect (exponential backoff 1s→30s), `versionCheck: false`

**SDK quirk:** SurrealDB JS SDK 1.x enters an infinite retry loop when it receives the `"surrealdb-3.0.0"` version string. Fixed by `versionCheck: false` in connect options.

### 2. Worker → SurrealDB (Background Processing)

| Type | Protocol | Details |
|------|----------|---------|
| Read/Write | WebSocket (SurrealDB JS SDK 1.3.2) | Raw `db.query()` calls |
| Auth | Root credentials | `db.signin({ username, password })` — root-level access |
| Poll | Polling (1.5s interval) | `job_queue` table |

**Worker uses root credentials** (SURREALDB_USER/SURREALDB_PASS), not RECORD ACCESS. This gives it write access to all tables without user context.

### 3. Web → Worker (Async via `job_queue`)

The web frontend doesn't call the worker directly. It writes a record to `job_queue`; the worker polls and processes it:

```
Web frontend                    job_queue table              Worker
     │                               │                          │
     │  CREATE job_queue SET         │                          │
     │  name='classify-transaction'  │                          │
     │  payload={transaction_id}     │                          │
     │  status='pending'             │                          │
     │─────────────────────────────►│                          │
     │                               │  poll every 1.5s        │
     │                               │◄─────────────────────── │
     │                               │  UPDATE SET             │
     │                               │  status='claimed'       │
     │                               │──────────────────────►  │
     │                               │                          │ process job
     │                               │  DELETE $id              │
     │                               │◄────────────────────────│
```

**Current async job triggers from web:**
| API Function | Job Enqueued |
|-------------|-------------|
| `requestExplanation(reviewItemId)` | `explain-classification` |
| (Import flow) | `import-csv` |
| (OCR upload) | `ocr-receipt` |

### 4. Worker → Web (Result via Shared Tables)

Worker writes results to shared tables; web reads them via normal queries:

| Worker writes to | Web reads via |
|-----------------|---------------|
| `review_item` (classification results) | `listReviewItems()` |
| `anomaly` (detected outliers) | `listAnomalies()` |
| `spending_pattern` (recurring patterns) | `listSpendingPatterns()` |
| `review_item.explanation` (AI explain) | `listReviewItems()` |
| `transaction.category` (auto-classify) | `listTransactions()` |

**Consistency model:** Eventually consistent — web frontend uses TanStack Query with stale-while-revalidate. Live subscriptions (`db.live()`) can provide real-time updates where needed.

---

## Data Flow Examples

### Transaction Classification Flow
```
1. User imports CSV via ImportPage
2. Web calls bulkCreateTransactions() → creates transactions in SurrealDB
3. For each imported transaction:
   - Web creates job_queue record: {name: 'classify-transaction', payload: {transaction_id}}
4. Worker polls job_queue → claims job
5. Worker fetches transaction + categories from SurrealDB
6. Worker calls Ollama (mistral-small) with German prompt
7a. confidence ≥ 0.85: UPDATE transaction SET category = ..., ai_classified = true
7b. confidence < 0.85: CREATE review_item SET ai_suggestion = {suggested_category, confidence}
8. Web's ReviewQueuePage shows pending review items (next useQuery refetch)
```

### Receipt OCR Flow
```
1. User uploads receipt image via ReceiptInbox
2. Web creates job_queue: {name: 'ocr-receipt', payload: {receipt_id}}
3. Worker processes: Tesseract.js (text extraction) + Ollama llama3.2-vision
4. Worker writes extracted data to receipt table
5. Web's OcrResultPreview polls for completion
6. User confirms → creates transaction
```

### Dashboard Pulse Flow
```
1. DashboardPage mounts → TanStack Query fires getDashboardPulse()
2. finance-api.ts sends 4-statement SurrealQL in a single round-trip:
   - Total balance across accounts
   - Pending review count
   - Active contract count
   - Upcoming payments
3. Returns in ~10-50ms (WebSocket, local SurrealDB)
4. TanStack Query caches for 30s stale time
```

---

## Deployment Integration

```
GitHub Actions CI
  → Build Docker image (apps/web built into static files)
  → Push to ghcr.io/grossherzogvi/actual-budget
  → SSH to VPS (212.69.84.228)
    → docker compose pull + up (infra/docker-compose.prod.yml)
      → surrealdb container (SurrealDB 3.0)
      → web container (Nginx serving React SPA)
      → worker container (Node.js process)
```

All three containers share the same Docker network and connect to SurrealDB on the internal network address.

---

## Integration Risks & Known Issues

| Risk | Status | Mitigation |
|------|--------|-----------|
| SDK 1.x / SurrealDB 3.0 version check loop | Fixed | `versionCheck: false` in connect() |
| WebSocket disconnects losing auth | Fixed | Auth in `connect()` options, not separate signin call |
| Worker double-processing jobs | Mitigated | Atomic UPDATE claim query |
| Ollama timeout causing stuck jobs | Fixed | `AbortController` + exponential backoff requeue |
| No auth on web → root credentials exposed | Known gap | Frontend still uses root creds; user auth flow needed |

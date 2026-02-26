# Finance OS — Architecture: Worker

**Generated:** 2026-02-26
**Part:** `apps/worker/` (`@finance-os/worker`)
**Architecture Pattern:** Polling job queue processor with scheduled background tasks

---

## Executive Summary

The worker is a Node.js process that connects to SurrealDB and runs two types of work:
1. **Job queue drain** — processes async jobs enqueued by the web frontend (AI classification, OCR, CSV import)
2. **Scheduled tasks** — periodic background jobs (anomaly detection, pattern analysis, weekly summary)

It has no HTTP server. All communication with the frontend is through shared SurrealDB tables (`job_queue`, `review_item`, `anomaly`, `spending_pattern`).

---

## Technology Stack

| Category | Technology | Version |
|----------|-----------|---------|
| Runtime | Node.js (ESM) | via tsx |
| TypeScript runner | tsx | ^4.20.6 |
| Database SDK | surrealdb | ^1.3.2 |
| OCR | tesseract.js | ^7.0.0 |
| AI | Ollama HTTP API | self-hosted |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Worker Process                          │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           Scheduled Tasks (setInterval)              │   │
│  │   queue-drain (1.5s) │ projection (30s) │ anomaly    │   │
│  │   (60s) │ close-routine (60s, Mondays only)          │   │
│  └──────────────────────┬──────────────────────────────┘   │
│                         │                                   │
│  ┌──────────────────────▼──────────────────────────────┐   │
│  │                   queueDrainTask                     │   │
│  │  SELECT...LIMIT 25 + UPDATE SET status='claimed'     │   │
│  │  (atomic claim — prevents double-processing)         │   │
│  └──────────────────────┬──────────────────────────────┘   │
│                         │                                   │
│  ┌──────────────────────▼──────────────────────────────┐   │
│  │               processQueueJob(job)                   │   │
│  │   classify-transaction → Ollama (mistral-small)      │   │
│  │   import-csv → handlers/import-csv.ts               │   │
│  │   ocr-receipt → handlers/ocr-receipt.ts             │   │
│  │   check-deadlines → contract health scan            │   │
│  │   detect-anomalies → 2× moving average outliers     │   │
│  │   analyze-spending-patterns → recurring scan        │   │
│  │   explain-classification → Ollama explanation       │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
              │                            │
              ▼                            ▼
       SurrealDB 3.0               Ollama HTTP API
   (job_queue, review_item,     (mistral-small / llama3.2-vision)
    anomaly, spending_pattern,
    transaction, contract)
```

---

## Configuration (Environment Variables)

| Variable | Default | Required |
|----------|---------|----------|
| `SURREALDB_URL` | `ws://localhost:8000` | No |
| `SURREALDB_NS` | `finance` | No |
| `SURREALDB_DB` | `main` | No |
| `SURREALDB_USER` | — | **YES** (throws if missing) |
| `SURREALDB_PASS` | — | **YES** (throws if missing) |
| `OLLAMA_URL` | `http://localhost:11434` | No |
| `OLLAMA_MODEL` | `mistral-small` | No |
| `OLLAMA_TIMEOUT_MS` | `30000` | No |
| `WORKER_ID` | `worker-{random}` | No |
| `QUEUE_POLL_INTERVAL_MS` | `1500` | No |
| `QUEUE_MAX_JOBS` | `25` | No |
| `QUEUE_MAX_ATTEMPTS` | `6` | No |
| `PROJECTION_INTERVAL_MS` | `30000` | No |
| `ANOMALY_INTERVAL_MS` | `60000` | No |
| `CLOSE_ROUTINE_INTERVAL_MS` | `60000` | No |

---

## Job Types

### `classify-transaction`
**Trigger:** Web frontend enqueues on import or manual request

1. Fetch transaction with resolved `payee.name` and `category.name`
2. Skip if already categorized
3. Fetch all categories for prompt context
4. Build German-language Ollama prompt
5. Call `POST /api/generate` with `mistral-small`, `temperature=0.1`
6. Parse response: `category:id,confidence`
7. If `confidence ≥ 0.85`: auto-apply category, set `ai_classified=true`
8. If `confidence < 0.85`: create `review_item` with suggestion
9. If parse fails: create `review_item` with `type='uncategorized'`
10. Timeout protection via `AbortController` (`OLLAMA_TIMEOUT_MS`)

### `import-csv`
Delegated to `handlers/import-csv.ts`. Handles bulk transaction insertion with deduplication.

### `ocr-receipt`
Delegated to `handlers/ocr-receipt.ts`. Uses Tesseract.js + Ollama `llama3.2-vision` to extract amount/date/payee from receipt images.

### `check-deadlines`
Queries contracts with `health = 'red'` and creates `review_item` with `type='contract-deadline'`.

### `detect-anomalies`
Finds transactions in the last 7 days where `|amount| > 2× 30-day moving average` per category. Creates `anomaly` records (German-language descriptions).

### `analyze-spending-patterns`
Finds payees with ≥3 transactions in 90 days not tracked as active contracts. Creates `spending_pattern` records if not already present.

### `explain-classification`
Calls Ollama with review item context to generate a German-language explanation (1-2 sentences) for why the AI suggested a category. Writes result to `review_item.explanation`.

---

## Queue Reliability Design

**Atomic claim:** The worker uses a single `UPDATE...RETURN AFTER` query to atomically claim multiple jobs, preventing double-processing across multiple worker instances:
```surql
UPDATE (SELECT * FROM job_queue WHERE status = 'pending' AND visible_at <= time::now() LIMIT 25)
SET status = 'claimed', claimed_by = $worker, claimed_at = time::now()
RETURN AFTER
```

**Exponential backoff:** Failed jobs increase `visible_at` by `min(60s, 1000ms × 2^attempt)`. After `QUEUE_MAX_ATTEMPTS` (6), status becomes `'failed'`.

**Graceful shutdown:** `SIGINT`/`SIGTERM` clears all intervals, terminates Tesseract worker, closes SurrealDB connection.

---

## Handler Pattern

External job handlers follow a standard interface:
```typescript
// handlers/index.ts
export const handlers: Record<string, (db: Surreal, config: WorkerConfig, payload: Record<string, unknown>) => Promise<void>> = {
  'import-csv': importCsvHandler,
}
```

Adding a new job type: add handler to `handlers/`, register in `handlers/index.ts`, add `case` in `processQueueJob()`.

---

## Reconnection

SurrealDB reconnection is configured with exponential backoff (1s → 30s max). The worker authenticates once with root credentials (`SURREALDB_USER`/`SURREALDB_PASS`) at startup.

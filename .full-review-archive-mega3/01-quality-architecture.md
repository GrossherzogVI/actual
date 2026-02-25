# Phase 1: Code Quality & Architecture Review

## Code Quality Findings

### Critical (3)

1. **SQL Injection risk via string interpolation in SurrealQL** — `ocr-api.ts` builds WHERE clauses via template literals (`WHERE ${where}`). While current values use `$params`, the pattern is fragile. Same pattern in `findMatchCandidates` and worker `attemptAutoMatch`. **Fix:** Use conditional full-query branches instead of string building.

2. **Non-null assertions on DB results** — `rows![0]!` used in `ocr-api.ts:57,93`, `sepa-api.ts:28,51`, `import-csv.ts:57`. Will throw unrecoverable runtime error if DB returns empty result. **Fix:** Guard with `rows?.[0]` + throw descriptive error.

3. **Base64 image storage in SurrealDB** — `image_data` stores full Base64 receipt images (up to 20MB) as `TYPE string`. `listReceipts` does `SELECT *` which fetches all image data. With polling every 5 seconds, this creates continuous massive data transfer at even modest scale. **Fix:** Store images on filesystem, keep only path in DB. At minimum, exclude `image_data` from listing queries.

### High (6)

1. **Duplicated formatCurrency/formatDate utilities** — Identical implementations across 9+ files (ReceiptInbox, OcrResultPreview, OcrMatchSuggestion, SepaExportPage, EuerForm, UstForm, TaxExportPage, tax-export-utils, Mt940Preview). **Fix:** Create shared `core/utils/format.ts`.

2. **Duplicated WorkerConfig type** — Defined 3 times: `worker/types.ts`, `worker/main.ts`, and stripped-down in `ocr-receipt.ts`. **Fix:** Single definition in `types.ts`, import everywhere.

3. **Unsanitized HTML in Tax PDF export** — `exportEuerPdf` generates HTML via template literals into `window.open().document.write()` without HTML escaping. Currently safe (static labels) but XSS-prone if dynamic data added. **Fix:** Add `escapeHtml()` helper.

4. **MT940 parser: misleading year-pivot comment** — Comment says "assume 20xx for values 00-99" but code maps >=80 to 19xx. Logic is correct, comment is wrong. **Fix:** Correct comment, add PIVOT_YEAR constant.

5. **OCR worker creates Tesseract worker per image** — Each job creates/destroys a Tesseract worker, reloading the ~10MB German language model. For batch processing this is very slow. **Fix:** Pool/reuse Tesseract worker across jobs.

6. **TaxCategoryMapping broken useRef** — `const initializedRef = { current: false }` is a plain object recreated every render (not `useRef`). The guard is effectively useless. Works by accident because `rows.size === 0` is the actual guard. **Fix:** Use `useRef(false)` or `useEffect`.

### Medium (8)

1. **Inconsistent DB connection patterns** — 4 different patterns for SurrealDB access across feature modules. **Fix:** Standardize on `const db = await connect()`.
2. **Print CSS hides all body content globally** — CancellationLetter injects global print `<style>` that persists. **Fix:** Use `window.open()` pattern for printing.
3. **Base64 encoding via string concatenation** — OcrUploadZone creates millions of intermediate strings. **Fix:** Use chunked approach.
4. **Payer info in localStorage unencrypted** — IBAN/BIC/name in localStorage. **Fix:** Use SurrealDB `user_pref` table.
5. **No circuit breaker for Ollama** — Failed Ollama calls queue up without backoff. **Fix:** Add simple circuit breaker.
6. **SEPA amount floating-point precision** — `amount.toFixed(2)` on floats. **Fix:** Use integer cents.
7. **CAMT.053 parser browser-only** — Uses `DOMParser`, won't work in Node.js worker. **Fix:** Add guard or use portable XML parser.
8. **Anomaly detection correlated subquery** — O(N*M) query pattern. **Fix:** Pre-compute averages.

### Low (5)

1. Unused `euerLines` variable in `tax-export-utils.ts:178`
2. Hardcoded color values instead of theme variables across OCR/SEPA components
3. `EuerLineRow` receives but never uses `line` prop
4. Missing `aria-label` on interactive elements (filters, checkboxes, buttons)
5. `today()` called on every render in SepaPaymentForm (minor perf)

---

## Architecture Findings

### Critical (1)

1. **Base64 image storage in SurrealDB** (same as Code Quality Critical #3) — 15MB upload limit × base64 overhead = 20MB per receipt in DB. `SELECT *` in listing queries + 5-second polling = catastrophic at scale. **Fix:** Filesystem storage + path reference, or at minimum `SELECT * OMIT image_data`.

### High (3)

1. **Duplicated holiday engine** — `calendar/holidays.ts` reimplements `loot-core/src/shared/german-holidays.ts`. Same Easter algorithm, same Bundesland types, same state assignments. Two places to maintain when German holiday law changes. **Fix:** Extract single authoritative engine to shared location, extend with name/type metadata.

2. **Type duplication between frontend and worker** — `ParsedRow` defined identically in `parsers/types.ts` and `worker/types.ts`. `WorkerConfig` defined in 3 places. **Fix:** Create shared types or at minimum consolidate within worker.

3. **Worker main.ts growing into god object** — 477 lines mixing config, connection, 4 periodic tasks, queue drain, classifyTransaction (100 lines), processQueueJob switch (130 lines with 7 cases). Handler registry started but only `import-csv` registered. **Fix:** Extract all job handlers to `handlers/`, register in index, reduce main.ts to orchestration only.

### Medium (6)

1. **Inconsistent API layer patterns** — 3 different SurrealDB connection patterns across feature modules. **Fix:** Standardize on `const db = await connect()`.
2. **Missing error boundaries in tab content** — New tabs wrapped in `<Suspense>` but not `<ErrorBoundary>`. Crash in one tab takes down all finance tabs. **Fix:** Per-tab error boundaries.
3. **localStorage for sensitive payer data** — IBAN/BIC/name in localStorage (unencrypted). Split persistence: some prefs in SurrealDB, some in localStorage. **Fix:** Use `user_pref` table consistently.
4. **CAMT.053 parser browser-only** — DOMParser blocks server-side reuse. **Fix:** Portable XML parser or document constraint.
5. **Missing auto-detection integration** — `detector.ts` implemented but never imported. Dead code. **Fix:** Wire into upload flow for format pre-selection.
6. **Tax data hook holds all transactions in memory** — `useTaxData` fetches ALL yearly transactions, stores full objects in line totals. For 2-3K transactions, significant memory/computation. **Fix:** SurrealQL `GROUP BY` aggregates, lazy-load details.

### Low (3)

1. SEPA XML assumes single `<PmtInf>` block for mixed execution dates
2. Unused `euerLines` variable in tax-export-utils
3. Non-null assertions in API layer (overlaps with Code Quality Critical #2)

---

## Positive Observations

- **Module structure**: Consistent `types.ts` → `*-api.ts` → hooks → components → `index.ts` pattern across all new features
- **Lazy loading**: All new tabs properly lazy-loaded with Suspense fallbacks
- **Command palette**: Consistent CustomEvent bridge pattern for tab switching
- **Parser architecture**: Exhaustive `satisfies never` default case, clean `ParserResult` type extension
- **MT940 parser quality**: Handles multi-statement files, German ?XX subfields, IBAN extraction, per-transaction error isolation
- **SEPA XML**: Proper XML escaping, IBAN mod-97 validation, BIC auto-lookup, discriminated union result type
- **SurrealDB schemas**: Follow established patterns, proper indexes, ASSERT constraints
- **Worker OCR pipeline**: Tesseract → Ollama two-step with regex fallback, confidence scoring, auto-match logic

---

## Critical Issues for Phase 2 Context

These findings should inform the Security & Performance reviews:

1. **Security**: String interpolation in SurrealQL, unsanitized HTML generation, localStorage PII, non-null assertions
2. **Performance**: Base64 image storage + polling, Tesseract worker-per-image, in-memory tax computation, correlated subquery anomaly detection, Base64 string concatenation encoding
3. **Reliability**: Missing error boundaries, no circuit breaker for Ollama, browser-only CAMT.053 parser

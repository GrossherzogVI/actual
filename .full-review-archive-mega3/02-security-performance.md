# Phase 2: Security & Performance Review

## Security Findings

### Critical (4)

1. **FINDING-01: Unauthenticated SurrealDB connection** (CVSS 9.8, CWE-306) — `surreal-client.ts` connects without authentication. No `DEFINE ACCESS` or `PERMISSIONS` on tables. Any WebSocket client can read/write all financial data. **Fix:** Add RECORD access with JWT, define table-level PERMISSIONS.

2. **FINDING-02: Stored XSS via tax PDF HTML** (CVSS 8.1, CWE-79) — `tax-export-utils.ts` generates HTML via template literals into `document.write()` without HTML escaping. Currently uses static labels, but adding dynamic data (payee names, notes) creates XSS. **Fix:** Add `escapeHtml()` function, apply to all interpolated values.

3. **FINDING-03: Hardcoded default root credentials** (CVSS 9.1, CWE-798) — `worker/main.ts:29-30` falls back to `root`/`root` for SurrealDB auth. **Fix:** Fail hard if env vars missing, use scoped user not root.

4. **FINDING-04: Base64 images stored unencrypted in DB** (CVSS 7.5, CWE-312) — Receipt images (up to 20MB base64) stored as plain strings. Receipts contain PII (names, addresses, account numbers). Combined with FINDING-01, all images readable by any client. **Fix:** Filesystem storage with access-controlled URLs.

### High (6)

5. **FINDING-05: IBAN/BIC/address in localStorage** (CVSS 6.8, CWE-922) — `SepaExportPage.tsx`, `CancellationDialog.tsx` store financial PII in unencrypted localStorage. **Fix:** Migrate to SurrealDB `user_pref` table.

6. **FINDING-06: Non-null assertions on DB results** (CVSS 6.5, CWE-476) — `rows![0]!` in `ocr-api.ts`, `sepa-api.ts`, `import-csv.ts`. Crash on empty results. **Fix:** Guard with `rows?.[0]` + descriptive error.

7. **FINDING-07: Prompt injection via OCR text** (CVSS 7.1, CWE-74) — `ocr-receipt.ts:45-63` injects raw OCR text into LLM prompt without sanitization. Crafted receipt can override extraction instructions. **Fix:** Sanitize text, strip control chars, limit length, require human review for high-confidence matches.

8. **FINDING-08: Prompt injection via transaction data** (CVSS 6.5, CWE-74) — `worker/main.ts:190-201` injects payee names and notes (from imported CSV/MT940) directly into Ollama prompts. **Fix:** Sanitize all user-controlled data before prompt injection.

9. **FINDING-09: XXE/XML bomb risk in CAMT.053 parser** (CVSS 7.5, CWE-611) — `camt053.ts:158` uses DOMParser on user-uploaded XML with no entity/DOCTYPE rejection and no size limit. **Fix:** Reject files with `<!ENTITY`/`<!DOCTYPE`, add size limit.

10. **FINDING-10: SSRF via Ollama URL** (CVSS 7.2, CWE-918) — Ollama URL from env var used in unvalidated `fetch()` calls that send financial data. **Fix:** Validate URL at startup (protocol, host), add timeout.

### Medium (8)

11. **FINDING-11: IDOR via unvalidated record IDs** (CVSS 5.3) — API functions accept arbitrary string IDs. `deleteReceipt("transaction:123")` would delete a transaction. **Fix:** Validate ID prefix matches expected table.
12. **FINDING-12: Missing SEPA amount validation** (CVSS 5.5) — No positive/max amount check in `generateSepaXml()`. **Fix:** Validate > 0 and < 999,999,999.99.
13. **FINDING-13: Missing BIC validation** (CVSS 4.3) — BIC format not validated before XML generation. **Fix:** Regex validation.
14. **FINDING-14: Unvalidated tax year parameter** (CVSS 4.0) — `fetchTaxTransactions(year)` accepts any number. **Fix:** Range check 1900-2100.
15. **FINDING-15: Error message information disclosure** (CVSS 3.7) — CAMT.053 parse errors expose up to 200 chars of XML content. **Fix:** Generic error message, console.warn for debugging.
16. **FINDING-16: OCR worker resource exhaustion** (CVSS 5.3) — No server-side image size limit, no concurrency limit, no timeout on Tesseract. **Fix:** Validate size, limit concurrency, add timeout.
17. **FINDING-17: MT940 year 2080 ambiguity** (CVSS 3.1) — 2-digit year pivot documented incorrectly.
18. **FINDING-18: Insufficient security logging** (CVSS 3.3) — All logging is console.log with no structured format, no audit trail for financial operations. **Fix:** Structured logging (pino), audit entries for financial ops.

### Low (5)

19. FINDING-19: Race condition in job claiming (single-worker OK, multi-worker risk)
20. FINDING-20: No CSRF protection on WebSocket operations
21. FINDING-21: Popup blocker handling in tax PDF export
22. FINDING-22: tesseract.js version pinning (^7.0.0 caret range)
23. FINDING-23: SurrealDB SDK version pinning

### Positive Security Observations

- **SurrealQL parameterized queries**: All user values go through `$param` placeholders — prevents injection
- **SEPA XML escaping**: `escapeXml()` correctly escapes all 5 XML special characters
- **IBAN validation**: Full mod-97 algorithm implemented correctly with German length constraints
- **Client-side file validation**: OcrUploadZone validates MIME type and file size
- **Worker error handling**: Job queue implements exponential backoff with max attempts

---

## Performance Findings

### Critical (5)

1. **F-1.1: SELECT * returns Base64 images in list queries** — `listReceipts()` fetches `image_data` (up to 20MB per receipt). 50 receipts = 250MB+ over WebSocket per poll. **Fix:** Use field projection, exclude `image_data` and `raw_ocr_response`.

2. **F-1.2: CSV import — N+4 queries per row** — Each row executes 4-5 sequential DB round-trips (duplicate check, payee upsert, create transaction, enqueue classify). 500-row import = 2000+ queries = 10-30 seconds. **Fix:** Batch operations in groups of 50.

3. **F-2.1: Base64 encoding via string concatenation** — `OcrUploadZone.tsx` creates millions of intermediate strings via `.reduce()`. 10MB file = 2-5 second main thread freeze. **Fix:** Use `FileReader.readAsDataURL()` (native C++ encoding).

4. **F-4.1: Tesseract worker created/destroyed per image** — 10MB German language model reloaded for each receipt. 10 receipts = 30-80 seconds wasted. **Fix:** Persistent Tesseract worker pool.

5. **F-7.1: Base64 image storage architecture** — 33% storage overhead, backup bloat, replication burden. 100 receipts × 5MB = 665MB in DB. **Fix:** Filesystem/object storage with path reference.

### High (5)

6. **F-1.3: Anomaly detection O(N*M) correlated subquery** — Category average computed per transaction via subquery. ~35,000 row scans per 60-second interval. **Fix:** Pre-compute averages in single pass.

7. **F-1.6: Missing indexes on high-traffic query patterns** — No composite indexes on `transaction(date, cleared)`, `transaction(account, amount, date)`, `transaction(category, date)`, `payee(name)`. Full table scans on largest table. **Fix:** Add composite indexes.

8. **F-2.2: Tax hook holds all yearly transactions in memory** — Full transaction objects stored in `EuerLineTotal.transactions[]`. Expandable UI risks DOM explosion (2500 rows). **Fix:** SurrealQL GROUP BY aggregates, paginate detail lists.

9. **F-4.2: Receipt polling too aggressive** — 5-second unconditional polling. Combined with F-1.1, catastrophic. Even fixed, wasteful when idle. **Fix:** Conditional polling (only when pending/processing receipts exist), or LIVE SELECT.

10. **F-5.1: Sequential job processing blocks queue** — 25 claimed jobs processed one-at-a-time. One OCR job (10-30s) blocks all fast classify jobs. **Fix:** Concurrent processing with priority queue and concurrency limit.

### Medium (8)

11. F-3.1: Category list fetched per classify job — 500 redundant queries during CSV import. **Fix:** TTL cache.
12. F-2.3: OcrResultPreview inlines full Base64 image — 27MB per open receipt. **Fix:** `URL.createObjectURL` with Blob.
13. F-4.3: SEPA XML stored in DB string — Architectural risk for future batch listings.
14. F-4.4: DOMParser loads full CAMT.053 XML to memory — 500MB for large files. **Fix:** Size guard.
15. F-5.2: No reconnection config in worker DB client — Silent failure on disconnect. **Fix:** Add reconnect options.
16. F-5.3: Job claiming not atomic for multi-worker — Duplicate processing risk.
17. F-6.1: TaxCategoryMapping broken useRef + setState during render — Double render cycle.
18. F-1.4: N+1 spending pattern existence check — 30 sequential queries. **Fix:** Batch lookup.

### Low (4)

19. F-1.5: IF/THEN upsert instead of UPSERT in tax mappings
20. F-3.2: Tax mappings query not deduplicated across components
21. F-4.5: SEPA payments list has no pagination
22. F-6.2/F-6.3: Inline fallback objects + Intl formatters created per call

---

## Critical Issues for Phase 3 Context

**Testing priorities driven by security findings:**
- Input validation tests for IBAN, BIC, SEPA amounts, tax year, record IDs
- Prompt injection resistance tests for OCR and classification pipelines
- XML parsing safety tests (entity rejection, large file handling)
- Auth/permission tests when SurrealDB access control is added

**Testing priorities driven by performance findings:**
- Load tests for receipt listing (10, 50, 100+ receipts)
- CSV import benchmarks (100, 500, 1000 rows)
- Memory profiling for tax data hook with large transaction sets
- OCR batch processing timing

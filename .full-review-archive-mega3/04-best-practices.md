# Phase 4: Best Practices & Standards

## Framework & Language Findings

### Critical (3)

1. **BP-C1: Inconsistent surreal-client import pattern** — `ocr-api.ts` and `sepa-api.ts` import both `{ db, connect }` and call `await connect()` then use raw `db` singleton. `tax-api.ts` correctly uses `const db = await connect()` return value. The singleton pattern is fragile if reconnection ever returns a new instance. **Fix:** Standardize on return-value pattern.

2. **BP-C2: Non-null assertion on MT940 parser string indexing** — `text[pos]` accessed without bounds check at line 315. `undefined.toString()` is `"undefined"` which matches `[A-Za-z]`, giving incorrect result. **Fix:** Add `pos < text.length` guard.

3. **BP-C3: `as` type assertions where runtime validation needed** — 7+ locations including `reader.result as string`, `JSON.parse(raw) as PayerInfo` (localStorage), `e.target.value as EuerLine`, `query.state.data as Receipt[]`. The `JSON.parse` cast is especially dangerous — corrupted localStorage could produce wrong-shaped data. **Fix:** Add runtime guards for external data sources.

### High (9)

4. **BP-H1: `formatCurrency`/`fmtEuro` duplicated 8+ times** — Identical `Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })` across OCR, SEPA, Tax modules. New formatter instances created per call. **Fix:** Shared `core/utils/format.ts` with cached formatter.

5. **BP-H2: `formatDate` duplicated 4 times** — Slight variations across OCR and Contracts modules. **Fix:** Consolidate into shared utility.

6. **BP-H3: `ParsedRow` type duplicated web/worker** — Identical types in `parsers/types.ts` and `worker/types.ts` with no cross-reference. **Fix:** Extract shared types or add sync comments.

7. **BP-H4: Inline `style={}` objects instead of Tailwind v4** — CLAUDE.md says "Use `className` for Tailwind utilities" but OcrUploadZone, Mt940Preview, CancellationLetter use extensive inline styles for static layout. **Fix:** Migrate static layout properties to Tailwind classes.

8. **BP-H5: Hardcoded hex colors instead of design tokens** — `'#34d399'`, `'#eab308'`, `'#ef4444'`, `'#f87171'` used alongside CSS vars like `var(--fo-ok)`. Breaks dark mode. **Fix:** Standardize on CSS custom properties or Tailwind utilities.

9. **BP-H6: Missing `useCallback` on handlers passed to children** — `ReceiptInbox`, `SepaExportPage`, `TaxCategoryMapping` create new function references every render for props. **Fix:** Wrap in `useCallback`.

10. **BP-H7: Type narrowing via casts in OcrUploadZone render** — `(uploadState as { kind: 'loaded'; filename: string }).filename` instead of proper discriminated union narrowing. **Fix:** Extract state branches into sub-components or use conditional checks.

11. **BP-H8: `TaxCategoryMapping` calls setState during render** — Ref-gated `setRows()` in render body is an anti-pattern. **Fix:** Move to `useEffect`.

12. **BP-H9: Holiday engine duplicated 3 times** — `apps/web/src/features/calendar/holidays.ts`, `loot-core/src/shared/german-holidays.ts`, `sync-server/src/contracts/deadlines.ts`. **Fix:** Single authoritative implementation.

### Medium (12)

13. BP-M1: `prefill` object in SepaPaymentForm useEffect dependency causes re-render loops
14. BP-M2: `FieldGroup` component duplicated in SepaPaymentForm and CancellationDialog
15. BP-M3: `today()` called in JSX on every render
16. BP-M4: Prompt injection — raw OCR text injected into LLM prompt without sanitization
17. BP-M5: CancellationLetter injects global `<style>` for print, accumulates on re-renders
18. BP-M6: `EuerLineRow` receives unused `line` prop
19. BP-M7: `useTaxData` 190-line useMemo should be extracted as testable pure function
20. BP-M8: `printHtml` silently fails on popup blocker
21. BP-M9: `downloadText`/`downloadXml` identical blob-download pattern duplicated
22. BP-M10: `escapeHtml`/`escapeXml` nearly identical, duplicated
23. BP-M11: Worker `main.ts` god object at 477 lines — 5 inline handlers should be extracted
24. BP-M12: `useOcrProcess` uses unnecessary `as` cast on already-typed query data

### Low (8)

25. BP-L1–L3: localStorage JSON.parse without shape validation, unused `printRef`, inconsistent lazy/static imports
26. BP-L4–L5: `sepa_payment.batch_id` should use `record<sepa_batch>` link, `image_data` stored as string
27. BP-L6–L8: Missing `aria-label` on 4+ interactive elements, no tests for any MP3 module

---

## CI/CD & DevOps Findings

### Critical (6)

1. **OPS-C1: Level-5 platform absent from CI/CD** — All workflows (build, check, deploy) operate on legacy `packages/` only. `build.yml` references `packages/desktop-client/build` (deleted). Zero automated validation of 48 MP3 files.

2. **OPS-C2: 0% automated test coverage** — No test files for any MP3 module. Worker has no test script. Financial parsing code (MT940, SEPA, IBAN, tax) ships without any automated gate.

3. **OPS-C3: SurrealDB root/root in production docker-compose** — `docker-compose.level5.yml` starts SurrealDB with `--user root --pass root --bind 0.0.0.0:8000`. Full DB access from any network connection.

4. **OPS-C4: Unauthenticated frontend SurrealDB connection** — `surreal-client.ts` `connect()` establishes WebSocket with no `signin()`. Combined with OPS-C3, all data exposed.

5. **OPS-C5: No backup strategy for SurrealDB** — All financial data in Docker volume with no export, snapshot, or off-host backup. Volume corruption = total data loss.

6. **OPS-C6: No rollback capability** — No schema versioning, deploy always pulls `:latest`, no batch undo for imports. Broken deployment = manual recovery.

### High (8)

7. **OPS-H1: Deploy workflow deploys only legacy sync-server** — No Dockerfiles for Level-5 web app or worker.
8. **OPS-H2: No staging environment** — Master push goes directly to production VPS.
9. **OPS-H3: No Dockerfile for worker** — tesseract.js requires native deps, 15MB language download at runtime.
10. **OPS-H4: No Dockerfile for web app** — No production serving configuration.
11. **OPS-H5: No worker reconnection logic** — SurrealDB restart = permanently broken worker.
12. **OPS-H6: No dependency vulnerability scanning** — No Dependabot, Renovate, or audit step.
13. **OPS-H7: No worker health check** — Silent failure undetectable externally.
14. **OPS-H8: No timeout on Ollama fetch calls** — Hanging Ollama blocks entire worker queue.

### Medium (6)

15. OPS-M1: Stale action versions in deploy.yml (unpinned tags vs SHA hashes elsewhere)
16. OPS-M2: No SurrealDB schema migration validation in CI
17. OPS-M3: No resource limits in docker-compose (OCR can starve other services)
18. OPS-M4: SurrealDB credentials exposed in docker-compose command line
19. OPS-M5: No performance metrics or timing instrumentation
20. OPS-M6: Schema apply.sh lacks transaction safety (partial apply = broken state)

### Low (2)

21. OPS-L1: E2E test path filters exclude `apps/` directory
22. OPS-L2: Worker uses `tsx` in production (should compile to JS)

---

## Summary

| Category | Critical | High | Medium | Low | Total |
|----------|----------|------|--------|-----|-------|
| Framework & Language | 3 | 9 | 12 | 8 | 32 |
| CI/CD & DevOps | 6 | 8 | 6 | 2 | 22 |
| **Total** | **9** | **17** | **18** | **10** | **54** |

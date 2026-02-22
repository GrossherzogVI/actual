## Architecture & Integration

### Critical (must fix — bugs, security, data loss risk)
- **[packages/loot-core/src/server/contracts/app.ts:137]** — Custom contracts bridge manually `JSON.parse`s values returned by `get()`, but `get()` already returns unwrapped `data`. Impact: `contract-list`, `contract-get`, `contract-summary`, `contract-expiring`, and `contract-deadlines` can fail with parse errors at runtime. Fix: remove manual parsing and return `get()` result directly.
- **[packages/loot-core/src/server/categories-setup/app.ts:127]** — `categories-setup-templates` also double-parses `get()` data. Impact: template loading for import/category mapping fails and silently degrades matching UX. Fix: stop parsing and use typed object result.
- **[packages/loot-core/src/server/main.ts:91]** — `get-server-version` parses already-parsed data from `/info`. Impact: server version checks can always fail, breaking update/version-dependent flows. Fix: read `res.build.version` directly.

### Major (should fix — quality, correctness, maintainability)
- **[packages/desktop-client/src/components/import/hooks/useBankFormatDetection.ts:22]** — Frontend calls `import-bank-formats`, but no loot-core handler exists. Impact: format list/detection bootstrap breaks. Fix: add bridge handler in `import-data` or call existing server route via new typed handler.
- **[packages/loot-core/src/server/contracts/app.ts:128]** — Bridge sends `category` while API expects `category_id`. Impact: contract category filtering silently does nothing. Fix: align query param names.
- **[packages/loot-core/src/server/contracts/app.ts:303]** — Bridge sends `withinDays` while API expects `days`. Impact: expiring-window filter is ignored; server default is always used. Fix: align param names on both sides.
- **[packages/desktop-client/src/components/review/hooks/useReviewActions.ts:115]** — Frontend sends `{ status: 'dismissed' }` to `review-batch`, but loot-core bridge expects `{ action }`. Impact: batch dismiss fails with `invalid-status`. Fix: standardize payload contract (`action` vs `status`) end-to-end.
- **[packages/loot-core/src/server/categories-setup/app.ts:137]** — Bridge posts `{ mappings }`, backend expects `{ external_categories, source }`. Impact: categories map API returns validation error when used. Fix: align request body schema.
- **[packages/desktop-client/src/components/contracts/ContractDetailPage.tsx:423]** — UI expects `contract-deadlines` response object with `deadlines/paymentMethod/...`, bridge returns array entries. Impact: deadline panel logic is inconsistent and can mis-handle payloads. Fix: standardize API response shape and TS types.

### Minor (nice to fix — style, consistency, polish)
- **[packages/desktop-client/src/components/FinancesApp.tsx:447]** — Custom routes are inlined as dense one-liners, which reduces diff readability and reviewability. Fix: format route blocks consistently.

### Observations (not bugs, but noteworthy)
- **[packages/sync-server/src/contracts/deadlines.ts:6]** — Sync-server correctly duplicates shared deadline logic instead of importing from loot-core (respects package boundary).
- **[packages/sync-server/src/ai/types.ts:2]** — AI types are mirrored locally (no forbidden cross-package runtime dependency).

## Code Quality & TypeScript

### Critical (must fix — bugs, security, data loss risk)
- **[packages/desktop-client/src/components/import/hooks/useImport.ts:70]** — Async bridge calls are not wrapped in `try/finally`; thrown errors can skip state cleanup. Impact: loading/state machines can become inconsistent after network/handler failures. Fix: wrap async flows in `try/catch/finally` and always clear `loading`.

### Major (should fix — quality, correctness, maintainability)
- **[packages/desktop-client/src/components/review/hooks/useReviewQueue.ts:69]** — `reload/loadMore` have no error guards around async `send` calls. Impact: unhandled promise rejections and stuck loading states. Fix: add defensive `try/catch/finally` and surface actionable errors.
- **[packages/desktop-client/src/components/contracts/hooks/useContracts.ts:51]** — `reload` assumes `send` success without catch/finally symmetry. Impact: hook can hang in loading on exceptions. Fix: use `try/catch/finally` consistently.
- **[packages/desktop-client/src/components/dashboard/DashboardPage.tsx:420]** — Widget renderer still uses `any` for multiple core props. Impact: type regressions are easy to introduce and hard to detect. Fix: replace `any` with concrete dashboard/review/upcoming types.
- **[packages/loot-core/src/server/contracts/app.ts:1]** — Module-level `@ts-strict-ignore` disables strict checks in critical bridge code. Impact: interface drift (like query/payload mismatches) escapes compile-time detection. Fix: remove strict ignore and incrementally type each handler.

### Minor (nice to fix — style, consistency, polish)
- **[packages/desktop-client/src/components/dashboard/hooks/useBalanceProjection.ts:12]** — Hook is a placeholder and appears unused. Impact: dead surface area and cognitive overhead. Fix: remove or wire to a real consumer.
- **[packages/sync-server/src/ai/app-ai.ts:11]** — `classifyBatch/getCachedClassification/clearClassificationCache` imports are unused in this module. Fix: remove imports or use shared batch helper.

### Observations (not bugs, but noteworthy)
- **[packages/desktop-client/src/components/quick-add/QuickAddOverlay.tsx:77]** — Frequent `(send as Function)` usage bypasses handler typing and masks API drift.

## UI/UX Quality

### Critical (must fix — bugs, security, data loss risk)
- **[packages/desktop-client/src/components/import/CsvImportWizard.tsx:315]** — CSV category mapper is rendered with `internalCategories={[]}`. Impact: manual mapping UI cannot map to real categories at all. Fix: pass actual category list (same pattern as Finanzguru wizard).

### Major (should fix — quality, correctness, maintainability)
- **[packages/desktop-client/src/components/import/CsvImportWizard.tsx:129]** — Wizard advances to step 3 even if preview failed. Impact: user lands in invalid step/state with missing preview context. Fix: advance only on successful preview response.
- **[packages/desktop-client/src/components/import/FinanzguruWizard.tsx:101]** — Wizard advances to step 2 regardless of preview success. Impact: blank/invalid intermediate state on failed upload. Fix: guard step transition on successful result.
- **[packages/desktop-client/src/components/quick-add/CategorySelect.tsx:177]** — Category picker options are mouse-only (`onMouseDown`) with no keyboard selection model. Impact: poor keyboard accessibility. Fix: migrate to accessible combobox/listbox behavior with keyboard navigation.
- **[packages/desktop-client/src/components/review/ReviewQueuePage.tsx:158]** — “Load more” is a clickable `Text` with `onClick` instead of a semantic button. Impact: keyboard/screen-reader accessibility gap. Fix: use `Button` or proper interactive semantics.
- **[packages/desktop-client/src/components/quick-add/QuickAddOverlay.tsx:92]** — Quick Add relies on missing `transactions-get` handler for recent templates/suggestions. Impact: core UX affordances silently never populate. Fix: use an existing typed query handler (`api/transactions-get`) or add a proper bridge method.

### Minor (nice to fix — style, consistency, polish)
- **[packages/desktop-client/src/components/import/ImportAdvisor.tsx:95]** — Extensive hardcoded hex colors across custom modules bypass theme tokens. Impact: inconsistent theming and harder dark/light adaptation. Fix: centralize status colors in theme/token layer.
- **[packages/desktop-client/src/components/quick-add/hooks/usePresets.ts:9]** — Default preset labels/category names are hardcoded and not localized through `t()/Trans`. Impact: localization drift for non-German locales. Fix: localize preset labels and lookup keys.

### Observations (not bugs, but noteworthy)
- **[packages/desktop-client/src/components/FinancesApp.tsx:447]** — Custom finance routes are wrapped with `Suspense` and route-level `ErrorBoundary`, which is a solid resilience baseline.

## API & Data Layer

### Critical (must fix — bugs, security, data loss risk)
- **[packages/sync-server/src/contracts/app-contracts.ts:534]** — PATCH endpoint interpolates request field names directly into SQL (`${field} = ?`). Impact: SQL injection via crafted JSON keys and possible schema corruption/exfiltration. Fix: strict whitelist of updatable column names; never interpolate raw keys.
- **[packages/sync-server/migrations/1772000000000-phase1-tables.js:14]** — Phase 1 migration drops `ai_classifications` but does not recreate schema expected by runtime AI code. Impact: AI classify endpoints fail at insert/select time. Fix: add migration that creates current `ai_classifications` schema with needed columns/indexes.
- **[packages/sync-server/migrations/1771200000000-ai-classification.js:9]** — Existing `ai_classifications` schema (`file_id`, `proposed_category`) conflicts with runtime columns (`original_payee`, `normalized_payee`, `suggested_category_id`, `model_version`). Impact: runtime writes fail when old schema exists. Fix: schema migration with explicit column evolution and backfill.

### Major (should fix — quality, correctness, maintainability)
- **[packages/sync-server/migrations/1773000000000-payment-deadlines.js:8]** — Uses plain `ALTER TABLE ... ADD COLUMN` without existence checks. Impact: non-idempotent migration behavior on reruns/recovery. Fix: guard each alteration via pragma/schema checks.
- **[packages/sync-server/migrations/1772000000000-phase1-tables.js:19]** — `CREATE TABLE/INDEX` lacks `IF NOT EXISTS` in multiple statements. Impact: rerun/recovery risk. Fix: idempotent DDL.
- **[packages/desktop-client/src/components/contracts/ContractDetailPage.tsx:678]** — Save payload excludes fields exposed in the form (`category_id`, `tags`, deadline settings). Impact: silent user data loss (form edits not persisted). Fix: map all editable form fields into create/update payloads and align backend column names.
- **[packages/sync-server/src/contracts/app-contracts.ts:264]** — `/contracts/discover` and `/contracts/bulk-import` are stubs returning message objects, while loot-core/frontend types expect structured result data. Impact: false-positive success semantics and broken downstream assumptions. Fix: either implement routes or mark feature unavailable end-to-end.
- **[packages/sync-server/src/import/app-import.ts:993]** — `/import/detect-contracts` requires `transactions[]`, but frontend/bridge call paths don’t provide it and expect different response fields. Impact: endpoint effectively unusable from UI. Fix: align request and response schema across frontend, loot-core bridge, and API.

### Minor (nice to fix — style, consistency, polish)
- **[packages/sync-server/src/review/app-review.ts:111]** — `limit/offset` are parsed without sane bounds. Impact: avoidable heavy queries with large limits. Fix: clamp and validate numeric query params.

### Observations (not bugs, but noteworthy)
- **[packages/sync-server/src/contracts/app-contracts.ts:118]** — Contract list enrichment is batched (tags/history/events/docs), avoiding per-row N+1.

## Security

### Critical (must fix — bugs, security, data loss risk)
- **[packages/sync-server/src/contracts/app-contracts.ts:574]** — Dynamic SQL update string uses unsanitized field identifiers. Impact: SQL injection risk on contract update API. Fix: strict server-side field whitelist and identifier mapping.

### Major (should fix — quality, correctness, maintainability)
- **[packages/sync-server/src/app.ts:36]** — Global `app.use(cors())` enables permissive cross-origin access by default. Impact: enlarged attack surface for token-bearing API calls from arbitrary origins. Fix: restrict origins and methods to trusted clients.
- **[packages/sync-server/src/app.ts:143]** — COOP/COEP headers are set, but CSP is not configured in this path. Impact: weaker XSS mitigation posture for served frontend. Fix: add strict CSP (with controlled script/style sources).
- **[packages/sync-server/src/import/app-import.ts:611]** — Import routes validate only `fileData` presence, not MIME/type/signature. Impact: malformed/hostile payloads are parsed directly, increasing DoS/error surface. Fix: enforce file-type validation and tighter size/content guards.

### Minor (nice to fix — style, consistency, polish)
- **[packages/sync-server/src/ai/app-ai.ts:90]** — User-supplied regex rules are executed at match time without safety limits. Impact: potential regex backtracking abuse on classification paths. Fix: validate/sandbox regex patterns or restrict rule types.

### Observations (not bugs, but noteworthy)
- **[packages/sync-server/src/contracts/app-contracts.ts:24]** — Custom routers consistently use `validateSessionMiddleware`; auth token checks are present on these paths.

## Business Logic Correctness

### Critical (must fix — bugs, security, data loss risk)
- **[packages/desktop-client/src/components/quick-add/hooks/useCalculator.ts:72]** — Calculator strips commas instead of interpreting German decimal separators. Impact: values like `12,50` become `1250` (100x error) and can write severely wrong transaction amounts. Fix: normalize locale decimal input (`',' -> '.'`) before parsing.
- **[packages/desktop-client/src/components/contracts/ContractDetailPage.tsx:705]** — Edit/save flow drops `category_id`, `tags`, and deadline-related fields despite form controls. Impact: silent data loss and incorrect persisted contract state. Fix: include full form field mapping with schema-aligned keys.
- **[packages/desktop-client/src/components/contracts/ContractDetailPage.tsx:822]** — Edit form initialization omits fields like `category_id` and deadline settings. Impact: existing values are not shown; accidental overwrite risk on save. Fix: hydrate all editable fields from `ContractEntity`.

### Major (should fix — quality, correctness, maintainability)
- **[packages/desktop-client/src/components/calendar/hooks/useCalendarData.ts:97]** — Calendar recurrence logic handles `yearly`, but contracts use `annual`; `semi-annual/custom` also fall into monthly default. Impact: projected payment dates are wrong for multiple intervals. Fix: support full contract interval enum (`annual`, `semi-annual`, `custom`).
- **[packages/desktop-client/src/components/dashboard/hooks/useUpcomingPayments.ts:67]** — Upcoming payments explicitly skip quarterly/semi-annual/custom intervals. Impact: underreported obligations in dashboard widgets and derived projections. Fix: implement all interval variants consistently.
- **[packages/desktop-client/src/components/dashboard/hooks/useUpcomingPayments.ts:21]** — Monthly recurrence uses naive day-of-month construction without end-of-month clamp. Impact: overflow/drift around 29/30/31-day anchors. Fix: clamp to last day of month when target day is missing.
- **[packages/desktop-client/src/components/calendar/hooks/useCalendarData.ts:182]** — Frontend reads `soft_shift/hard_shift`, backend schema uses `soft_deadline_shift/hard_deadline_shift`. Impact: configured deadline shift behavior is ignored in calendar computations. Fix: align field names and mappings.
- **[packages/desktop-client/src/components/calendar/hooks/useCalendarData.ts:389]** — Schedule projection includes only `next_date` once per schedule within window. Impact: recurring schedules inside the same window are undercounted; running balance is optimistic. Fix: generate all occurrences in range, not just first next date.
- **[packages/desktop-client/src/components/import/hooks/useCategoryMapping.ts:78]** — Auto-match compares external categories to template names and stores template IDs, not actual category IDs. Impact: auto-mapping suggestions are semantically wrong. Fix: match against real internal categories and persist true category IDs.
- **[packages/desktop-client/src/components/import/CsvImportWizard.tsx:94]** — CSV “external categories” are derived from transaction notes. Impact: mapping workflow operates on irrelevant values. Fix: map from real external category signal (or remove step when source lacks categories).
- **[packages/desktop-client/src/components/contracts/ContractDetailPage.tsx:507]** — Deadline panel logic assumes `result.deadlines` object despite bridge returning list entries. Impact: status computation and rendering are inconsistent/fragile. Fix: unify deadline API contract and UI expectation.

### Minor (nice to fix — style, consistency, polish)
- **[packages/loot-core/src/shared/german-holidays.ts:126]** — BY handling for Aug 15 is explicitly simplified to state-wide behavior. Fix: optionally document/configure municipality-level accuracy limits.

### Observations (not bugs, but noteworthy)
- **[packages/loot-core/src/shared/german-holidays.ts:65]** — Easter/holiday computation approach is standard and deterministic.

## Performance

### Critical (must fix — bugs, security, data loss risk)
- **[packages/sync-server/src/ai/app-ai.ts:263]** — Batch classification loops sequentially with per-item awaited LLM calls. Impact: latency scales linearly with transaction count and is significantly higher than necessary. Fix: use bounded concurrency (existing `classifyBatch` helper or worker pool).

### Major (should fix — quality, correctness, maintainability)
- **[packages/desktop-client/src/components/analytics/hooks/useAnalyticsData.ts:151]** — Current-month category spending runs one query per category sequentially. Impact: N+1 query pattern and slow analytics on large category sets. Fix: aggregate in fewer grouped queries or parallelize boundedly.
- **[packages/desktop-client/src/components/analytics/hooks/useAnalyticsData.ts:282]** — Spending trend generation runs nested per-category/per-month sequential queries. Impact: large latency spikes as data grows. Fix: pre-aggregate by month+category in one/few queries.
- **[packages/desktop-client/src/components/analytics/hooks/useAnalyticsData.ts:361]** — `setLoading(false)` occurs only at function end without outer `finally`. Impact: thrown errors before completion can leave analytics in perpetual loading state. Fix: wrap full fetch pipeline in `try/finally`.

### Minor (nice to fix — style, consistency, polish)
- **[packages/desktop-client/vite.config.mts:122]** — Production builds always emit sourcemaps and run visualizer plugin. Impact: larger artifacts/slower build pipeline. Fix: gate by environment (`ANALYZE`, non-production sourcemaps).
- **[packages/desktop-client/vite.config.mts:220]** — Visualizer plugin is always loaded. Impact: unnecessary build overhead in normal builds. Fix: enable only when explicitly requested.

### Observations (not bugs, but noteworthy)
- **[packages/desktop-client/src/components/FinancesApp.tsx:39]** — Custom major pages are lazy-loaded, which helps initial bundle behavior.

## Prioritized Fix Plan

### Tier 1 — Fix Now (security, data corruption, crashes)
1. Remove `get()` double-parsing in loot-core bridges and integration (`contracts`, `categories-setup`, `main`). — Effort: **M** — Files: `packages/loot-core/src/server/contracts/app.ts`, `packages/loot-core/src/server/categories-setup/app.ts`, `packages/loot-core/src/server/main.ts`
2. Fix AI schema/migration break (`ai_classifications` missing/mismatched). — Effort: **L** — Files: `packages/sync-server/migrations/1771200000000-ai-classification.js`, `packages/sync-server/migrations/1772000000000-phase1-tables.js`, `packages/sync-server/src/ai/app-ai.ts`
3. Eliminate SQL injection vector in contract PATCH field updates. — Effort: **S** — Files: `packages/sync-server/src/contracts/app-contracts.ts`
4. Correct Quick Add amount parsing for comma decimals and expression normalization. — Effort: **S** — Files: `packages/desktop-client/src/components/quick-add/hooks/useCalculator.ts`, `packages/desktop-client/src/components/quick-add/AmountInput.tsx`
5. Restore contract form persistence for dropped fields (category, tags, deadline settings) and edit hydration. — Effort: **M** — Files: `packages/desktop-client/src/components/contracts/ContractDetailPage.tsx`, `packages/desktop-client/src/components/contracts/ContractForm.tsx`, `packages/desktop-client/src/components/contracts/types.ts`

### Tier 2 — Fix Soon (correctness, UX, major quality)
1. Align handler/API payload contracts (`import-bank-formats`, review batch action/status, categories map payload, detect-contracts schema). — Effort: **M** — Files: `packages/desktop-client/src/components/import/hooks/useBankFormatDetection.ts`, `packages/desktop-client/src/components/review/hooks/useReviewActions.ts`, `packages/loot-core/src/server/review/app.ts`, `packages/loot-core/src/server/categories-setup/app.ts`, `packages/sync-server/src/import/app-import.ts`
2. Fix contract bridge query param drift (`category` vs `category_id`, `withinDays` vs `days`). — Effort: **S** — Files: `packages/loot-core/src/server/contracts/app.ts`, `packages/sync-server/src/contracts/app-contracts.ts`
3. Repair calendar/upcoming recurrence logic for `annual/semi-annual/custom` and month-end clamping. — Effort: **M** — Files: `packages/desktop-client/src/components/calendar/hooks/useCalendarData.ts`, `packages/desktop-client/src/components/dashboard/hooks/useUpcomingPayments.ts`
4. Make import wizard flow resilient (only advance steps on success; provide valid mapping inputs). — Effort: **M** — Files: `packages/desktop-client/src/components/import/CsvImportWizard.tsx`, `packages/desktop-client/src/components/import/FinanzguruWizard.tsx`, `packages/desktop-client/src/components/import/hooks/useImport.ts`
5. Replace N+1 analytics querying and add safe loading finalization. — Effort: **M** — Files: `packages/desktop-client/src/components/analytics/hooks/useAnalyticsData.ts`

### Tier 3 — Fix Later (tech debt, polish, consistency)
1. Reduce `@ts-strict-ignore` / `send as Function` usage and strengthen handler typing. — Effort: **L** — Files: custom frontend hooks/components + loot-core custom bridge modules
2. Improve accessibility for custom interactive controls (combobox/listbox, load-more button semantics). — Effort: **M** — Files: `packages/desktop-client/src/components/quick-add/CategorySelect.tsx`, `packages/desktop-client/src/components/review/ReviewQueuePage.tsx`
3. Replace hardcoded color literals with theme tokens in custom modules. — Effort: **M** — Files: dashboard/contracts/calendar/analytics/quick-add/review/import component set
4. Gate build analysis/debug options by env (sourcemaps/visualizer). — Effort: **S** — Files: `packages/desktop-client/vite.config.mts`
5. Tighten server security defaults (restricted CORS + CSP). — Effort: **M** — Files: `packages/sync-server/src/app.ts`

### Architecture Recommendations
- Standardize bridge contracts with a shared schema boundary: one typed source-of-truth per handler (args + response), and ban untyped `(send as Function)` in feature modules.
- Add a contract-test suite for bridge compatibility (`loot-core handler ↔ sync-server route`), including payload and response shape assertions.
- Enforce migration invariants with CI checks: idempotency, forward/backward compatibility, and schema snapshots for critical tables.
- Consolidate recurrence/date logic into one shared module consumed by dashboard/calendar/contracts paths to eliminate interval drift.
- Add API compatibility guards in UI workflows (step transitions should depend on successful typed responses only).

### Summary Statistics
- Critical: **11** | Major: **30** | Minor: **12** | Observations: **10**
- Estimated total fix effort: **XL**
- Top 3 files needing attention: `packages/desktop-client/src/components/contracts/ContractDetailPage.tsx`, `packages/loot-core/src/server/contracts/app.ts`, `packages/sync-server/src/contracts/app-contracts.ts`

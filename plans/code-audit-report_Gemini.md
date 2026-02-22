# Actual Budget++ — Full Monorepo Code Audit Report

## Architecture & Integration

### Critical (must fix)
- **packages/desktop-client/src/components/FinancesApp.tsx:314** — The application lacks root-level `<ErrorBoundary>` wrappers around its heavily code-split custom route components (e.g., `<DashboardPage />`). Unhandled exceptions in any lazy-loaded widget will crash the entire single-page application to a blank screen instead of isolating the failure. Fix: Wrap each `<Route element={...}>` or the `Suspense` boundary in a robust error boundary.

### Major (should fix)
- **packages/loot-core/src/server/review/app.ts:81** — While `patch()` and `del()` automatically throw `PostError` and unwrap the data envelope, the manual JSON parsing for `get()` calls (`const parsed = JSON.parse(res)`) might mask specific API error behaviors if the JSON is malformed. Fix: Harmonize all HTTP calls to handle unwrap logic consistently inside the `post.ts` utilities.

## Code Quality & TypeScript

### Major (should fix)
- **packages/sync-server/src/contracts/app-contracts.ts:275** — Pervasive use of `as unknown` and `as Record<string, unknown>` type assertions to bypass the SQLite runtime layer. Impact: If the database schema drifts or migrations fail, the app will break at runtime without type hints. Fix: Use `satisfies` or a robust runtime-validation layer (like Zod) to assert the shapes returned by DB queries.

### Minor (nice to fix)
- **packages/desktop-client/src/components/quick-add/hooks/useCalculator.ts:12** — Uses `new Function('return (' + sanitized + ')')();`. While the aggressive Regex filter `/[^0-9+\-*/.() ]/g` protects against XSS payload execution, using `new Function` strongly violates Content Security Policy (CSP) best practices and blocks turning off `unsafe-eval` in production. Fix: Implement a lightweight arithmetic parser.

## UI/UX Quality

### Major (should fix)
- **packages/desktop-client/src/components/quick-add/AmountInput.tsx:45** — Hardcoded hex values (`#10b981`) and raw transparent background string properties are manipulating component aesthetics instead of standardizing via `@actual-app/components/theme`. Avant-Garde UI rules dictate intentional, cohesive design tokens; inline styling introduces inconsistency and breaks dark mode permutations. Fix: Standardize income/expense color primitives inside `themeTokens`.
- **desktop-client/src/components/\*** — Massive proliferation of `onClick` (81 occurrences identified) across custom reporting, budget grids, and UI inputs, directly violating the `CLAUDE.md` and `react-aria-components` spec instructing `onPress`. This breaks semantic accessibility models for mobile-touch tap-delay normalization. Fix: Mass-migrate `onClick` -> `onPress` where valid, and ensure underlying primitives aren't native DOM `<button>`.

## API & Data Layer (Backend)

### Critical (must fix)
- **packages/sync-server/src/contracts/app-contracts.ts:279** — Severe **N+1 Query Issue** inside `app.get('/')`. The endpoint maps over every selected contract using `enrichContract()`, which subsequently executes 4 sequential database queries per mapping (`tags`, `price_history`, `events`, `documents`). Impact: Fetching just 500 contracts executes 2,001 synchronous queries blocking the main thread. Fix: Aggregate enrichment using SQL `JOIN`s, subqueries, or a single batch fetch mapping in memory via `GROUP BY`.

### Major (should fix)
- **packages/sync-server/src/contracts/app-contracts.ts:497** — The hardcoded `allowedFields` string array used for `app.patch` endpoints is highly repetitious and prone to desynchronization if schema fields like `tombstone` or logic locks are expanded.

## Security

### Major (should fix)
- **packages/sync-server/src/contracts/app-contracts.ts:354** — IDOR/Isolation Risk. The backend currently selects endpoints entirely via `WHERE id = ?`. While `CLAUDE.md` documents this as a "Single power user" setup, `validateSessionMiddleware` and the multi-user routes inside `FinancesApp.tsx` imply architectural scaling to multi-tenant. If `getAccountDb()` isn't strongly isolated per user directory, any valid session can fetch `/:id` regardless of ownership. Fix: Guard queries with an ownership or strict scoping condition if multi-tenant.

## Business Logic Correctness

### Major (should fix)
- **packages/loot-core/src/shared/deadlines.ts:92** — `addBusinessDays` contains an unoptimized logic flaw. The `while (remaining > 0)` loop consecutively invokes `isBusinessDay(d, bundesland)`, which recalculates `getHolidays()` on *every single iteration*. Impact: O(N) performance hit rebuilding an entire Set of 16 strings per iteration step. Fix: Memoize `getHolidays()` or pre-extract the Set before the loop.

### Observations
- **packages/loot-core/src/shared/deadlines.ts:92** — If `gracePeriodDays` or `leadTimeOverride` evaluates to `0`, `remaining` is `0`, and the loop safely bypasses without advancing the date. However, this relies on `nextBusinessDay(..., 'before')` downstream to forcefully clamp the raw output to a valid banking day. Fix: Ensure zero-day shifts strictly fall on a business day directly inside `addBusinessDays`.

## Performance

### Major (should fix)
- As detailed above, the N+1 API defect in `app-contracts.ts` and O(N) algorithmic waste in `deadlines.ts:92` represent the most pervasive runtime bottlenecks dragging down standard navigational and computational efficiency.

---

## Prioritized Fix Plan

### Tier 1 — Fix Now (security, data corruption, crashes)
1. **N+1 Query Elimination in Contract Fetching** — Effort: M — Files: `sync-server/src/contracts/app-contracts.ts`
2. **Missing Frontend Error Boundaries** — Effort: S — Files: `desktop-client/src/components/FinancesApp.tsx`
3. **CSP Violation via \`new Function()\` Calculator** — Effort: S — Files: `desktop-client/src/components/quick-add/hooks/useCalculator.ts`

### Tier 2 — Fix Soon (correctness, UX, major quality)
1. **Mass Transition from \`onClick\` to \`onPress\` via react-aria** — Effort: M — Files: `desktop-client/src/components/**/*`
2. **Holiday Set Memoization within Loops** — Effort: S — Files: `loot-core/src/shared/deadlines.ts`
3. **Inline Color Standardization to Theme tokens** — Effort: S — Files: `quick-add/AmountInput.tsx`

### Tier 3 — Fix Later (tech debt, polish, consistency)
1. **Dynamic Schema Validation vs \`as any\` Casting** — Effort: L — Files: `app-contracts.ts`, `app-ai.ts`
2. **HTTP Utility Standardization (\`get()\` JSON unwrapping)** — Effort: S — Files: `loot-core/src/server/post.ts`, `review/app.ts`

### Architecture Recommendations
*ULTRATHINK PROTOCOL INITIATED*: The structural layout of `FinancesApp.tsx` demonstrates strong component lazy-loading, but violates "Avant-Garde UI" resilience specs by omitting strategic `<ErrorBoundary>` components. If a subcomponent like `AccountBalancesWidget` fails to hydrate due to an edge case in `contract_tags` aggregation from the backend N+1 bug, the user's dashboard breaks instantly, spiking cognitive load and completely violating the "premium cockpit" mandate. 
We must implement targeted suspense boundaries mapped precisely to resilient layout structures—ensuring layout persistence visually replaces error states with elegant skeleton/error placeholders without repainting the entire viewport. 
Secondly, stripping hardcoded HEX colors from inputs and enforcing atomic design paradigms across our theme engine stops the UI from degrading into a stitched-together template, cementing the "Operations Command Center" premium aesthetic. Intentional minimalism requires every rendering cycle and styled permutation to be perfectly purposeful.

### Summary Statistics
- Critical: 2 | Major: 7 | Minor: 1 | Observations: 1
- Estimated total fix effort: M
- Top 3 files needing attention: `app-contracts.ts`, `FinancesApp.tsx`, `deadlines.ts`

# Actual Budget++ — Full Monorepo Code Audit

## Mission

Perform a comprehensive deep-dive code audit of **Actual Budget++**, a personal fork of actualbudget/actual transformed into a "Finance OS". The audit covers all custom code (not upstream), across 7 quality dimensions, executed in parallel using agent teams. Produce a structured findings report with a prioritized fix plan.

**This is a READ-ONLY audit. Do NOT modify any files.**

## Project Context

**Repo:** `GrossherzogVI/actual` — monorepo at `/Users/admin/dev/actual-budget`
**Total source files:** ~2,100 (monorepo), custom fork code: ~120 files / ~21K lines
**Stack:** React 19 + Vite 7 (frontend), Express 5 (backend), SQLite (DB), Ollama (AI), TypeScript throughout

### Monorepo Layout

```
packages/
  desktop-client/   React 19 + Vite 7 frontend
  sync-server/      Express 5 backend (API + static serving)
  loot-core/        Core engine (shared types, handler bridge, DB)
  api/              Public API package
  crdt/             CRDT sync protocol
  component-library/ @actual-app/components
```

### Custom Code Scope (AUDIT THESE — not upstream)

**Frontend (~14,400 lines in ~56 files):**
- `desktop-client/src/components/dashboard/` — 16 files, operations cockpit with 9 widgets
- `desktop-client/src/components/contracts/` — 13 files, contract management
- `desktop-client/src/components/calendar/` — 9 files, payment calendar
- `desktop-client/src/components/analytics/` — 7 files, tabbed analytics
- `desktop-client/src/components/quick-add/` — 11 files, Quick Add overlay (Cmd+N)
- `desktop-client/src/components/review/` — review queue page
- `desktop-client/src/components/import/` — import wizards (Finanzguru XLSX, bank CSV)
- `desktop-client/src/components/tags/` — tag management

**Backend (~4,700 lines in ~12 files):**
- `sync-server/src/ai/` — Ollama classifier, smart matching, review queue API
- `sync-server/src/contracts/` — contract CRUD, price history, health computation
- `sync-server/src/categories/` — German category tree, Finanzguru mapping
- `sync-server/src/import/` — import API endpoints

**Core Handlers (~1,200 lines in ~3 files):**
- `loot-core/src/server/contracts/app.ts` — contract handler bridge
- `loot-core/src/server/categories-setup/app.ts` — category setup handlers
- `loot-core/src/server/review/app.ts` — review queue handlers

**Shared Modules:**
- `loot-core/src/shared/german-holidays.ts` — German holiday engine
- `loot-core/src/shared/deadlines.ts` — payment deadline computation

**Migrations (~400 lines):**
- `sync-server/migrations/1771100000000-contracts-forecast.js`
- `sync-server/migrations/1771200000000-ai-classification.js`
- `sync-server/migrations/1772000000000-phase1-tables.js`
- `sync-server/migrations/1773000000000-payment-deadlines.js`

**Integration Files (modified upstream, audit for correctness):**
- `desktop-client/src/components/FinancesApp.tsx` — route definitions, lazy loading
- `desktop-client/src/components/sidebar/PrimaryButtons.tsx` — nav items
- `desktop-client/src/components/GlobalKeys.tsx` — keyboard shortcuts
- `desktop-client/vite.config.mts` — build config, code splitting
- `loot-core/src/types/handlers.ts` — handler type union
- `loot-core/src/server/main.ts` — handler registration
- `loot-core/src/types/prefs.ts` — feature flag types
- `desktop-client/src/hooks/useFeatureFlag.ts` — flag defaults

### Architecture Pattern

All client-server communication flows through loot-core's handler bridge:
```
Client: send('handler-name', args)
  → loot-core handler (packages/loot-core/src/server/{module}/app.ts)
    → HTTP POST to sync-server (packages/sync-server/src/{module}/app-{module}.ts)
      → SQLite (account.sqlite)
```

`post()` auto-unwraps `{ status: 'ok', data }` envelope. `get()` returns raw string.

## Execution Strategy

Create a team of **5 parallel reviewer agents**, each owning specific dimensions and file scopes. Use `TeamCreate` + `Task` with `team_name`.

### Agent Assignment

| Agent | Dimensions | File Scope |
|-------|-----------|------------|
| **reviewer-arch** | Architecture + Data Flow | `loot-core/src/server/*/app.ts`, `sync-server/src/*/app-*.ts`, `sync-server/src/app.ts`, `FinancesApp.tsx`, `handlers.ts`, `main.ts`, migrations |
| **reviewer-frontend** | UI/UX + Component Quality | `desktop-client/src/components/{dashboard,contracts,calendar,analytics,quick-add,review,import,tags}/` |
| **reviewer-backend** | API + Database + Performance | `sync-server/src/{ai,contracts,categories,import}/`, all migration files, `vite.config.mts` |
| **reviewer-security** | Security + Input Validation | ALL custom files — focus on API endpoints, SQL queries, user input handling, auth token usage |
| **reviewer-logic** | Business Logic + Correctness | `loot-core/src/shared/{german-holidays,deadlines}.ts`, `quick-add/hooks/`, `calendar/`, `analytics/hooks/` |

Each agent uses `subagent_type` appropriate for its work:
- reviewer-arch → `code-review-ai:architect-review`
- reviewer-frontend → `agent-teams:team-reviewer`
- reviewer-backend → `agent-teams:team-reviewer`
- reviewer-security → `security-scanning:security-auditor`
- reviewer-logic → `agent-teams:team-reviewer`

## Review Dimensions (7 Tracks)

### 1. Architecture & Integration (reviewer-arch)
- Is the handler bridge pattern implemented consistently across all modules?
- Are there circular dependencies or leaky abstractions between packages?
- Is `sync-server` importing from `loot-core`? (forbidden — types must be duplicated)
- Are lazy-loaded routes in FinancesApp.tsx correct (Suspense, error boundaries)?
- Is the handler type union in `handlers.ts` complete and properly typed?
- Migration ordering: any conflicts, missing rollbacks, or schema inconsistencies?
- Feature flags: properly gated? What happens when flags are off?

### 2. Code Quality & TypeScript (all agents, within their scope)
- `any` / `unknown` / type assertions (`as`, `!`) — identify all occurrences
- Missing error handling (try/catch around DB operations, HTTP calls)
- Dead code: unreachable branches, unused imports, orphaned components
- Inconsistent patterns: some modules follow conventions, others don't
- Console.log / debugging artifacts left in code
- Missing `satisfies` where type assertions are used
- Component prop types: inline vs extracted, consistency

### 3. UI/UX Quality (reviewer-frontend)
- Loading states: do async components show spinners/skeletons?
- Error boundaries: what happens when a widget/page crashes?
- Empty states: what do pages show with no data?
- Keyboard accessibility: can all features be reached via keyboard?
- Responsive behavior: does anything break at different viewport sizes?
- `react-aria-components` usage: `isDisabled` not `disabled`, `onPress` not `onClick`?
- Theme token usage: any hardcoded colors or raw CSS values?
- i18n: are all user-facing strings wrapped in `Trans` or `t()`?

### 4. API & Data Layer (reviewer-backend)
- Express route handlers: proper error responses? HTTP status codes?
- SQL injection risk: any raw string interpolation in queries?
- Missing input validation on API endpoints
- Database schema: proper indexes for query patterns? Foreign keys?
- Migration safety: are migrations idempotent? Can they run twice?
- `post()` / `get()` usage: proper error handling when server is unreachable?
- Race conditions: concurrent requests hitting same data?

### 5. Security (reviewer-security)
- Auth token handling: `X-ACTUAL-TOKEN` — where is it validated? Can it be bypassed?
- XSS vectors: any `dangerouslySetInnerHTML` or unsanitized user input in DOM?
- IDOR: can user A access user B's data via parameter manipulation?
- File upload handling (import wizards): size limits? Type validation?
- Ollama API calls: any prompt injection risks from user-controlled data?
- CORS/CSP headers on sync-server
- Secrets in code: any hardcoded tokens, URLs, or credentials?

### 6. Business Logic Correctness (reviewer-logic)
- German holiday computation: correct for all states? Edge cases (Easter algorithm)?
- Payment deadline calculation: business day awareness, month-end handling
- Calculator in Quick Add: does "12.50+8.30" actually compute correctly?
- Category frecency scoring: is the algorithm sound?
- Contract health badges: is the logic correct?
- Running balance in calendar: does it account for pending transactions?
- Analytics aggregations: correct date ranges, category grouping, off-by-one errors?

### 7. Performance (reviewer-backend + reviewer-frontend)
- Vite config: is code splitting effective? Bundle size concerns?
- React re-renders: are expensive computations memoized?
- SQLite queries: any N+1 patterns? Missing indexes?
- Dashboard with 9 widgets: are data fetches parallel or waterfall?
- Large dataset handling: what happens with 10K+ transactions?
- Memory leaks: event listeners not cleaned up? Intervals not cleared?

## Output Format

Each agent produces findings in this structure:

```markdown
## [Dimension Name]

### Critical (must fix — bugs, security, data loss risk)
- **[FILE:LINE]** — Description of issue. Impact: [what breaks]. Fix: [suggestion].

### Major (should fix — quality, correctness, maintainability)
- **[FILE:LINE]** — Description. Impact: [degraded UX / tech debt]. Fix: [suggestion].

### Minor (nice to fix — style, consistency, polish)
- **[FILE:LINE]** — Description. Fix: [suggestion].

### Observations (not bugs, but noteworthy)
- **[FILE:LINE]** — Description.
```

After all agents complete, synthesize into a **Prioritized Fix Plan**:

```markdown
## Prioritized Fix Plan

### Tier 1 — Fix Now (security, data corruption, crashes)
1. [Finding] — Effort: [S/M/L] — Files: [list]

### Tier 2 — Fix Soon (correctness, UX, major quality)
1. [Finding] — Effort: [S/M/L] — Files: [list]

### Tier 3 — Fix Later (tech debt, polish, consistency)
1. [Finding] — Effort: [S/M/L] — Files: [list]

### Architecture Recommendations
- [Structural improvements that span multiple findings]

### Summary Statistics
- Critical: N | Major: N | Minor: N | Observations: N
- Estimated total fix effort: [S/M/L/XL]
- Top 3 files needing attention: [list]
```

## Execution Instructions

1. Read `CLAUDE.md` for project conventions and gotchas
2. Create the team: `TeamCreate` with name `code-audit`
3. Create 7 tasks (one per dimension) using `TaskCreate`
4. Spawn 5 reviewer agents via `Task` with `team_name: "code-audit"`
5. Assign dimensions to agents per the table above
6. Each agent reads ONLY their assigned files (don't scan entire monorepo)
7. Each agent produces findings in the format above
8. After all agents complete, synthesize the prioritized fix plan
9. Write final report to `plans/code-audit-report.md`

## Constraints

- **DO NOT modify any source files** — this is read-only analysis
- **DO NOT audit upstream code** — only files in the custom modules listed above
- **DO NOT run the application** — analysis is static (code reading only)
- Stay within file scopes per agent — don't duplicate work across agents
- Cite specific file:line for every finding
- Be concrete: "SQL injection in app-contracts.ts:47" not "there might be SQL issues"

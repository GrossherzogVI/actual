# Actual Budget++ — Finance OS

Personal fork of [Actual Budget](https://github.com/actualbudget/actual) transformed into **"Finance OS"**: a daily-use personal finance command center combining Finanzguru's ease of use, StarMoney's feature depth, AI automation, and full data sovereignty.

> For the complete product specification see [REQUIREMENTS.md](./REQUIREMENTS.md).
> For system architecture details see [ARCHITECTURE.md](./ARCHITECTURE.md).

## Vision

**Single power user, desktop-first, German financial context.** The app opens like a cockpit, not a chore. Dense, modern, premium feel — an operational command center, not a minimal consumer app.

**Core philosophy:** The app gets smarter over time. Progressive automation reduces manual work from 20 items/week to 2-3 items/week. Every feature should serve daily use.

**German-first, self-hosted.** Full data sovereignty. IBAN-based matching, German category tree, Kuendigungsfristen, German bank CSV formats, German receipt OCR. No third-party data access. All UI strings German where custom, English where upstream.

## Quick Start

```bash
# Level-5 web (primary platform, Tailwind v4 + SurrealDB 3.0)
yarn start:surrealdb                    # Start SurrealDB via Docker
yarn schema:apply                       # Apply SurrealDB schema
yarn workspace @finance-os/web dev      # Vite dev server
yarn workspace @finance-os/worker dev   # Worker (AI + background jobs)
yarn typecheck                          # TypeScript check (run before committing)
yarn lint:fix                           # oxfmt + oxlint auto-fix
yarn test                               # All tests via lage (parallel, cached)
```

## Monorepo Structure

> **Note**: `packages/desktop-client/` was removed and archived to the `desktop-client-archive` branch.
> The Level-5 web app (`apps/web/`) is now the sole frontend platform.

### Supporting Packages (legacy, still in use)

```
packages/
  sync-server/      Express 5 backend (API + static frontend serving, SQLite)
  loot-core/        Core engine (shared types, handler bridge, DB access)
  api/              Public API package
  crdt/             CRDT sync protocol
  component-library/ @actual-app/components (Button, Input, View, Text, theme)
  desktop-electron/ Electron shell (not actively developed)
```

### Level-5 Platform: SurrealDB + Tailwind v4 (Primary)

```
apps/
  web/              React 19 + Vite + Tailwind v4 frontend (primary platform)
  gateway/          (Gateway service for ops panels — being phased out)
  ai-policy/        (Policy service — being phased out)
  sync/             (Sync service — legacy)

packages/
  design-system/    Tailwind v4 + Radix UI component library

schema/
  *.surql           SurrealDB schema definitions (tables, computed fields, API)
  apply.sh          Script to load all .surql files into SurrealDB

scripts/
  migrate-sqlite-to-surreal.ts  SQLite → SurrealDB migration tool
```

## Architecture

### Level-5 Platform: SurrealDB + Web (New Primary)

**Status**: Phase 0+1 complete (Commit 10f605461)

All client-server communication flows through SurrealDB JS SDK (WebSocket):

```
App (React + Tailwind v4)
  ↓ SurrealDB JS SDK + TypeScript SDK
SurrealDB 3.0 (DEFINE API for CRUD)
  ↓
Worker (Node.js — background jobs, Ollama AI)
```

**Tech Stack:**

| Layer              | Technology                      | Notes                                                      |
| ------------------ | ------------------------------- | ---------------------------------------------------------- |
| Frontend           | React 19 + Vite 7               | `apps/web/`                                                |
| Styling            | Tailwind CSS v4 + Radix UI      | Design tokens in `packages/design-system/`                 |
| UI Components      | @tanstack/react-query           | Data fetching + caching                                    |
| Animations         | motion/react (Framer Motion)    | Smooth transitions + AnimatePresence                        |
| Icons              | lucide-react                    | Consistent icon set                                         |
| Command Palette    | cmdk                            | 8 finance entries with tab switching                        |
| Dialog/Modals      | Radix Dialog + Popover          | Accessible overlay components                              |
| Database           | SurrealDB 3.0                   | WebSocket connection, DEFINE API                           |
| Backend            | Worker (Node.js)                | Ollama AI, background jobs, job queue                      |
| AI                 | Ollama (self-hosted)            | `mistral-small` default, `llama3.2-vision` for OCR         |

**Database Connection:**

```bash
# Local development
ws://localhost:8000
ns=finance
db=main
```

**SurrealDB Schema (`schema/*.surql`):**

| File                         | Purpose                                                           |
| ---------------------------- | ----------------------------------------------------------------- |
| `000-auth.surql`             | DEFINE ACCESS TYPE RECORD for user authentication                 |
| `001-financial-core.surql`   | `account`, `transaction`, `payee`, `category` tables              |
| `002-contracts.surql`        | `contract` with computed `health` and `annual_cost` fields        |
| `003-command-platform.surql` | `command_run`, `playbook`, `playbook_run`, `delegate_lane`        |
| `004-intelligence.surql`     | `review_item`, `classification`, `anomaly` tables                 |
| `005-api-endpoints.surql`    | DEFINE API endpoints for CRUD operations                          |
| `006-seed-german-categories.surql` | 2-level German category tree (L1 groups → L2 categories)    |

**Patterns:**

- **Record Links:** `SELECT *, payee.name AS payee_name FROM transaction` — resolves refs inline
- **Connection Guard:** `surreal-client.ts` uses shared promise to prevent concurrent `connect()` calls
- **CustomEvent Bridge:** `window.dispatchEvent(new CustomEvent('finance-tab', { detail: 'review' }))` for cross-component tab switching

### Handler Bridge Pattern (Legacy — sync-server still uses this)

loot-core's handler bridge connects client ↔ sync-server ↔ SQLite. Still used by remaining legacy packages (loot-core, sync-server, desktop-electron). The Level-5 web platform bypasses this entirely via SurrealDB WebSocket.

## What's Built

### Level-5 Web Platform (New — Phase 0+1 Complete)

**Location:** `apps/web/src/features/`

#### 1.1 Dashboard (`dashboard/`)
- DashboardPage: Time-of-day German greeting, KPI badges, 4-widget grid
- Widgets: AccountBalances (real balances), ThisMonth (income/expenses/available), UpcomingPayments (next 7 days), CashRunway (days until money runs out)

#### 1.2 Contracts (`contracts/`)
- ContractsPage: Summary metrics, search/filter, health chips (healthy/at-risk/expired)
- ContractCard: Type badges, notice period countdown
- ContractForm: Slide-over create/edit with mutations
- Health computed field: Based on notice_period_days vs. next_payment_date

#### 1.3 Calendar (`calendar/`)
- CalendarPage: Toggle between 30-day list view and month grid
- CalendarListView: Grouped by date, "Heute" marker, running balance calculation
- CalendarGridView: 7-column grid, color-coded cells for payment visibility
- useCalendarData: Projects upcoming payments from contracts + schedules

#### 1.4 Quick Add (`quick-add/`)
- QuickAddOverlay: Radix Dialog, Cmd+N shortcut, calculator input
- German presets: Einkauf, Kaffee, ÖPNV, Restaurant, Tanken
- useCalculator: Evaluates "12,50+8,30" with German comma + operator support
- useCategorySearch: Fuzzy search with prefix/contains scoring

#### 1.5 Categories (`categories/`)
- CategoriesPage: Summary stats, search, tree view
- CategoryTree: Hierarchical L1/L2 with expand/collapse
- CategoryForm: Slide-over with color picker
- CategoryColorPicker: 16 presets + custom hex input

#### 1.6 Review Queue (`review/`)
- ReviewQueuePage: Priority stats, status/type/priority filters, batch accept
- ReviewItemCard: Priority/type badges, AI suggestion display, accept/dismiss/snooze
- Per-item mutation tracking with AnimatePresence exit animations

#### 1.7 Command Palette (integrated in App.tsx)
- 8 finance entries with German labels
- CustomEvent bridge for tab switching from palette to FinancePage tabs

#### 1.8 AI Smart Matching (in Worker)
- `apps/worker/src/main.ts` classifyTransaction() → Ollama classification
- German-language prompt with all categories listed
- Confidence ≥ 0.85: auto-apply; < 0.85: review queue

**Integration:** All tabs lazy-loaded in `FinancePage.tsx` with CustomEvent listener for command palette tab switching.

**API Layer:** `apps/web/src/core/api/`
- `surreal-client.ts` — Singleton with promise-based connection guard
- `finance-api.ts` — 15+ typed SurrealQL functions: transactions, accounts, categories, contracts, reviews, dashboard, schedules, live subscriptions
- Types in `core/types/finance.ts` — Account, Transaction, Category, Contract, ReviewItem, Schedule, DashboardPulse, ThisMonthSummary

### Desktop-Client Platform (Archived)

> **Removed** — archived to `desktop-client-archive` branch. See that branch for the full legacy implementation (Phases 1-8, Emotion CSS, react-grid-layout, feature flags, etc.).

### Supporting Backend Modules (sync-server)

| Directory     | Router Mount        | Purpose                                                   |
| ------------- | ------------------- | --------------------------------------------------------- |
| `ai/`         | `/ai`               | Ollama classification, smart matching rules, review queue |
| `contracts/`  | `/contracts`        | Contract CRUD, price history, health computation          |
| `categories/` | `/categories-setup` | German category tree, Finanzguru category mapping         |

## Key Files Map

| Purpose                   | Path                                                       |
| ------------------------- | ---------------------------------------------------------- |
| German holiday engine     | `loot-core/src/shared/german-holidays.ts`                  |
| Payment deadlines         | `loot-core/src/shared/deadlines.ts`                        |
| AI classifier             | `sync-server/src/ai/classifier.ts`                         |
| German category tree data | `sync-server/src/categories/german-tree.ts`                |

## Adding a New Feature Module (Level-5)

1. Create feature directory in `apps/web/src/features/{name}/`
2. Create barrel export in `index.ts`
3. Add API functions to `apps/web/src/core/api/finance-api.ts`
4. Add types to `apps/web/src/core/types/finance.ts`
5. Add lazy import + tab in `apps/web/src/features/finance/FinancePage.tsx`
6. Add command palette entry in `apps/web/src/app/useAppState.ts`
7. Add command handler in `apps/web/src/app/App.tsx`

## Code Style & Conventions

**TypeScript:**

- Prefer `type` over `interface`, avoid `enum` (use objects/maps)
- Avoid `any`/`unknown` unless absolutely necessary
- Avoid type assertions (`as`, `!`) — prefer `satisfies`
- Use inline type imports: `import { type MyType } from '...'`
- Descriptive names with auxiliary verbs: `isLoaded`, `hasError`
- Named exports (not default exports)
- Functional/declarative patterns — avoid classes
- Use the `function` keyword for pure functions

**React:**

- Don't use `React.FC` or `React.FunctionComponent` — type props directly
- Don't use `React.*` patterns — use named imports
- Use custom hooks from `src/hooks`, not react-router directly:
  - `useNavigate()` from `src/hooks` (not react-router)
  - `useDispatch()`, `useSelector()` from `src/redux` (not react-redux)
- Use `<Link>` instead of `<a>` tags

**Imports (auto-organized by ESLint):**

1. React imports
2. Built-in Node.js modules
3. External packages
4. Actual packages (`loot-core`, `@actual-app/components`)
5. Parent/sibling/index imports

- Maintain newlines between groups

**i18n:**

- Use `Trans` component instead of `t()` function when possible
- All user-facing strings must be translated
- Generate i18n files: `yarn generate:i18n`

**Financial numbers:** Wrap with `FinancialText` or apply `styles.tnum`

**Restricted patterns:**

- Never import from `uuid` without destructuring — use `import { v4 as uuidv4 } from 'uuid'`
- Never import colors directly — use theme
- Don't directly reference platform-specific imports (`.api`, `.web`, `.electron`)

**Testing (Vitest + Playwright):**

- Minimize mocked dependencies — prefer real implementations
- Unit tests: alongside source or in `__tests__/`, extensions `.test.ts`, `.test.tsx`
- E2E tests: `packages/desktop-electron/e2e/`, Playwright
- Run all: `yarn test` (lage, parallel + cached)
- Run without cache: `yarn test:debug`
- Clear stale cache: `rm -rf .lage`

**Before committing:**

- `yarn typecheck` passes
- `yarn lint:fix` has been run
- Relevant tests pass

## Level-5 Development Guide

### Starting Development

```bash
# Terminal 1: Start SurrealDB
yarn docker:level5

# Terminal 2: Apply schema (one-time or after schema changes)
cd schema && ./apply.sh

# Terminal 3: Dev server
yarn workspace @actual-app/web dev      # Vite, hot reload on localhost:5173
```

### Creating a New Feature Module

1. **Create feature directory** in `apps/web/src/features/{feature-name}/`
2. **Export from index.ts** — enables parallel agent development without merge conflicts
3. **Add to FinancePage.tsx tabs** if it's a primary page
4. **Use existing components** from `packages/design-system/` (Button, Dialog, Input, etc.)
5. **Query SurrealDB via `apps/web/src/core/api/finance-api.ts`** — don't call sync-server handlers

### Data Flow (Level-5)

```
React Component
  ↓ useQuery/useMutation from @tanstack/react-query
    ↓ calls financeApi.* (finance-api.ts)
      ↓ SurrealQL query via surreal-client.ts
        ↓ SurrealDB (WebSocket)
          ↓ DEFINE API endpoint or raw query
```

### Code Style (Level-5)

**React + Tailwind:**

- Use `className` for Tailwind utilities (not `style={}`)
- Button pattern: `<Button variant="primary" onClick={() => {}}>`
- Dialog pattern: `<Dialog open={open} onOpenChange={setOpen}><DialogContent>...</DialogContent></Dialog>`
- Always provide `aria-label` for icon-only buttons

**TypeScript:**

- Import types from `apps/web/src/core/types/finance.ts`
- Use `type Account`, `type Transaction`, etc. (not `interface`)
- Avoid `any` — use `unknown` if necessary

**Hooks:**

- Custom hooks live in feature directory or `apps/web/src/hooks/`
- `useQuery()` for fetching (caching automatic)
- `useMutation()` for writes with `onSuccess`/`onError` handlers
- Always unsubscribe from live subscriptions in cleanup

### Critical Gotchas (Level-5)

**SurrealDB:**

- Connection is async — check `connectPromise` in `surreal-client.ts` to avoid race conditions
- Record links are resolved inline: `SELECT *, payee.name AS payee_name FROM transaction`
- CASE expressions in ORDER BY for priority sorting (e.g., review queue)

**React + Tailwind v4:**

- No more Emotion CSS — use Tailwind utilities directly
- Design tokens in `packages/design-system/` — import from there, not from CSS variables
- `motion/react` for animations (Framer Motion wrapped)

**Legacy Packages (sync-server, loot-core):**

- sync-server cannot import from loot-core. Duplicate types locally if needed.
- Express router pattern: `const app = express(); export { app as handlers };`
- `post()` unwraps `{ status: 'ok', data }` envelope automatically.

## Infrastructure

### Deployment

- **VPS**: 212.69.84.228, Docker Compose (self-hosted)
- **Registry**: `ghcr.io/grossherzogvi/actual-budget`
- **CI/CD**: GitHub Actions -> GHCR -> VPS deploy
- **Database**: SurrealDB 3.0 (docker-compose.level5.yml)
- **Ollama**: `ACTUAL_OLLAMA_URL`, `ACTUAL_OLLAMA_MODEL`, `ACTUAL_AI_ENABLED`
- **Webhooks**: `ACTUAL_WEBHOOK_URL`, `ACTUAL_WEBHOOK_SECRET`

### Local Development Environment

```bash
# SurrealDB (run once)
docker compose -f docker-compose.level5.yml up

# Apply schema (after schema changes)
cd schema && ./apply.sh

# Web app (Vite + hot reload)
yarn workspace @actual-app/web dev

# Worker (background jobs + AI)
yarn workspace @actual-app/worker dev
```

## Running Tests

```bash
yarn test                                    # All tests (lage, parallel + cached)
yarn workspace @actual-app/sync-server test  # Sync-server tests only
yarn workspace @actual-app/web test          # Level-5 web tests
yarn workspace @actual-app/sync-server vitest run src/ai/app-ai.test.ts  # Single file
```

## Roadmap

### Mega-Phase 2: "Daily Delight" (Implemented)

**Status**: Core UI complete, needs SurrealDB data wiring + real-world testing.

Built: Analytics (6 ECharts visualizations), enhanced dashboard (12-col grid, 9 widgets, intelligence), bank import (DKB/ING/Sparkasse/generic CSV parsers), budget (envelope system), intelligence (anomaly cards, spending patterns, AI explain button). Added 22 API functions, 11 types, 4 SurrealDB schema files (007-010).

### Mega-Phase 3: German Financial Ecosystem

**Focus**: Localization for German users

- Kündigungsfristen (notice period) enforcement
- German bank CSV import (MT940, CAMT.053)
- German receipt OCR via Ollama `llama3.2-vision`
- Tax export (EÜR, Umsatzsteuer)
- SEPA payment preparation
- German public holidays integration

### Mega-Phase 4: Advanced Financial Features

**Focus**: Comprehensive budgeting + goal tracking

- Envelope budgeting with rollover
- Savings goals with progress tracking
- Net worth tracking (assets + liabilities)
- Loan amortization (Tilgungsplan) calculator
- Investment portfolio tracking
- Budget-vs-actual analysis

### Mega-Phase 5: Ops Panel Wiring

**Focus**: Connect existing Level-5 ops panels to SurrealDB

- Wire command mesh (delegate lanes, focus)
- Wire intelligence panels (anomalies, suggestions)
- Wire scenario builder
- Wire playbook runner
- Real-time sync across panels

## What's Not Built Yet

**High priority:**

- Wire Mega-Phase 2 modules to real SurrealDB data (currently UI-only)
- Worker intelligence jobs (detect-anomalies, analyze-spending-patterns, explain-classification)
- Authentication on SurrealDB frontend connection
- Input validation on all API parameters

**Medium priority:**

- Category icons + colors per L1 group
- MT940/CAMT.053 bank statement formats
- Contract auto-detection after CSV import
- IBAN-based auto-categorization rules

**Low priority / future:**

- Inline editing in transaction lists
- Year overview in calendar
- Contract timeline visualization
- Full AI-during-import pipeline
- Net worth tracking, savings goals

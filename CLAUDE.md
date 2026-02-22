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
yarn start              # Dev server (browser) at localhost:5006
yarn start:server-dev   # Dev with sync server
yarn typecheck          # TypeScript check (run before committing)
yarn lint:fix           # oxfmt + oxlint auto-fix
yarn test               # All tests via lage (parallel, cached)
```

## Monorepo Structure

```
packages/
  desktop-client/   React 19 + Vite 7 frontend (main UI)
  sync-server/      Express 5 backend (API + static frontend serving)
  loot-core/        Core engine (shared types, handler bridge, DB access)
  api/              Public API package
  crdt/             CRDT sync protocol
  component-library/ @actual-app/components (Button, Input, View, Text, theme)
```

## Architecture

### Handler Bridge Pattern

All client-server communication flows through loot-core's handler bridge:

```
Client: send('handler-name', args)
  -> loot-core handler (packages/loot-core/src/server/{module}/app.ts)
    -> HTTP to sync-server (packages/sync-server/src/{module}/app-{module}.ts)
      -> SQLite (account.sqlite)
```

Each module bridge follows this pattern:
```typescript
import { createApp } from '../app';
import * as asyncStorage from '../../platform/server/asyncStorage';
import { get, post } from '../post';
import { getServer } from '../server-config';

const app = createApp<ModuleHandlers>();
app.method('handler-name', async (args) => {
  const userToken = await asyncStorage.getItem('user-token');
  const res = await post(getServer().BASE_SERVER + '/route', args, {
    'X-ACTUAL-TOKEN': userToken,
  });
  return res; // post() unwraps { status: 'ok', data: ... } envelope
});
```

**Important:** `post()` auto-unwraps the `{ status: 'ok', data }` envelope. `get()` returns raw string (parse with `JSON.parse(res)`).

### Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | React 19 + Vite 7 | `packages/desktop-client/` |
| Styling | `@emotion/css` (CSS-in-JS) | NOT Tailwind. Use theme tokens. |
| UI Primitives | `react-aria-components` | `isDisabled` not `disabled`, `onPress` not `onClick` |
| Component Library | `@actual-app/components` | View, Text, Button, Input, Card, Select, Menu, Popover |
| Command Palette | `cmdk` v1.1.1 | Existing `CommandBar.tsx` |
| Keyboard Shortcuts | `react-hotkeys-hook` v5.2.4 | GlobalKeys component |
| Dashboard Layout | `react-grid-layout` v2.2.2 | Widget drag/resize/persist |
| Charts | `recharts` | Analytics + dashboard visualizations |
| Backend | Express 5 | `packages/sync-server/` |
| Database | SQLite (account.sqlite) | Custom tables via sync-server migrations |
| AI | Ollama (self-hosted) | `mistral-small` default, `llama3.2-vision` for OCR |
| Infrastructure | Docker, GHCR CI/CD | VPS 212.69.84.228, full self-hosted |

## What's Built

### Custom Frontend Pages

All custom routes are **lazy-loaded** via `React.lazy()` + `Suspense` in `FinancesApp.tsx`:

| Route | Component | What It Does |
|-------|-----------|-------------|
| `/dashboard` | `DashboardPage` | Operations cockpit — 9 widgets in 12-column grid (react-grid-layout), edit mode, layout persistence via `useSyncedPref('dashboardLayout')` |
| `/contracts` | `ContractsPage` | Contract list with filtering, multi-select (Shift+click), batch actions, health badges |
| `/contracts/:id` | `ContractDetailPage` | Full contract detail with price history, cancellation letter generator |
| `/calendar` | `CalendarPage` | Payment calendar — 30-day grouped view, month grid, running balance, payday cycle, .ics export |
| `/analytics` | `AnalyticsPage` | Tabbed analytics — Spending by Category, Monthly Overview, Fixed vs Variable, Trends, Budget Alerts |
| `/review` | `ReviewQueuePage` | AI review queue — filters by type/priority, batch accept, dismiss, snooze |
| `/import` | `ImportPage` | Getting Started wizard + Finanzguru XLSX + German bank CSV import |
| `/tags` | `ManageTagsPage` | Tag CRUD for contract/transaction tagging |

### Custom Backend Modules (sync-server)

| Directory | Router Mount | Purpose |
|-----------|-------------|---------|
| `ai/` | `/ai` | Ollama classification, smart matching rules, review queue |
| `contracts/` | `/contracts` | Contract CRUD, price history, health computation |
| `categories/` | `/categories-setup` | German category tree, Finanzguru category mapping |

### Custom loot-core Handlers

Handler bridges at `packages/loot-core/src/server/{module}/app.ts`:
- `contracts/app.ts` — contract CRUD, scheduling, price history
- `categories-setup/app.ts` — German tree install, category mapping
- `review/app.ts` — review queue queries, actions (accept/reject/snooze/dismiss)

### Dashboard Widgets

Located in `packages/desktop-client/src/components/dashboard/widgets/`:
- `AccountBalancesWidget` — real balances via `useSheetValue`
- `ThisMonthWidget` — income/expenses/available summary
- `BalanceProjectionWidget` — threshold warnings, red zone
- `QuickAddWidget` — inline Quick Add
- `CashRunwayWidget` — days until money runs out
- `MoneyPulseWidget` — dismissible daily brief
- `AttentionQueueWidget` — urgent/review/suggestion counts
- `AvailableToSpendWidget` — balance minus committed payments
- `UpcomingPaymentsWidget` — next 7 days of payments

### Quick Add (Cmd+N)

Overlay at `packages/desktop-client/src/components/quick-add/`:
- Amount with calculator ("12.50+8.30" works)
- Category fuzzy search + frecency scoring
- Preset bar (German: Einkauf, Kaffee, OEPNV, Restaurant, Tanken) with runtime category resolution
- Save + New (Cmd+Enter), Save + Duplicate (Cmd+Shift+Enter), Park for Later (Cmd+P)
- Expense Train mode for rapid sequential entry
- Recent templates from transaction history
- +/- toggle for expense/income

### Feature Flags

Managed via `useSyncedPref('flags.{name}')`. Three files per flag:

| File | Purpose |
|------|---------|
| `loot-core/src/types/prefs.ts` | Type in `FeatureFlag` union |
| `desktop-client/src/hooks/useFeatureFlag.ts` | Default value |
| `desktop-client/src/components/settings/Experimental.tsx` | Toggle UI |

Current flags and defaults:
```
financeOS            = true   # Main gate: custom dashboard, nav, features
contractManagement   = true   # Contracts module
quickAdd             = true   # Quick Add overlay + Cmd+N
paymentCalendar      = true   # Calendar page
extendedCommandBar   = true   # Enhanced command palette
aiSmartMatching      = false  # AI classifier (built, not enabled)
reviewQueue          = false  # Review queue (built, not enabled)
germanCategories     = false  # German category tree auto-install
```

### DB Migrations

Located at `packages/sync-server/migrations/`:

| Migration | Tables Created |
|-----------|---------------|
| `1772000000000-phase1-tables.js` | contracts (enriched), price_history, contract_events, contract_tags, contract_documents, review_queue, smart_match_rules, category_frecency, quick_add_presets |
| `1773000000000-payment-deadlines.js` | payment_deadlines |

## Key Files Map

| Purpose | Path |
|---------|------|
| Express app mount | `sync-server/src/app.ts` |
| Handler type union | `loot-core/src/types/handlers.ts` |
| Handler registration | `loot-core/src/server/main.ts` |
| Feature flag types | `loot-core/src/types/prefs.ts` |
| Feature flag defaults | `desktop-client/src/hooks/useFeatureFlag.ts` |
| Route definitions | `desktop-client/src/components/FinancesApp.tsx` |
| Sidebar nav | `desktop-client/src/components/sidebar/PrimaryButtons.tsx` |
| Settings toggles | `desktop-client/src/components/settings/Experimental.tsx` |
| Global keyboard shortcuts | `desktop-client/src/components/GlobalKeys.tsx` |
| Toast system | `desktop-client/src/components/common/Toast.tsx` |
| German holiday engine | `loot-core/src/shared/german-holidays.ts` |
| Payment deadlines | `loot-core/src/shared/deadlines.ts` |
| AI classifier | `sync-server/src/ai/classifier.ts` |
| German category tree data | `sync-server/src/categories/german-tree.ts` |

## Adding a New Module (Checklist)

Every new module touches these files:

1. `sync-server/src/app.ts` — mount Express router
2. `loot-core/src/types/handlers.ts` — import + add to `Handlers` union
3. `loot-core/src/server/main.ts` — import + `app.combine()`
4. `loot-core/src/types/prefs.ts` — add to `FeatureFlag` union
5. `desktop-client/src/hooks/useFeatureFlag.ts` — add default (`false`)
6. `desktop-client/src/components/FinancesApp.tsx` — lazy import + `<Route element={}>`
7. `desktop-client/src/components/sidebar/PrimaryButtons.tsx` — nav item
8. `desktop-client/src/components/settings/Experimental.tsx` — `FeatureToggle`

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
- Never import `@actual-app/web/*` in `loot-core`
- Don't directly reference platform-specific imports (`.api`, `.web`, `.electron`)

**Testing (Vitest + Playwright):**
- Minimize mocked dependencies — prefer real implementations
- Unit tests: alongside source or in `__tests__/`, extensions `.test.ts`, `.test.tsx`
- E2E tests: `packages/desktop-client/e2e/`, Playwright
- Run all: `yarn test` (lage, parallel + cached)
- Run without cache: `yarn test:debug`
- Clear stale cache: `rm -rf .lage`

**Before committing:**
- `yarn typecheck` passes
- `yarn lint:fix` has been run
- Relevant tests pass

## Critical Gotchas

**Routing:**
- All custom routes use `React.lazy()` + `Suspense`. Define lazy const at top of FinancesApp.tsx, use `element={}` on `<Route>`.
- Import `useParams` from `'react-router'`, not `'react-router-dom'`. React Router v7 merged them.

**Components:**
- Button uses `isDisabled`, not `disabled` (react-aria).
- Button `onPress` receives `PressEvent`, not `MouseEvent`. Don't type the event param.
- Use `@actual-app/components` primitives (View, Text, Button, Input) — not raw HTML.
- Modal pattern: `dispatch(replaceModal({ modal: { name: 'modal-name', options: {} } }))`.

**Data:**
- sync-server cannot import from loot-core. Duplicate types locally if needed.
- DB migrations: use named import `{ getAccountDb }`, not default import.
- Express router pattern: `const app = express(); export { app as handlers };`
- `post()` unwraps `{ status: 'ok', data }` envelope automatically.
- `db.insertCategoryGroup()` and `db.insertCategory()` throw on duplicate — always wrap in try/catch.

**Hooks:**
- Hooks that call `send()` (loot-core handlers) are async. State updates from async calls trigger re-renders — design components to handle loading states.
- `useSyncedPref(key)` returns `[value, setValue]`. Value may be `undefined` before sync.

## Infrastructure

- **VPS**: 212.69.84.228, Docker Compose
- **Registry**: `ghcr.io/grossherzogvi/actual-budget`
- **CI/CD**: GitHub Actions -> GHCR -> VPS deploy
- **Ollama**: `ACTUAL_OLLAMA_URL`, `ACTUAL_OLLAMA_MODEL`, `ACTUAL_AI_ENABLED`
- **Webhooks**: `ACTUAL_WEBHOOK_URL`, `ACTUAL_WEBHOOK_SECRET`

## Running Tests

```bash
yarn test                                    # All tests (lage, parallel + cached)
yarn workspace @actual-app/sync-server test  # Sync-server tests only
yarn workspace @actual-app/sync-server vitest run src/ai/app-ai.test.ts  # Single file
```

## What's Not Built Yet

**High priority (features exist but need wiring):**
- Enable `aiSmartMatching` and `reviewQueue` flags (features are built, just disabled)
- Contract auto-detection after import (backend `detectRecurringPatterns()` exists, modal flow not connected)
- Breadcrumbs component exists but not integrated into page layout

**Medium priority:**
- Category icons + colors per L1 group
- Import advisor with real statistics
- MT940/CAMT.053 bank statement formats

**Low priority / future:**
- Inline editing in transaction lists
- Year overview in calendar
- Contract timeline visualization
- IBAN-based auto-categorization rules
- Full AI-during-import pipeline
- Envelope budgeting with rollover
- Savings goals
- Loan tracking (Tilgungsplan)

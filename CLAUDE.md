# Actual Budget++ (Fork)

Personal fork of [Actual Budget](https://github.com/actualbudget/actual) with AI classification, contract management, cashflow forecasting, document processing, and intelligence features.

> For upstream coding conventions, testing patterns, and style rules see [AGENTS.md](./AGENTS.md).

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
  desktop-client/   React 19 + Vite 7 frontend
  sync-server/      Express 5 backend (serves API + static frontend)
  loot-core/        Core engine (shared types, handler bridge)
  api/              Public API package
  crdt/             CRDT sync protocol
  component-library/ @actual-app/components (Button, Input, View, Text, theme)
```

## Fork Additions

### Custom Modules (all in `packages/sync-server/src/`)

| Directory | Router | Purpose |
|-----------|--------|---------|
| `ai/` | `/ai` | Ollama classification, batch processing, rule suggestions |
| `contracts/` | `/contracts` | Contract CRUD, cancellation tracking |
| `documents/` | `/documents` | Upload, OCR via Ollama vision, invoice extraction |
| `forecast/` | `/forecast` | Balance projection, scenario engine |
| `intelligence/` | `/intelligence` | Automated insights + recommendations |
| `nl-query/` | `/nl-query` | Natural language query via Ollama |
| `events/` | — | Typed event bus (cross-module pub/sub) |

### Handler Bridge (loot-core)

Client calls `send('handler-name', args)` -> loot-core handler -> HTTP to sync-server -> Express route -> DB.

Each module has a bridge at `packages/loot-core/src/server/{module}/app.ts`:
```typescript
const app = createApp<ModuleHandlers>();
app.method('handler-name', async (args) => {
  const userToken = await asyncStorage.getItem('user-token');
  const res = await get(getServer().BASE_SERVER + '/route', {
    headers: { 'X-ACTUAL-TOKEN': userToken },
  });
  return JSON.parse(res).data;
});
```

### Frontend Pages (desktop-client)

| Directory | Route | Feature Flag |
|-----------|-------|-------------|
| `components/ai/` | `/ai-review` | `aiClassification` |
| `components/contracts/` | `/contracts`, `/contracts/:id` | `contractManagement` |
| `components/documents/` | `/documents`, `/documents/:id` | `documentPipeline` |
| `components/forecast/` | `/forecast` | `forecastEngine` |

Dashboard widgets: `components/reports/reports/{AIStatsCard,ContractsCard,ForecastCard}.tsx`

### DB Tables (account.sqlite)

Custom tables via migrations at `packages/sync-server/migrations/`:
- `contracts`, `contract_documents`, `invoices`, `expected_events`
- `ai_classifications`, `ai_audit_log`, `ai_rule_suggestions`

## Adding a New Module (Checklist)

10 files need changes for every new module:

1. `sync-server/src/app.ts` — mount Express router
2. `loot-core/src/types/handlers.ts` — import + add to `Handlers` union
3. `loot-core/src/server/main.ts` — import + `app.combine()`
4. `loot-core/src/types/prefs.ts` — add to `FeatureFlag` union
5. `desktop-client/src/hooks/useFeatureFlag.ts` — add default (`false`)
6. `desktop-client/src/components/FinancesApp.tsx` — eager import + `element={}` route
7. `desktop-client/src/components/sidebar/PrimaryButtons.tsx` — nav item
8. `desktop-client/src/components/settings/Experimental.tsx` — `FeatureToggle`
9. `loot-core/src/types/models/dashboard.ts` — widget type in `SpecializedWidget` union
10. `desktop-client/src/components/reports/Overview.tsx` — widget menu item + render case

## Critical Gotchas

- **NO lazy routes.** App uses `<BrowserRouter>` (React Router v7 library mode). The `lazy` prop on `<Route>` is silently ignored. Use eager imports + `element={}`.
- **Import `useParams` from `'react-router'`**, not `'react-router-dom'`. v7 merged them.
- **Button uses `isDisabled`**, not `disabled` (react-aria).
- **Button `onPress`** receives `PressEvent`, not `MouseEvent`. Don't type the event param.
- **sync-server cannot import from loot-core.** Duplicate types locally if needed.
- **Feature flags** require 3 files: type in `prefs.ts`, default in `useFeatureFlag.ts`, toggle in `Experimental.tsx`.
- **DB migrations**: use named import `{ getAccountDb }`, not default import.
- **Express router pattern**: `const app = express(); export { app as handlers };`

## Infrastructure

- **VPS**: 212.69.84.228, Docker via `ghcr.io/grossherzogvi/actual-budget`
- **CI/CD**: GitHub Actions -> GHCR -> VPS deploy
- **Ollama**: env vars `ACTUAL_OLLAMA_URL`, `ACTUAL_OLLAMA_MODEL`, `ACTUAL_AI_ENABLED`
- **Webhooks**: env vars `ACTUAL_WEBHOOK_URL`, `ACTUAL_WEBHOOK_SECRET`

## Running Tests

```bash
# All tests (via lage, parallel + cached)
yarn test

# Specific sync-server tests
yarn workspace @actual-app/sync-server run test

# Single test file
yarn workspace @actual-app/sync-server run vitest run src/ai/app-ai.test.ts
```

108 custom tests across 8 suites: contracts (20), forecast-engine (12), forecast-scenarios (9), ai (22), documents (20), event-bus (8), intelligence (5), nl-query (12).

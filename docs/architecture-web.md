# Finance OS — Architecture: Web Frontend

**Generated:** 2026-02-26
**Part:** `apps/web/` (`@finance-os/web`)
**Architecture Pattern:** Feature-sliced SPA with database-as-API

---

## Executive Summary

The web frontend is a React 19 SPA that communicates exclusively with SurrealDB via WebSocket. There is no traditional REST API layer — `finance-api.ts` sends SurrealQL directly to the database. All business logic that doesn't need background execution lives in the frontend; background work is dispatched via the `job_queue` SurrealDB table.

---

## Technology Stack

| Category | Technology | Version | Rationale |
|----------|-----------|---------|-----------|
| Framework | React | 19.2.4 | Concurrent features, latest hooks |
| Build | Vite | ^7.3.1 | Fast HMR, ESM-native |
| Styling | Tailwind CSS | v4.2.0 | No runtime CSS-in-JS overhead |
| UI Components | Radix UI | various | Accessible primitives, unstyled |
| Data Fetching | TanStack Query | ^5.90.20 | Cache, stale-while-revalidate |
| Animations | motion/react | ^12.23.24 | Framer Motion v12 API |
| Database SDK | surrealdb | 1.3.2 | WebSocket client |
| Charts | ECharts | ^6.0.0 | Performance at scale |
| Icons | lucide-react | ^0.575.0 | Consistent icon set |
| Command Palette | cmdk | ^1.1.1 | Keyboard-first navigation |
| Testing | Vitest + Testing Library | ^4.0.8 | Co-located unit tests |
| Types | TypeScript | ^5.9.3 | Strict mode |

---

## Architecture Pattern: Feature-Sliced SPA

```
┌─────────────────────────────────────────────────────────────┐
│                        App Shell                             │
│  App.tsx → ConnectionStatus + CommandPalette + QuickAdd     │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                      FinancePage                             │
│  12 lazy-loaded tabs (dashboard, transactions, contracts…)   │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                    Feature Modules                           │
│  features/{name}/ — self-contained: components + hooks + API│
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                    Infrastructure Layer                      │
│  core/api/finance-api.ts → surreal-client.ts (singleton)    │
└──────────────────────────┬──────────────────────────────────┘
                           │
                    SurrealDB WebSocket
```

---

## Key Architectural Decisions

### 1. Database-as-API (No REST Layer)
SurrealQL queries live in `finance-api.ts` and execute directly against SurrealDB. This eliminates the traditional sync-server/REST API layer and enables record link traversal (resolving related records in a single query).

### 2. Connection Singleton with Promise Guard
`surreal-client.ts` prevents race conditions from concurrent connection attempts:
```typescript
// Only one connect() call can proceed; all others await the same promise
if (connectionPromise) return connectionPromise;
```
`versionCheck: false` bypasses SDK 1.x's infinite loop against SurrealDB 3.0's version string.

### 3. Lazy-Loaded Feature Modules
All 11 feature pages are `React.lazy()` loaded. `FinancePage.tsx` is a pure tab router — feature modules are completely independent. This means:
- Zero bundle cost for inactive tabs at startup
- Agents can implement features independently without merge conflicts
- Failed tab loads are isolated by `Suspense` fallbacks

### 4. CustomEvent Bridge for Cross-Module Communication
The command palette (in `App.tsx`) and the tab router (`FinancePage.tsx`) communicate via DOM events — no shared state:
```typescript
window.dispatchEvent(new CustomEvent('finance-tab', { detail: 'review' }))
```
This avoids prop drilling through the app shell.

### 5. TanStack Query as State Manager
No Redux or Zustand. All server state is managed by TanStack Query:
- `useQuery` for reads (automatic caching, stale-while-revalidate)
- `useMutation` for writes (`onSuccess` invalidates relevant queries)
- `queryKey` design: `['transactions', { accountId, categoryId }]` for granular invalidation

---

## Data Flow

```
Feature Component
  ↓ useQuery(['transactions', opts])
    ↓ queryFn: () => listTransactions(opts)
      ↓ finance-api.ts: await connect(); db.query(...)
        ↓ SurrealDB WebSocket (ws://localhost:8000)
          ↓ Returns typed result
        ↑ Transaction[]
      ↑ returns from queryFn
    ↑ TanStack Query caches, provides loading/error state
  ↑ Component renders
```

---

## Component Architecture

### Naming Conventions
- **Pages:** `{Feature}Page.tsx` — full-page views
- **Widgets:** `{Name}Widget.tsx` — dashboard grid cells
- **Forms:** `{Entity}Form.tsx` — slide-over Dialog forms
- **Hooks:** `use{CapitalizedName}.ts` — data hooks co-located with feature
- **Utils:** `{domain}-utils.ts` — pure functions (no React)

### Design System
- Tailwind v4 CSS variables via `packages/design-system/`
- Custom classes: `fo-app-shell`, `fo-topbar`, `fo-panel`, `fo-row`, `fo-stack`
- Financial numbers use `tnum` (tabular numbers) for alignment

---

## Testing Strategy

Tests live alongside source files in `__tests__/` subdirectories or as `.test.ts` siblings.

**Current test coverage:**
- `features/calendar/__tests__/holidays.test.ts` — German holiday engine
- `features/import/parsers/__tests__/mt940.test.ts` — MT940 parser
- `features/import/parsers/__tests__/camt053.test.ts` — CAMT.053 parser
- `features/sepa/__tests__/sepa-xml.test.ts` — SEPA XML generation
- `features/sepa/__tests__/iban-utils.test.ts` — IBAN validation
- `features/tax/__tests__/tax-category-map.test.ts` — Tax category mapping
- `app/App.test.tsx` — App-level smoke tests

**Run:** `yarn workspace @finance-os/web test` (Vitest, no browser required — jsdom)

---

## Security Considerations

- SurrealDB auth credentials in `.env` (never committed) via `VITE_SURREALDB_USER`/`VITE_SURREALDB_PASS`
- Auth baked into `connect()` options so reconnects automatically re-authenticate
- `versionCheck: false` is a known workaround for SDK 1.x / SurrealDB 3.0 compatibility

---

## Performance Characteristics

- Bundle split at tab level (12 lazy chunks)
- SurrealDB live subscriptions for real-time transaction updates (no polling)
- Dashboard pulse uses multi-statement SurrealQL (4 queries in 1 round-trip)
- Analytics queries computed server-side in SurrealQL (no client-side aggregation for large datasets)

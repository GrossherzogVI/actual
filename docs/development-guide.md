# Finance OS — Development Guide

**Generated:** 2026-02-26

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 20+ (LTS) | `nvm install --lts` |
| Yarn | 4.x (Berry) | `corepack enable` |
| Docker | 24+ | [docker.com](https://docker.com) |
| TypeScript | ^5.9.3 | Bundled in workspace |

**Optional (for AI features):**
- Ollama installed locally: [ollama.ai](https://ollama.ai)
- Models: `ollama pull mistral-small` + `ollama pull llama3.2-vision`

---

## Initial Setup

```bash
# Clone and install dependencies
git clone https://github.com/GrossherzogVI/actual.git actual-budget
cd actual-budget
yarn install

# Copy env template
cp apps/web/.env.example apps/web/.env          # if exists, else see below
cp apps/worker/.env.example apps/worker/.env    # if exists, else see below
```

**Minimum `.env` for `apps/web/`:**
```env
VITE_SURREALDB_URL=ws://localhost:8000
VITE_SURREALDB_NS=finance
VITE_SURREALDB_DB=main
VITE_SURREALDB_USER=root
VITE_SURREALDB_PASS=root
```

**Minimum env for `apps/worker/`** (via shell or `.env`):
```env
SURREALDB_URL=ws://localhost:8000
SURREALDB_NS=finance
SURREALDB_DB=main
SURREALDB_USER=root          # REQUIRED — worker throws if missing
SURREALDB_PASS=root          # REQUIRED — worker throws if missing
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=mistral-small
```

---

## Starting Development

Run in separate terminals:

```bash
# Terminal 1: SurrealDB (run once, persists data in Docker volume)
docker compose -f docker-compose.level5.yml up

# Terminal 2: Apply schema (run once, and after schema changes)
cd schema && ./apply.sh

# Terminal 3: Web frontend (hot reload)
yarn workspace @finance-os/web dev
# Opens http://localhost:5173

# Terminal 4: Worker (optional, for AI/import features)
yarn workspace @finance-os/worker dev
```

---

## Key Development Commands

### Root workspace
```bash
yarn typecheck           # TypeScript check across all packages
yarn lint:fix            # oxfmt + oxlint auto-fix
yarn test                # All tests via lage (parallel + cached)
yarn test:debug          # All tests without cache
```

### Web frontend (`apps/web/`)
```bash
yarn workspace @finance-os/web dev        # Vite dev server (HMR)
yarn workspace @finance-os/web build      # Production build to dist/
yarn workspace @finance-os/web typecheck  # TypeScript only
yarn workspace @finance-os/web test       # Vitest (jsdom, no browser)
```

### Worker (`apps/worker/`)
```bash
yarn workspace @finance-os/worker dev     # tsx watch mode (auto-restart)
yarn workspace @finance-os/worker start   # Production mode
yarn workspace @finance-os/worker typecheck
```

### Schema
```bash
cd schema && ./apply.sh   # Apply all .surql files to SurrealDB
```

### Docker
```bash
docker compose -f docker-compose.level5.yml up      # Start SurrealDB
docker compose -f docker-compose.level5.yml down     # Stop + remove containers
docker compose -f docker-compose.level5.yml down -v  # Stop + wipe data volume (DESTRUCTIVE)
```

---

## Adding a Feature Module

Follow this exact pattern to maintain agent-safe independence:

1. **Create feature directory:**
   ```
   apps/web/src/features/{feature-name}/
   ├── {Feature}Page.tsx    # Main page component
   ├── index.ts             # Barrel export
   └── use{Feature}Data.ts  # Data hook (optional)
   ```

2. **Add API functions** to `apps/web/src/core/api/finance-api.ts`

3. **Add types** to `apps/web/src/core/types/finance.ts`

4. **Register in FinancePage.tsx:**
   ```typescript
   // Add lazy import
   const MyFeaturePage = lazy(() =>
     import('../my-feature/MyFeaturePage').then(m => ({ default: m.MyFeaturePage }))
   );

   // Add to TABS array
   { id: 'my-feature', label: 'Mein Feature', icon: SomeIcon }

   // Add tab content
   {activeTab === 'my-feature' && (
     <Suspense fallback={<TabFallback />}>
       <MyFeaturePage />
     </Suspense>
   )}
   ```

5. **Add command palette entry** in `apps/web/src/app/useAppState.ts`

6. **Add TAB_MAP entry** in `apps/web/src/app/App.tsx`

7. **Create SurrealDB schema** if needed: `schema/0NN-{name}.surql`

---

## Adding a Worker Job

1. Add handler logic in `apps/worker/src/main.ts` `processQueueJob()`:
   ```typescript
   case 'my-job':
     await myJobHandler(job.payload);
     break;
   ```

2. For complex handlers, create `apps/worker/src/handlers/my-job.ts`:
   ```typescript
   export async function handleMyJob(
     db: Surreal,
     config: WorkerConfig,
     payload: Record<string, unknown>
   ): Promise<void> { ... }
   ```

3. Register in `apps/worker/src/handlers/index.ts`

4. Enqueue from web:
   ```typescript
   await db.query(
     `CREATE job_queue SET name = 'my-job', payload = $payload, status = 'pending',
      attempt = 0, visible_at = time::now(), created_at = time::now()`,
     { payload: { ... } }
   );
   ```

---

## Code Style (enforced)

**TypeScript:**
- `type` over `interface`
- No `enum` — use `const` objects or string unions
- No `any`/`unknown` without justification
- Named exports only (no default exports)
- `function` keyword for pure functions

**React:**
- No `React.FC` — type props directly: `function MyComponent({ prop }: { prop: string })`
- Named imports: `import { useState, useEffect } from 'react'`
- `useQuery`/`useMutation` for all data fetching — no raw `useEffect` + fetch

**Imports (ordered by ESLint):**
1. React
2. Node.js builtins
3. External packages
4. Internal packages
5. Relative imports

**Tailwind:**
- Use `className` — no `style={}` for layout
- Custom design tokens via CSS variables: `var(--fo-text)`, `var(--fo-muted)`, etc.
- Financial numbers: `tnum` class for tabular alignment

**Before every commit:**
```bash
yarn typecheck && yarn lint:fix
```

---

## Testing Approach

**Unit tests (Vitest + jsdom):** Test pure logic and parsers without a browser.
```bash
yarn workspace @finance-os/web test
# Run single file:
yarn workspace @finance-os/web vitest run src/features/import/parsers/__tests__/mt940.test.ts
```

**Key test files:**
- `features/calendar/__tests__/holidays.test.ts` — Holiday calculation
- `features/import/parsers/__tests__/mt940.test.ts` — MT940 parsing
- `features/import/parsers/__tests__/camt053.test.ts` — CAMT.053 parsing
- `features/sepa/__tests__/sepa-xml.test.ts` — SEPA XML generation
- `features/sepa/__tests__/iban-utils.test.ts` — IBAN validation
- `features/tax/__tests__/tax-category-map.test.ts` — Tax category mapping

**Test conventions:**
- Co-locate tests in `__tests__/` subdirectory
- Extension: `.test.ts` or `.test.tsx`
- Minimize mocks — test real logic

---

## Debugging

**SurrealDB connection issues:**
```bash
# Check SurrealDB is running
curl http://localhost:8000/health

# Query directly
surreal sql --conn ws://localhost:8000 --user root --pass root --ns finance --db main
```

**Worker logs:** Worker logs to stdout with structured format:
```
[2026-02-26T00:00:00.000Z][worker:queue] completed job=classify-transaction ms=1234
[2026-02-26T00:00:00.000Z][worker:classify] txn:abc123 → category:lebensmittel (0.92) — auto-applied
```

**Stale test cache:**
```bash
rm -rf .lage && yarn test
```

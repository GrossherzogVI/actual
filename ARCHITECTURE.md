# Phase 1 Architecture — "Start Using It"

> Input: [REQUIREMENTS.md](./REQUIREMENTS.md) | Output: Implementation blueprint for `/sc:implement`
>
> This document maps every Phase 1 feature to concrete files, schemas, APIs, and component trees.

---

## 1. System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  FRONTEND (desktop-client)                                       │
│  React 19 + Vite 7 + @emotion/css + react-aria-components       │
│                                                                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │Dashboard │ │Contracts │ │Calendar  │ │Review    │            │
│  │Page      │ │Page      │ │Page      │ │Queue     │            │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘            │
│       │             │             │             │                  │
│  ┌────┴─────────────┴─────────────┴─────────────┴─────────┐      │
│  │  Handler Bridge: send('handler-name', args)             │      │
│  │  (loot-core/src/server/*/app.ts)                        │      │
│  └────────────────────────┬────────────────────────────────┘      │
│       CommandBar (⌘K) │ QuickAdd (⌘N) │ GlobalKeys               │
└───────────────────────┼───────────────┼──────────────────────────┘
                        │               │
                        ▼               ▼
┌─────────────────────────────────────────────────────────────────┐
│  HANDLER BRIDGE (loot-core)                                      │
│                                                                   │
│  Contracts → HTTP GET/POST/PATCH/DELETE → sync-server /contracts  │
│  Schedules → direct SQLite (db.sqlite) via existing handlers     │
│  Categories → direct SQLite via existing handlers                │
│  AI Matching → HTTP → sync-server /ai                            │
│  Review Queue → HTTP → sync-server /review                       │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  BACKEND (sync-server)                                           │
│  Express 5 routes → account.sqlite                               │
│                                                                   │
│  /contracts  — Enriched contract CRUD                            │
│  /ai         — Smart Matching (refactored)                       │
│  /review     — Unified review queue (NEW)                        │
│  /import     — Finanzguru + CSV import (NEW)                     │
│  /categories-setup — German tree seeding (NEW)                   │
└─────────────────────────────────────────────────────────────────┘
```

**Key architectural principle:** Contracts are stored in `account.sqlite` (sync-server side). They reference Actual's schedule system (stored in `db.sqlite`, loot-core side) via `schedule_id`. The frontend orchestrates both through the handler bridge.

---

## 2. Database Schema

### 2.1 Enriched Contracts Table (account.sqlite)

**Replaces** the existing `contracts` table from the scaffold.

```sql
-- Migration: 20260222_001_contracts_v2.sql

DROP TABLE IF EXISTS contract_documents;
DROP TABLE IF EXISTS contracts;

CREATE TABLE contracts (
  id TEXT PRIMARY KEY,

  -- Identity
  name TEXT NOT NULL,
  provider TEXT,
  type TEXT NOT NULL DEFAULT 'other'
    CHECK(type IN ('subscription','insurance','utility','loan','membership','rent','tax','other')),
  category_id TEXT,              -- references loot-core category (cross-db)

  -- Payment link
  schedule_id TEXT,              -- references loot-core schedules.id (cross-db, nullable for free trials)
  amount INTEGER,                -- in cents (Actual's integer format)
  currency TEXT DEFAULT 'EUR',
  interval TEXT NOT NULL DEFAULT 'monthly'
    CHECK(interval IN ('weekly','monthly','quarterly','semi-annual','annual','custom')),
  custom_interval_days INTEGER,  -- only when interval='custom'
  payment_account_id TEXT,       -- references loot-core accounts.id (cross-db)

  -- Contract terms
  start_date TEXT,               -- ISO date YYYY-MM-DD
  end_date TEXT,                 -- NULL = indefinite
  notice_period_months INTEGER DEFAULT 0,
  auto_renewal INTEGER DEFAULT 1, -- boolean
  cancellation_deadline TEXT,     -- computed: end_date - notice_period (stored for query efficiency)

  -- Status & health
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('active','expiring','cancelled','paused','discovered')),

  -- Meta
  notes TEXT,
  iban TEXT,
  counterparty TEXT,

  -- Timestamps
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),

  -- Soft delete
  tombstone INTEGER DEFAULT 0
);

CREATE INDEX idx_contracts_schedule ON contracts(schedule_id);
CREATE INDEX idx_contracts_status ON contracts(status);
CREATE INDEX idx_contracts_category ON contracts(category_id);
CREATE INDEX idx_contracts_type ON contracts(type);
CREATE INDEX idx_contracts_cancellation ON contracts(cancellation_deadline);
```

### 2.2 Contract Price History

```sql
CREATE TABLE contract_price_history (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  old_amount INTEGER NOT NULL,    -- cents
  new_amount INTEGER NOT NULL,    -- cents
  change_date TEXT NOT NULL,
  reason TEXT,                     -- 'price_increase', 'plan_change', 'negotiated', 'manual'
  detected_by TEXT DEFAULT 'manual', -- 'manual', 'ai_mismatch', 'import'
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_price_history_contract ON contract_price_history(contract_id);
```

### 2.3 Contract Additional Events

```sql
-- For annual fees, one-time charges, etc. beyond the primary schedule
CREATE TABLE contract_events (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount INTEGER NOT NULL,         -- cents
  interval TEXT NOT NULL DEFAULT 'annual'
    CHECK(interval IN ('one_time','monthly','quarterly','semi-annual','annual')),
  month INTEGER,                   -- 1-12 for annual events
  day INTEGER,                     -- day of month
  next_date TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_contract_events_contract ON contract_events(contract_id);
```

### 2.4 Contract Tags (junction table)

```sql
CREATE TABLE contract_tags (
  contract_id TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  PRIMARY KEY (contract_id, tag)
);
```

### 2.5 Contract Documents

```sql
CREATE TABLE contract_documents (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  mime_type TEXT,
  file_path TEXT NOT NULL,         -- relative path in server files
  uploaded_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_contract_docs_contract ON contract_documents(contract_id);
```

### 2.6 AI Review Queue

```sql
CREATE TABLE review_queue (
  id TEXT PRIMARY KEY,

  -- Item classification
  type TEXT NOT NULL
    CHECK(type IN (
      'uncategorized',          -- transaction needs category
      'low_confidence',         -- AI <85% confidence
      'recurring_detected',     -- potential new contract
      'amount_mismatch',        -- schedule amount differs from transaction
      'budget_suggestion',      -- AI budget recommendation
      'parked_expense'          -- user parked for later
    )),
  priority TEXT NOT NULL DEFAULT 'review'
    CHECK(priority IN ('urgent','review','suggestion')),

  -- References (nullable, depends on type)
  transaction_id TEXT,
  contract_id TEXT,
  schedule_id TEXT,

  -- AI data
  ai_suggestion TEXT,             -- JSON: { category_id, confidence, payee_pattern, etc. }
  ai_confidence REAL,             -- 0.0 to 1.0

  -- State
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','accepted','rejected','snoozed','dismissed')),
  snoozed_until TEXT,

  -- Resolution
  resolved_at TEXT,
  resolved_action TEXT,            -- what the user did

  -- Meta
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_review_queue_status ON review_queue(status);
CREATE INDEX idx_review_queue_type ON review_queue(type);
CREATE INDEX idx_review_queue_priority ON review_queue(priority);
CREATE INDEX idx_review_queue_transaction ON review_queue(transaction_id);
```

### 2.7 AI Smart Matching Rules

```sql
-- Extends the existing ai_classifications table
-- Tracks per-payee matching confidence and pinned status
CREATE TABLE smart_match_rules (
  id TEXT PRIMARY KEY,

  -- Match criteria
  payee_pattern TEXT NOT NULL,     -- exact match or regex
  match_type TEXT NOT NULL DEFAULT 'exact'
    CHECK(match_type IN ('exact','contains','regex','iban')),

  -- Assignment
  category_id TEXT NOT NULL,       -- target category

  -- Confidence tracking
  tier TEXT NOT NULL DEFAULT 'ai_low'
    CHECK(tier IN ('pinned','ai_high','ai_low')),
  confidence REAL DEFAULT 0.0,
  match_count INTEGER DEFAULT 0,
  correct_count INTEGER DEFAULT 0,
  last_matched_at TEXT,

  -- Meta
  created_by TEXT DEFAULT 'user',  -- 'user', 'ai', 'import'
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_smart_match_payee ON smart_match_rules(payee_pattern);
CREATE INDEX idx_smart_match_tier ON smart_match_rules(tier);
```

### 2.8 Quick Add Frecency

```sql
-- Tracks category selection frequency and recency for fuzzy search ranking
CREATE TABLE category_frecency (
  category_id TEXT PRIMARY KEY,
  use_count INTEGER DEFAULT 0,
  last_used_at TEXT,
  score REAL DEFAULT 0.0           -- computed: count * recency_weight
);

-- User-pinned presets for Quick Add
CREATE TABLE quick_add_presets (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  icon TEXT,                        -- emoji or icon name
  amount INTEGER,                   -- default amount in cents (nullable)
  category_id TEXT,
  payee TEXT,
  account_id TEXT,
  sort_order INTEGER DEFAULT 0,
  is_auto INTEGER DEFAULT 0,       -- 0=user-pinned, 1=auto-learned
  use_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
```

---

## 3. Backend API Design (sync-server)

### 3.1 Contracts Router — `/contracts`

**File:** `packages/sync-server/src/contracts/app-contracts.ts` (rewrite existing)

```
GET    /contracts                   → list (filter: status, type, category, search)
GET    /contracts/:id               → get single with price_history, events, tags, documents
POST   /contracts                   → create (optionally creates Actual schedule)
PATCH  /contracts/:id               → update fields
DELETE /contracts/:id               → soft delete (tombstone=1)

GET    /contracts/:id/price-history → price change timeline
POST   /contracts/:id/price-change  → log a price change + update schedule

GET    /contracts/:id/events        → additional payment events
POST   /contracts/:id/events        → add event
DELETE /contracts/:id/events/:eid   → remove event

POST   /contracts/:id/tags          → set tags (replaces all)
POST   /contracts/:id/documents     → upload document (multipart)

GET    /contracts/summary            → { total_monthly, total_annual, by_type, by_status }
GET    /contracts/expiring           → contracts with deadline within N days
POST   /contracts/discover           → AI: scan transactions for recurring patterns
POST   /contracts/bulk-import        → import from Finanzguru/CSV data
```

**Response shape (single contract):**

```json
{
  "status": "ok",
  "data": {
    "id": "uuid",
    "name": "Netflix",
    "provider": "Netflix Inc.",
    "type": "subscription",
    "category_id": "cat-uuid",
    "schedule_id": "sched-uuid",
    "amount": -1299,
    "interval": "monthly",
    "payment_account_id": "acc-uuid",
    "start_date": "2024-01-15",
    "end_date": null,
    "notice_period_months": 0,
    "auto_renewal": true,
    "cancellation_deadline": null,
    "status": "active",
    "health": "green",
    "notes": null,
    "iban": null,
    "tags": ["Streaming"],
    "annual_cost": -15588,
    "cost_per_day": -43,
    "price_history": [],
    "additional_events": [],
    "documents": []
  }
}
```

**Computed fields** (not stored, calculated on read):

- `health`: green (ok) / yellow (renewal within 60 days) / red (cancellation deadline within 30 days)
- `annual_cost`: amount \* intervals_per_year + sum(additional_events annualized)
- `cost_per_day`: annual_cost / 365
- `cancellation_deadline`: end_date - notice_period_months (stored for indexing, recomputed on update)

### 3.2 Review Queue Router — `/review` (NEW)

**File:** `packages/sync-server/src/review/app-review.ts`

```
GET    /review                      → list pending items (filter: type, priority)
GET    /review/count                → { pending: 5, urgent: 1, review: 3, suggestion: 1 }
PATCH  /review/:id                  → update status (accept, reject, snooze, dismiss)
POST   /review/batch                → batch accept/reject by IDs
POST   /review/:id/apply            → apply suggestion (categorize transaction, create contract, etc.)
DELETE /review/:id                  → dismiss permanently
```

### 3.3 AI Smart Matching Router — `/ai` (refactor existing)

**File:** `packages/sync-server/src/ai/app-ai.ts` (refactor)

Keep existing Ollama integration. Add:

```
POST   /ai/classify                 → classify single transaction → { category_id, confidence, tier }
POST   /ai/classify-batch           → classify array of transactions
GET    /ai/rules                    → list smart match rules
POST   /ai/rules                    → create/update pinned rule
DELETE /ai/rules/:id                → delete rule
POST   /ai/learn                    → user correction → update rule confidence
GET    /ai/stats                    → { total_rules, auto_rate, review_rate, accuracy }
```

**Smart Matching flow:**

```
Transaction arrives →
  1. Check pinned rules (exact payee match) → ASSIGN, confidence=1.0
  2. Check AI high rules (>85% accuracy, >5 matches) → ASSIGN silently
  3. No match OR low confidence → Ollama classify →
     if confidence >85% → ASSIGN + sparkle badge
     if confidence <85% → ASSIGN + add to review queue
```

### 3.4 Import Router — `/import` (NEW)

**File:** `packages/sync-server/src/import/app-import.ts`

```
POST   /import/finanzguru           → parse XLSX, return preview
POST   /import/finanzguru/commit    → commit mapped data
POST   /import/csv                  → parse CSV, auto-detect bank format, return preview
POST   /import/csv/commit           → commit mapped data
GET    /import/bank-formats         → list supported German bank CSV formats
POST   /import/detect-contracts     → scan imported transactions for recurring patterns
```

### 3.5 Categories Setup Router — `/categories-setup` (NEW)

**File:** `packages/sync-server/src/categories/app-categories.ts`

```
POST   /categories-setup/german-tree → seed the German category tree into loot-core categories
GET    /categories-setup/templates   → available category templates (German, Finanzguru mapping, etc.)
POST   /categories-setup/map         → map external categories to internal
```

**Note:** This router is unusual — it writes to loot-core's `db.sqlite`, not `account.sqlite`. It will use Actual's existing category API (via internal calls or direct DB access on the sync-server side through the budget file system).

---

## 4. Handler Bridge (loot-core)

### 4.1 New/Modified Handler Modules

Each module follows the established pattern from `schedules/app.ts`:

```typescript
// packages/loot-core/src/server/{module}/app.ts
import { createApp } from '../app';
import * as asyncStorage from '../../platform/server/asyncStorage';
import { get, post, patch, del } from '../post';
import { getServer } from '../server-config';

export type ModuleHandlers = { ... };
export const app = createApp<ModuleHandlers>();
app.method('handler-name', handlerFn);
```

**New handler modules:**

| Module                 | File                             | Handlers                                                                                                                                                                                                |
| ---------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| contracts (rewrite)    | `server/contracts/app.ts`        | `contract-list`, `contract-get`, `contract-create`, `contract-update`, `contract-delete`, `contract-summary`, `contract-expiring`, `contract-discover`, `contract-bulk-import`, `contract-price-change` |
| review (new)           | `server/review/app.ts`           | `review-list`, `review-count`, `review-update`, `review-batch`, `review-apply`, `review-dismiss`                                                                                                        |
| ai (rewrite)           | `server/ai/app.ts`               | `ai-classify`, `ai-classify-batch`, `ai-rules-list`, `ai-rules-create`, `ai-rules-delete`, `ai-learn`, `ai-stats`                                                                                       |
| import (new)           | `server/import-data/app.ts`      | `import-finanzguru-preview`, `import-finanzguru-commit`, `import-csv-preview`, `import-csv-commit`, `import-detect-contracts`                                                                           |
| categories-setup (new) | `server/categories-setup/app.ts` | `categories-setup-german-tree`, `categories-setup-templates`, `categories-setup-map`                                                                                                                    |

### 4.2 Handler Type Registration

**File:** `packages/loot-core/src/types/handlers.ts`

Add imports for new handler types. Remove deprecated modules (intelligence, nl-query, documents, forecast, events).

```typescript
// REMOVE these imports:
// import type { DocumentHandlers } ...
// import type { ForecastHandlers } ...
// import type { IntelligenceHandlers } ...
// import type { NLQueryHandlers } ...

// ADD these imports:
import type { ReviewHandlers } from '../server/review/app';
import type { ImportDataHandlers } from '../server/import-data/app';
import type { CategoriesSetupHandlers } from '../server/categories-setup/app';

// Update Handlers union:
export type Handlers = {} & ServerHandlers &
  // ... existing ...
  ContractHandlers & // rewritten
  AIHandlers & // rewritten
  ReviewHandlers & // NEW
  ImportDataHandlers & // NEW
  CategoriesSetupHandlers; // NEW
```

### 4.3 Main Registration

**File:** `packages/loot-core/src/server/main.ts`

```typescript
// REMOVE:
// import { app as documentsApp } from './documents/app';
// import { app as forecastApp } from './forecast/app';
// import { app as intelligenceApp } from './intelligence/app';
// import { app as nlQueryApp } from './nl-query/app';

// ADD:
import { app as reviewApp } from './review/app';
import { app as importDataApp } from './import-data/app';
import { app as categoriesSetupApp } from './categories-setup/app';

app.combine(
  // ... existing ...
  contractsApp, // rewritten
  aiApp, // rewritten
  reviewApp, // NEW
  importDataApp, // NEW
  categoriesSetupApp, // NEW
  // REMOVED: documentsApp, forecastApp, intelligenceApp, nlQueryApp
);
```

---

## 5. Feature Flags

### 5.1 New Feature Flags

**File:** `packages/loot-core/src/types/prefs.ts`

```typescript
export type FeatureFlag =
  // Existing upstream flags...
  | 'goalTemplatesEnabled'
  | 'goalTemplatesUIEnabled'
  | 'actionTemplating'
  | 'formulaMode'
  | 'currency'
  | 'crossoverReport'
  | 'customThemes'
  | 'budgetAnalysisReport'
  // Phase 1 flags (replace old scaffold flags):
  | 'financeOS' // Master toggle: enables dashboard, nav restructure
  | 'contractManagement' // Enriched contracts (rewrite of old flag)
  | 'aiSmartMatching' // Three-tier AI classification
  | 'reviewQueue' // Unified review queue
  | 'quickAdd' // Quick add overlay
  | 'paymentCalendar' // Calendar view
  | 'germanCategories' // German category tree + import
  | 'extendedCommandBar'; // Extended command palette

// REMOVE:
// | 'forecastEngine'
// | 'documentPipeline'
// | 'intelligenceLayer'
// | 'aiClassification'  → renamed to aiSmartMatching
```

**File:** `packages/desktop-client/src/hooks/useFeatureFlag.ts`

All Phase 1 flags default to `false`. User enables in Settings > Experimental.

---

## 6. Frontend Architecture

### 6.1 Navigation Restructure

**Current sidebar** (PrimaryButtons.tsx):

```
Budget | Reports | Schedules | More > [Payees, Rules, Bank Sync, Tags, Contracts, Forecast, AI Review, Documents, Settings]
```

**Phase 1 sidebar** (when `financeOS` flag enabled):

```
Dashboard (⌘1) | Accounts (⌘2) | Contracts (⌘3) | Calendar (⌘4) | Budget (⌘5) | Reports (⌘6) |
More > [Import (⌘7), Review (⌘8, badge), Settings (⌘9), Payees, Rules, Bank Sync, Tags, Schedules]
```

**Progressive disclosure:**

- Initial: Dashboard + Accounts + Import visible. Others dimmed with "Set up X to unlock" tooltip.
- After import: Contracts + Calendar activate
- After AI rules: Review queue appears
- Budget always visible (Actual's core feature)

**Implementation:** Modify `PrimaryButtons.tsx` to check `financeOS` flag. When enabled, render the new nav structure. When disabled, render original layout (upstream compatibility).

### 6.2 Route Definitions

**File:** `packages/desktop-client/src/components/FinancesApp.tsx`

New routes (all eager imports, `element={}` prop):

```tsx
// Phase 1 routes (inside financeOS flag check):
<Route path="/dashboard" element={<DashboardPage />} />
<Route path="/contracts" element={<ContractsPage />} />       // rewritten
<Route path="/contracts/:id" element={<ContractDetailPage />} /> // rewritten
<Route path="/calendar" element={<CalendarPage />} />
<Route path="/review" element={<ReviewQueuePage />} />
<Route path="/import" element={<ImportPage />} />
<Route path="/import/finanzguru" element={<FinanzguruWizard />} />
<Route path="/import/csv" element={<CsvImportWizard />} />

// Remove:
// <Route path="/forecast" element={<ForecastPage />} />
// <Route path="/documents" element={<DocumentsPage />} />
// <Route path="/documents/:id" element={<DocumentDetail />} />
// <Route path="/ai-review" ... /> → replaced by /review
```

**Default route** when `financeOS` enabled: redirect `/` → `/dashboard` instead of `/budget`.

### 6.3 Component Tree — Dashboard

```
packages/desktop-client/src/components/dashboard/
├── DashboardPage.tsx              ← main page component
├── MoneyPulse.tsx                 ← top bar dismissible brief
├── widgets/
│   ├── AccountBalancesWidget.tsx   ← list of accounts with balances
│   ├── ThisMonthWidget.tsx         ← income/fixed/spent/available summary
│   ├── UpcomingPaymentsWidget.tsx  ← next 30 days grouped by week
│   ├── AttentionQueueWidget.tsx    ← mini review queue with badge
│   ├── QuickAddWidget.tsx          ← inline quick add form
│   ├── BalanceProjectionWidget.tsx ← line chart: balance over time
│   └── CashRunwayWidget.tsx        ← "money lasts until Mar 27"
├── hooks/
│   ├── useDashboardData.ts         ← aggregates data from multiple handlers
│   ├── useUpcomingPayments.ts      ← combines schedules + contracts
│   └── useBalanceProjection.ts     ← computes future balance
└── types.ts
```

**Data flow for UpcomingPaymentsWidget:**

1. Fetch all active schedules via `send('schedule/get-upcoming-dates', { config, count: 60 })`
2. Fetch all active contracts via `send('contract-list', { status: 'active' })`
3. Merge: for each contract with schedule_id, match to schedule dates
4. Group by week, compute running balance
5. Flag "crunch days" (multiple payments on same day or clusters > threshold)

### 6.4 Component Tree — Contracts

```
packages/desktop-client/src/components/contracts/
├── ContractsPage.tsx              ← list view with filters, sort, group
├── ContractDetailPage.tsx         ← full detail with tabs
├── ContractForm.tsx               ← create/edit form (shared)
├── ContractListItem.tsx           ← single row in list
├── ContractHealthBadge.tsx        ← 🟢🟡🔴 indicator
├── ContractSummaryCard.tsx        ← total commitment overview
├── ContractTemplateSelect.tsx     ← German contract templates
├── PriceHistoryTimeline.tsx       ← price change log
├── CancellationInfo.tsx           ← deadline display + letter template
├── hooks/
│   ├── useContracts.ts             ← CRUD operations via handlers
│   ├── useContractSummary.ts       ← aggregated cost data
│   └── useContractHealth.ts        ← compute health from deadlines
└── types.ts
```

### 6.5 Component Tree — Calendar

```
packages/desktop-client/src/components/calendar/
├── CalendarPage.tsx               ← page with view toggle
├── views/
│   ├── ListView.tsx                ← 30-day grouped by week (default)
│   ├── MonthGridView.tsx           ← traditional calendar grid
│   └── YearOverview.tsx            ← 12-month mini calendars
├── PaymentItem.tsx                ← single payment row
├── WeekGroup.tsx                  ← week header with total
├── BalanceProjectionLine.tsx      ← running balance bar/line
├── CrunchDayIndicator.tsx         ← warning for heavy payment days
├── hooks/
│   ├── useCalendarData.ts          ← combines schedules + contracts + income
│   └── useBalanceCorridor.ts       ← red zone threshold tracking
└── types.ts
```

### 6.6 Component Tree — Quick Add

```
packages/desktop-client/src/components/quick-add/
├── QuickAddOverlay.tsx            ← modal overlay (⌘N)
├── PresetBar.tsx                  ← user-pinned + auto-learned buttons
├── AmountInput.tsx                ← calculator-enabled amount field
├── CategorySelect.tsx             ← fuzzy search with frecency ranking
├── RecentTemplates.tsx            ← clone recent transactions
├── ExpenseTrainMode.tsx           ← rapid multi-entry (⌘T)
├── hooks/
│   ├── useQuickAdd.ts              ← form state + submit
│   ├── useFrecency.ts              ← category ranking by frequency/recency
│   ├── usePresets.ts               ← user presets + auto-learned
│   └── useCalculator.ts            ← parse math expressions
└── types.ts
```

### 6.7 Component Tree — Review Queue

```
packages/desktop-client/src/components/review/
├── ReviewQueuePage.tsx            ← full page queue
├── ReviewItem.tsx                 ← single review item with actions
├── ReviewBatchActions.tsx         ← "Accept All >90%" bar
├── ReviewFilters.tsx              ← filter by type, priority
├── ReviewStats.tsx                ← accuracy stats, items remaining
├── hooks/
│   ├── useReviewQueue.ts           ← fetch + paginate queue
│   └── useReviewActions.ts         ← accept/reject/snooze/batch
└── types.ts
```

### 6.8 Component Tree — Import

```
packages/desktop-client/src/components/import/
├── ImportPage.tsx                  ← hub page: choose import method
├── GettingStartedWizard.tsx       ← first-run wizard (5 steps)
├── FinanzguruWizard.tsx           ← XLSX upload + category mapping
├── CsvImportWizard.tsx            ← CSV upload + bank format detection
├── CategoryMapper.tsx             ← map external → internal categories
├── ImportPreview.tsx              ← preview table before commit
├── ImportAdvisor.tsx              ← "234 transactions, 189 auto-categorized..."
├── hooks/
│   ├── useImport.ts                ← upload + preview + commit flow
│   ├── useBankFormatDetection.ts   ← auto-detect CSV format
│   └── useCategoryMapping.ts       ← map Finanzguru → German tree
└── types.ts
```

### 6.9 Extended Command Bar

**File:** Modify existing `packages/desktop-client/src/components/CommandBar.tsx`

**New modes** (detected by input prefix):

| Prefix          | Mode               | Behavior                                                               |
| --------------- | ------------------ | ---------------------------------------------------------------------- |
| (none)          | Search             | Fuzzy search across navigation, accounts, contracts                    |
| `>`             | Actions            | Quick actions: `> add`, `> contract`, `> review`, `> sync`, `> import` |
| `=`             | Calculator         | Inline math: `= 3200 - 1840` → shows result with copy button           |
| `€` or number   | Transaction search | Search transactions by amount                                          |
| (type anything) | Universal          | Search payees, categories, contracts by name                           |

**New search sections added to CommandBar:**

```typescript
const sections: SearchSection[] = [
  // ... existing navigation, accounts, reports, custom reports ...

  // NEW: Contracts section (when contractManagement flag enabled)
  {
    key: 'contracts',
    heading: t('Contracts'),
    items: contracts.map(c => ({
      id: c.id,
      name: `${c.name} — ${formatAmount(c.amount)}/${c.interval}`,
      Icon: contractTypeIcon(c.type),
    })),
    onSelect: ({ id }) => handleNavigate(`/contracts/${id}`),
  },

  // NEW: Quick actions (when input starts with ">")
  {
    key: 'actions',
    heading: t('Actions'),
    items: actionItems, // filtered by search term after ">"
    onSelect: ({ id }) => handleAction(id),
  },
];
```

### 6.10 Global Keyboard Shortcuts

**File:** Modify existing `packages/desktop-client/src/components/GlobalKeys.tsx`

```typescript
// Using react-hotkeys-hook (already installed)
import { useHotkeys } from 'react-hotkeys-hook';

// Navigation shortcuts (⌘1-9)
useHotkeys('meta+1', () => navigate('/dashboard'));
useHotkeys('meta+2', () => navigate('/accounts'));
useHotkeys('meta+3', () => navigate('/contracts'));
useHotkeys('meta+4', () => navigate('/calendar'));
useHotkeys('meta+5', () => navigate('/budget'));
useHotkeys('meta+6', () => navigate('/reports'));
useHotkeys('meta+7', () => navigate('/import'));
useHotkeys('meta+8', () => navigate('/review'));
useHotkeys('meta+9', () => navigate('/settings'));

// Overlays
useHotkeys('meta+n', () => openQuickAdd());
useHotkeys('meta+t', () => openExpenseTrain());
// ⌘K already handled by CommandBar.tsx

// List navigation
useHotkeys('j', () => selectNext(), { enableOnFormTags: false });
useHotkeys('k', () => selectPrevious(), { enableOnFormTags: false });
useHotkeys('e', () => editSelected(), { enableOnFormTags: false });
useHotkeys('shift+?', () => openShortcutsReference());
```

---

## 7. German Category Tree

### 7.1 Seed Data

Seeded when user clicks "Use German defaults" in Getting Started wizard.

**12 L1 groups, ~70 L2 categories, pre-assigned colors and icons.**

```typescript
// packages/sync-server/src/categories/german-tree.ts
export const GERMAN_CATEGORY_TREE = [
  {
    name: 'Wohnen',
    color: '#4A90D9',
    icon: 'home',
    categories: [
      'Miete',
      'Nebenkosten',
      'Strom',
      'Gas',
      'Internet',
      'Hausrat',
      'Renovierung',
    ],
  },
  {
    name: 'Mobilität',
    color: '#F5A623',
    icon: 'car',
    categories: [
      'Auto-Versicherung',
      'Tanken',
      'Werkstatt',
      'Leasing',
      'ÖPNV',
      'Taxi',
      'Fahrrad',
    ],
  },
  {
    name: 'Lebensmittel',
    color: '#7ED321',
    icon: 'cart',
    categories: [
      'Supermarkt',
      'Restaurant',
      'Lieferdienst',
      'Kaffee',
      'Bäckerei',
      'Markt',
    ],
  },
  {
    name: 'Freizeit',
    color: '#BD10E0',
    icon: 'gamepad',
    categories: [
      'Streaming',
      'Sport',
      'Ausgehen',
      'Hobbys',
      'Reisen',
      'Kultur',
      'Bücher',
    ],
  },
  {
    name: 'Versicherungen',
    color: '#9013FE',
    icon: 'shield',
    categories: [
      'Kranken',
      'Haftpflicht',
      'Hausrat',
      'BU',
      'Rechtsschutz',
      'KFZ',
      'Leben',
    ],
  },
  {
    name: 'Finanzen',
    color: '#417505',
    icon: 'bank',
    categories: [
      'Sparen',
      'Kredit-Tilgung',
      'Zinsen',
      'Gebühren',
      'Investitionen',
    ],
  },
  {
    name: 'Gesundheit',
    color: '#D0021B',
    icon: 'heart',
    categories: ['Apotheke', 'Arzt', 'Brille', 'Zahnarzt', 'Fitness'],
  },
  {
    name: 'Einkäufe',
    color: '#F8E71C',
    icon: 'bag',
    categories: [
      'Kleidung',
      'Elektronik',
      'Möbel',
      'Haushalt',
      'Geschenke',
      'Online',
    ],
  },
  {
    name: 'Bildung',
    color: '#50E3C2',
    icon: 'book',
    categories: ['Kurse', 'Software', 'Abonnements', 'Schule'],
  },
  {
    name: 'Kinder',
    color: '#FF6B6B',
    icon: 'child',
    categories: ['Betreuung', 'Kleidung', 'Schule', 'Spielzeug', 'Taschengeld'],
  },
  {
    name: 'Sonstiges',
    color: '#9B9B9B',
    icon: 'dots',
    categories: ['Unkategorisiert', 'Bargeldabhebung', 'Gebühren', 'Sonstiges'],
  },
  {
    name: 'Einkommen',
    color: '#7ED321',
    icon: 'wallet',
    is_income: true,
    categories: [
      'Gehalt',
      'Nebeneinkommen',
      'Kindergeld',
      'Zinserträge',
      'Erstattungen',
    ],
  },
];
```

### 7.2 Default Tags

Pre-suggested but user-extensible:

```typescript
export const DEFAULT_TAGS = [
  'Steuerlich relevant',
  'Urlaub',
  'Geteilt',
  'Einmalig',
  'Geschäftlich',
  'Geschenk',
];
```

---

## 8. Implementation Order

### Wave 1 — Foundation (no visible UI yet)

1. **Database migrations** — Create all new tables in account.sqlite
2. **Contracts API rewrite** — New Express router with enriched model
3. **Review queue API** — New Express router
4. **AI Smart Matching API** — Refactor existing /ai router
5. **Handler bridge** — New loot-core handler modules
6. **Feature flags** — Register all Phase 1 flags
7. **Remove deprecated modules** — Delete forecast, documents, intelligence, nl-query, events

### Wave 2 — Core Pages

8. **Navigation restructure** — New PrimaryButtons layout (behind flag)
9. **Contracts page** — Rewrite list + detail + form
10. **Calendar page** — New page with list view
11. **Review queue page** — New page

### Wave 3 — Dashboard & Quick Add

12. **Dashboard page** — New page with static widget layout
13. **Quick Add overlay** — Modal with presets, frecency, calculator
14. **Expense Train mode** — Rapid entry sub-mode

### Wave 4 — Intelligence & Import

15. **German category tree** — Seed data + setup UI
16. **Extended command bar** — New sections + modes
17. **Global keyboard shortcuts** — react-hotkeys-hook bindings
18. **Import wizards** — Finanzguru XLSX + bank CSV

### Wave 5 — Polish

19. **Design token refresh** — Updated theme.ts values
20. **Micro-interactions** — Toast+undo, skeleton loading, transitions
21. **Empty states** — Guidance for each page
22. **Progressive disclosure** — Dimmed nav items with unlock hints

---

## 9. File Change Summary

### New Files (~35)

```
packages/sync-server/src/
├── contracts/app-contracts.ts          (REWRITE)
├── review/app-review.ts               (NEW)
├── ai/app-ai.ts                       (REWRITE)
├── import/app-import.ts               (NEW)
├── categories/app-categories.ts       (NEW)
├── categories/german-tree.ts          (NEW)
└── migrations/
    └── 20260222_001_phase1.sql         (NEW)

packages/loot-core/src/
├── server/contracts/app.ts             (REWRITE)
├── server/review/app.ts               (NEW)
├── server/ai/app.ts                   (REWRITE)
├── server/import-data/app.ts          (NEW)
├── server/categories-setup/app.ts     (NEW)
└── types/handlers.ts                  (MODIFY)

packages/desktop-client/src/components/
├── dashboard/                          (NEW directory, ~10 files)
├── contracts/                          (REWRITE directory, ~12 files)
├── calendar/                           (NEW directory, ~8 files)
├── quick-add/                          (NEW directory, ~8 files)
├── review/                             (NEW directory, ~6 files)
├── import/                             (NEW directory, ~8 files)
├── CommandBar.tsx                      (MODIFY)
├── GlobalKeys.tsx                      (MODIFY)
├── FinancesApp.tsx                     (MODIFY)
└── sidebar/PrimaryButtons.tsx          (MODIFY)
```

### Deleted Files/Directories

```
packages/sync-server/src/
├── documents/                          (DELETE)
├── forecast/                           (DELETE)
├── intelligence/                       (DELETE)
├── nl-query/                           (DELETE)
└── events/                             (DELETE — if exists)

packages/loot-core/src/server/
├── documents/                          (DELETE)
├── forecast/                           (DELETE)
├── intelligence/                       (DELETE)
└── nl-query/                           (DELETE)

packages/desktop-client/src/components/
├── documents/                          (DELETE)
├── forecast/                           (DELETE)
└── ai/AIReviewQueue.tsx                (DELETE — replaced by review/)
```

### Modified Files (~15)

```
packages/loot-core/src/types/handlers.ts    — update Handlers union
packages/loot-core/src/types/prefs.ts       — update FeatureFlag
packages/loot-core/src/server/main.ts       — update imports + app.combine()
packages/sync-server/src/app.ts             — update router mounts
packages/desktop-client/src/hooks/useFeatureFlag.ts — update defaults
packages/desktop-client/src/components/FinancesApp.tsx — update routes
packages/desktop-client/src/components/sidebar/PrimaryButtons.tsx — restructure nav
packages/desktop-client/src/components/CommandBar.tsx — extend sections
packages/desktop-client/src/components/GlobalKeys.tsx — add shortcuts
packages/desktop-client/src/components/settings/Experimental.tsx — update toggles
packages/component-library/src/theme.ts — design token refresh values
```

---

## 10. Cross-DB Reference Strategy

The core architectural challenge is that **contracts live in account.sqlite** (sync-server) while **schedules, categories, accounts, and transactions live in db.sqlite** (loot-core, per-budget file).

**Resolution:**

- Contract `schedule_id`, `category_id`, `payment_account_id` store the loot-core IDs as plain text.
- The **frontend** resolves these references by fetching from both systems and joining in-memory.
- The **sync-server** never reads db.sqlite directly. It stores IDs it receives from the client.
- On contract creation: client creates the Actual schedule first (via `send('schedule/create', ...)`), gets back the schedule_id, then sends it to the contract creation endpoint.
- The loot-core handler for `contract-create` orchestrates this: create schedule → create contract with schedule_id.

```typescript
// packages/loot-core/src/server/contracts/app.ts
// contract-create handler (simplified):
async function createContract(data) {
  // 1. If payment info provided, create Actual schedule first
  let scheduleId = null;
  if (data.amount && data.interval) {
    scheduleId = await createSchedule({
      schedule: { name: data.name, posts_transaction: false },
      conditions: [
        { op: 'is', field: 'account', value: data.payment_account_id },
        { op: 'is', field: 'amount', value: data.amount },
        {
          op: 'isapprox',
          field: 'date',
          value: {
            frequency: intervalToFrequency(data.interval),
            start: data.start_date || currentDay(),
            interval: 1,
          },
        },
      ],
    });
  }

  // 2. Create contract on sync-server with schedule reference
  const res = await post(
    getServer().BASE_SERVER + '/contracts',
    {
      ...data,
      schedule_id: scheduleId,
    },
    { 'X-ACTUAL-TOKEN': userToken },
  );

  return res;
}
```

---

## 11. Design Token Refresh — Specific Values

Extending `theme.ts` with new semantic tokens (existing tokens untouched for upstream compatibility):

```typescript
// NEW tokens added to theme object:
// Status colors
healthGreen: 'var(--color-healthGreen)',         // #22C55E
healthYellow: 'var(--color-healthYellow)',        // #EAB308
healthRed: 'var(--color-healthRed)',              // #EF4444

// Category colors (L1 groups)
categoryWohnen: 'var(--color-categoryWohnen)',    // #4A90D9
categoryMobilitaet: 'var(--color-categoryMobilitaet)', // #F5A623
// ... etc (12 total)

// Component-specific
cardBackgroundElevated: 'var(--color-cardBackgroundElevated)',
cardBorderSubtle: 'var(--color-cardBorderSubtle)',
badgeBackground: 'var(--color-badgeBackground)',
badgeText: 'var(--color-badgeText)',
toastBackground: 'var(--color-toastBackground)',
toastText: 'var(--color-toastText)',

// Spacing scale
// Use CSS custom properties: --spacing-1 through --spacing-12
// 4, 8, 12, 16, 20, 24, 32, 40, 48, 56, 64, 80
```

---

## 12. Risks & Mitigations

| Risk                                           | Mitigation                                                                                                                                                         |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cross-DB references break if IDs change        | IDs are UUIDs, never change. Orphan detection on contract load.                                                                                                    |
| Schedule creation fails mid-contract-create    | Transaction: create schedule → on success create contract. On contract failure, delete schedule.                                                                   |
| Large number of upcoming dates computation     | Cache in `useUpcomingPayments` hook, invalidate on schedule change only.                                                                                           |
| German tree conflicts with existing categories | Check for existing categories by name before seeding. Merge, don't overwrite.                                                                                      |
| Feature flag proliferation                     | `financeOS` master flag gates the entire navigation restructure. Individual flags for fine-grained rollout.                                                        |
| Upstream merge conflict on modified files      | `FinancesApp.tsx`, `PrimaryButtons.tsx`, `CommandBar.tsx`, `GlobalKeys.tsx` are high-conflict. Minimize changes to these files; wrap modifications in flag checks. |

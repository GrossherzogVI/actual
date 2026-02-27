# Finance OS MVP — Implementation Plan

**Date:** 2026-02-27
**Status:** Approved for execution
**Source:** `planning-artifacts/finance-os-design-brief.md` + `planning-artifacts/design-system-v1.md`

---

## Overview

This plan rebuilds the Finance OS web app from the current bloated 14-module state into a focused 4-feature MVP. The existing codebase has structural bones worth keeping (surreal-client, ContractCard/Form, CalendarListView logic, global CSS classes) but the navigation shell, feature routing, and many modules are wrong for the new direction.

**What we keep:**
- `apps/web/src/core/api/surreal-client.ts` — connection singleton, keep as-is
- `apps/web/src/components/ErrorBoundary.tsx` — keep
- `schema/000-auth.surql` — keep
- `schema/002-contracts.surql` — keep, extend with `next_payment_date` + `income` type
- The CSS utility classes in `global.css` (`.fo-card`, `.fo-row`, `.fo-input`, etc.) — **replace entirely** with new "Clarity Through Restraint" token system
- Core logic from `useCalendarData.ts` — salvage the date projection math

**What we delete:**
- All feature modules except contracts and calendar stubs: `analytics/`, `budget/`, `import/`, `intelligence/`, `review/`, `quick-add/`, `categories/`, `finance/` (entire shell)
- `apps/web/src/features/dashboard/` — rebuild from scratch
- `apps/web/src/core/api/finance-api.ts` — replace with slim MVP version
- `apps/web/src/core/types/finance.ts` — replace with MVP types
- Schema files: `003-command-platform.surql`, `004-intelligence.surql`, `007-user-prefs.surql`, `008-budget.surql`, `009-import.surql`, `010-intelligence.surql`, `011-receipts.surql`, `012-tax.surql`, `013-sepa.surql`, `014-user-prefs.surql`
- `packages/design-system/src/` — full replacement with new token system

**The new navigation:**
4 sidebar pages (Dashboard, Verträge, Kalender, Einstellungen) + 2 overlays (Quick Add ⌘N, Command Palette ⌘K). No tab bar across the top.

---

## Definition of Done (global)

Every story is complete when:
1. `yarn typecheck` passes (zero errors)
2. Feature works with real SurrealDB data (not mocked)
3. Empty state is implemented and guides the user
4. Matches the "Clarity Through Restraint" design system tokens
5. No `any` types, no inline style colors that bypass CSS custom properties

---

## Epic 0: Foundation

**Goal:** Clean slate. Delete the debris, wire in the new design system, establish the 4-page shell.

**Estimated effort:** 1 dev day

---

### Story 0.1 — Delete Non-MVP Modules and Trim Schema

**Why:** The current 14-module structure creates false complexity and will cause import errors during rebuild. Deleting first, then building, keeps the compiler honest.

**Files to DELETE:**
```
apps/web/src/features/analytics/          (entire directory)
apps/web/src/features/budget/             (entire directory)
apps/web/src/features/import/             (entire directory)
apps/web/src/features/intelligence/       (entire directory)
apps/web/src/features/review/             (entire directory)
apps/web/src/features/quick-add/          (entire directory)
apps/web/src/features/categories/         (entire directory)
apps/web/src/features/finance/            (entire directory — the old tab shell)
apps/web/src/features/dashboard/          (entire directory — rebuild in Story 3.x)
apps/worker/                              (not needed for MVP — skip AI)

schema/003-command-platform.surql
schema/004-intelligence.surql
schema/007-user-prefs.surql
schema/008-budget.surql
schema/009-import.surql
schema/010-intelligence.surql
schema/011-receipts.surql
schema/012-tax.surql
schema/013-sepa.surql
schema/014-user-prefs.surql
```

**Files to REPLACE (empty stubs during this story, filled in later stories):**
```
apps/web/src/core/api/finance-api.ts      → delete, recreate as stub
apps/web/src/core/types/finance.ts        → delete, recreate with MVP types only
```

**Schema files to KEEP:**
```
schema/000-auth.surql                     (keep as-is)
schema/001-financial-core.surql           (keep — account/category tables still needed)
schema/002-contracts.surql                (keep — extend in Story 0.3)
schema/005-api-endpoints.surql            (keep — extend in Story 0.3)
schema/006-seed-german-categories.surql   (keep for reference, not required for MVP boot)
```

**Acceptance criteria:**
- [ ] All listed directories deleted
- [ ] `yarn typecheck` passes (no dangling imports)
- [ ] `apps/web/` builds without errors (`yarn workspace @actual-app/web build`)

---

### Story 0.2 — Design System: CSS Custom Properties + Global Stylesheet

**Why:** The current `global.css` uses a dark-mode-only warm charcoal palette with `Plus Jakarta Sans`. The new design brief mandates warm Stone neutrals (light mode first, dark mode via CSS custom properties), Inter font, and a specific semantic color vocabulary. This is not a color tweak — it is a complete design language replacement.

**Files to CREATE/REPLACE:**

`apps/web/src/styles/global.css` — full replacement:

```
Changes from current:
- REMOVE: Plus Jakarta Sans, IBM Plex Sans, JetBrains Mono imports
- ADD: Inter font import (Google Fonts)
- REPLACE: all --fo-* variables with the new CSS custom property system
- REPLACE: dark/light surface system per design-system-v1.md §1
- ADD: --text-primary/secondary/muted/faint per §2
- ADD: --positive, --warning, --critical, --accent, --border per §3
- KEEP: .fo-row, .fo-space-between, .fo-stack utility classes (rename to match new system)
- REPLACE: .fo-card — new warm surface, border-radius: 12px, shadow-sm
- REPLACE: .fo-btn — --accent color primary, 8px radius
- REPLACE: .fo-input — Stone-200 border, 8px radius, --accent focus ring
- ADD: .fo-chip / .fo-chip-status-* for health status badges
- ADD: .fo-skeleton for loading states
- REMOVE: .fo-palette-overlay, .fo-palette (rebuilt in Story 5.x)
- ADD: .fo-app-shell with sidebar layout (sidebar 240px + main content)
- ADD: .fo-sidebar with navigation styles
```

**Exact CSS custom property set to implement** (from design-system-v1.md):

```css
:root {
  /* Surfaces */
  --canvas: 250 250 249;           /* Stone-50  #FAFAF9 */
  --surface: 255 255 255;          /* White */
  --surface-elevated: 255 255 255; /* White + shadow */
  --surface-overlay: 255 255 255;  /* White + backdrop */

  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.08);
  --shadow-lg: 0 16px 48px rgba(0,0,0,0.12);

  /* Text */
  --text-primary: 28 25 23;        /* Stone-900 #1C1917 */
  --text-secondary: 87 83 78;      /* Stone-600 #57534E */
  --text-muted: 120 113 108;       /* Stone-500 #78716C */
  --text-faint: 168 162 158;       /* Stone-400 #A8A29E */

  /* Semantic */
  --positive: 5 150 105;           /* Emerald-600 #059669 */
  --warning: 245 158 11;           /* Amber-500  #F59E0B */
  --critical: 225 29 72;           /* Rose-600   #E11D48 */
  --accent: 79 70 229;             /* Indigo-600 #4F46E5 */
  --accent-hover: 67 56 202;       /* Indigo-700 #4338CA */
  --accent-tint: 238 242 255;      /* Indigo-50  #EEF2FF */
  --border: 231 229 228;           /* Stone-200  #E7E5E4 */
  --border-strong: 214 211 209;    /* Stone-300  #D6D3D1 */
}

.dark {
  --canvas: 12 10 9;
  --surface: 28 25 23;
  --surface-elevated: 41 37 36;
  --surface-overlay: 41 37 36;
  --text-primary: 245 245 244;
  --text-secondary: 168 162 158;
  --text-muted: 120 113 108;
  --text-faint: 87 83 78;
}
```

**Typography:**
- Font: Inter (single family, no fallback chaos)
- `tabular-nums` applied to all amount display elements via `.fo-amount` utility class
- Type scale matches design-system-v1.md §5:
  - `.fo-display` — 32px/700
  - `.fo-title` — 18px/600
  - `.fo-body` — 14px/400
  - `.fo-data` — 14px/500-600 + tabular-nums
  - `.fo-label` — 12px/500 uppercase tracking-wide
  - `.fo-caption` — 12px/400

**Acceptance criteria:**
- [ ] `yarn typecheck` passes
- [ ] App renders with warm Stone background (not dark charcoal)
- [ ] Inter font loading confirmed in browser DevTools
- [ ] All CSS custom properties readable from browser console

---

### Story 0.3 — Schema: Extend Contracts Table for MVP

**Why:** The existing `002-contracts.surql` is close but missing two things: (1) `next_payment_date` as a stored field (not computed) so calendar projection works without re-deriving from start_date, and (2) `income` as a contract type since salary and side income are core to the unified model.

**Files to MODIFY:**

`schema/002-contracts.surql`:

```
Changes:
- ADD type value 'income' to the ASSERT list for the `type` field
- ADD field: next_payment_date ON contract TYPE option<datetime>
  (User-set anchor date for projection — optional, falls back to start_date)
- ADD field: notes ON contract TYPE option<string>
- FIX health computation: the existing logic uses 30d/60d before end_date
  but should use notice_period. Update to:
    IF status = 'cancelled' THEN 'grey'
    ELSE IF end_date != NONE AND notice_period_months != NONE
         AND end_date - <notice_period_months as duration> - 30d < time::now() THEN 'red'
    ELSE IF end_date != NONE AND notice_period_months != NONE
         AND end_date - <notice_period_months as duration> - 60d < time::now() THEN 'yellow'
    ELSE 'green'
    END END END
- ADD INDEX idx_contract_status ON contract FIELDS status
- ADD INDEX idx_contract_next_payment ON contract FIELDS next_payment_date
```

`schema/002b-invoices.surql` — **new file:**

```surql
-- Finance OS Open Invoices
-- One-time bills: payee, amount, due date, status

DEFINE TABLE invoice SCHEMAFULL;
DEFINE FIELD payee ON invoice TYPE string;
DEFINE FIELD amount ON invoice TYPE decimal;         -- always negative (expense)
DEFINE FIELD due_date ON invoice TYPE datetime;
DEFINE FIELD notes ON invoice TYPE option<string>;
DEFINE FIELD status ON invoice TYPE string DEFAULT 'open'
  ASSERT $value IN ['open', 'paid', 'overdue'];
DEFINE FIELD paid_date ON invoice TYPE option<datetime>;
DEFINE FIELD created_at ON invoice TYPE datetime DEFAULT time::now();
DEFINE FIELD updated_at ON invoice TYPE datetime DEFAULT time::now();

-- Computed: is the invoice overdue?
DEFINE FIELD is_overdue ON invoice VALUE
  status = 'open' AND due_date < time::now();

DEFINE INDEX idx_invoice_status ON invoice FIELDS status;
DEFINE INDEX idx_invoice_due_date ON invoice FIELDS due_date;
```

`schema/apply.sh` — update to include `002b-invoices.surql`, exclude deleted schema files.

**API endpoint additions to `005-api-endpoints.surql`:**
```surql
-- Contracts: include all statuses (active + cancelled)
-- Update existing /contracts endpoint to include income type + next_payment_date

DEFINE API "/contracts/all" FOR get THEN {
  RETURN { status: 200, body: (SELECT * FROM contract ORDER BY name) };
};

-- Invoices
DEFINE API "/invoices" FOR get THEN {
  RETURN { status: 200, body: (SELECT * FROM invoice WHERE status != 'paid' ORDER BY due_date ASC) };
};

DEFINE API "/invoices" FOR post THEN {
  LET $inv = CREATE invoice CONTENT $request.body;
  RETURN { status: 201, body: $inv };
};
```

**Acceptance criteria:**
- [ ] `cd schema && ./apply.sh` runs without errors
- [ ] `SELECT * FROM contract` returns records with `next_payment_date` field present
- [ ] `SELECT * FROM invoice` works (empty table is fine)
- [ ] `income` type accepted when creating a contract

---

### Story 0.4 — MVP Types + Slim API Client

**Why:** The current `finance-api.ts` has 35+ functions including analytics, budget, AI review, SEPA, and tax. The current `finance.ts` types file has 20+ types. We need a clean MVP-scoped surface.

**Files to REPLACE:**

`apps/web/src/core/types/finance.ts` — replace entirely:

```typescript
// MVP types — keep only what the 4 features actually need

export type Contract = {
  id: string;
  name: string;
  provider: string;
  category?: string;
  type: 'subscription' | 'insurance' | 'utility' | 'loan' | 'membership' | 'income' | 'other';
  amount: number;              // positive = income, negative = expense
  interval: 'weekly' | 'monthly' | 'quarterly' | 'semi-annual' | 'annual' | 'custom';
  next_payment_date?: string;  // user-set anchor for calendar projection
  start_date?: string;
  end_date?: string;
  notice_period_months?: number;
  auto_renewal: boolean;
  status: 'active' | 'cancelled' | 'paused';
  notes?: string;
  annual_cost: number;         // computed by SurrealDB
  health: 'green' | 'yellow' | 'red' | 'grey';  // computed by SurrealDB
  created_at: string;
  updated_at: string;
};

export type Invoice = {
  id: string;
  payee: string;
  amount: number;              // always negative
  due_date: string;
  notes?: string;
  status: 'open' | 'paid' | 'overdue';
  paid_date?: string;
  is_overdue: boolean;         // computed by SurrealDB
  created_at: string;
  updated_at: string;
};

// Used by Calendar and Dashboard
export type CalendarPayment = {
  id: string;
  name: string;
  provider?: string;
  amount: number;
  date: string;               // YYYY-MM-DD
  source: 'contract' | 'invoice';
  sourceId: string;
};

export type CalendarDay = {
  date: string;               // YYYY-MM-DD
  payments: CalendarPayment[];
  runningBalance: number;
  isCrunchDay: boolean;       // runningBalance < 0 after this day
};

// Dashboard summary
export type DashboardMetrics = {
  totalMonthlyIncome: number;
  totalMonthlyExpenses: number;
  availableToSpend: number;   // income - expenses
  cashRunwayDays: number;     // days until available < 0
  contractsNeedingAttention: Contract[];
  upcomingPayments: CalendarPayment[];  // next 7 days
  overdueInvoices: Invoice[];
};
```

`apps/web/src/core/api/finance-api.ts` — replace entirely with MVP-scoped functions:

```typescript
// MVP API surface — 10 functions, no bloat

// Contracts (6 functions)
export async function listContracts(): Promise<Contract[]>
export async function getContract(id: string): Promise<Contract>
export async function createContract(data: ContractInput): Promise<Contract>
export async function updateContract(id: string, data: Partial<ContractInput>): Promise<Contract>
export async function deleteContract(id: string): Promise<void>

// Invoices (5 functions)
export async function listInvoices(): Promise<Invoice[]>
export async function createInvoice(data: InvoiceInput): Promise<Invoice>
export async function updateInvoice(id: string, data: Partial<InvoiceInput>): Promise<Invoice>
export async function markInvoicePaid(id: string): Promise<Invoice>
export async function deleteInvoice(id: string): Promise<void>

// Dashboard (1 function — computed in frontend from contracts + invoices)
// No separate dashboard API call needed — dashboard derives from contracts + invoices query
```

**Acceptance criteria:**
- [ ] `yarn typecheck` passes
- [ ] `listContracts()` returns typed `Contract[]` from SurrealDB
- [ ] `listInvoices()` returns typed `Invoice[]` from SurrealDB
- [ ] No `any` types in either file

---

### Story 0.5 — New App Shell: Sidebar Navigation

**Why:** The current app uses a horizontal tab bar with 12 tabs rendered in `FinancePage.tsx`. The new design calls for a sidebar with 4 pages and 2 overlays. This story replaces the entire routing/layout structure.

**Files to CREATE:**

`apps/web/src/app/App.tsx` — **replace entirely:**

```
Structure:
- .fo-app-shell (display: grid; grid-template-columns: 240px 1fr)
- .fo-sidebar: Finance OS logo, nav links (Dashboard/Verträge/Kalender/Einstellungen)
  - Active page: 3px left border in --accent, --accent-tint background
  - Keyboard: ⌘1 through ⌘4
- <main>: ConnectionStatus banner (keep existing logic) + page content
- Overlays: QuickAddOverlay (⌘N), CommandPalette (⌘K)
  - Both are phase 5 — wire stubs here, implement in Story 5.x
```

```typescript
type Page = 'dashboard' | 'contracts' | 'calendar' | 'settings';

const NAV_ITEMS = [
  { id: 'dashboard',  label: 'Dashboard',    icon: LayoutDashboard, shortcut: '⌘1' },
  { id: 'contracts',  label: 'Verträge',     icon: FileText,        shortcut: '⌘2' },
  { id: 'calendar',   label: 'Kalender',     icon: CalendarDays,    shortcut: '⌘3' },
  { id: 'settings',   label: 'Einstellungen',icon: Settings,        shortcut: '⌘4' },
] as const;
```

**Files to DELETE:**
- `apps/web/src/features/finance/FinancePage.tsx` (old 12-tab shell)
- `apps/web/src/features/finance/AccountPanel.tsx`
- `apps/web/src/features/finance/CategoryTree.tsx`
- `apps/web/src/features/finance/TransactionList.tsx`
- `apps/web/src/features/finance/AmountDisplay.tsx` (recreate in Story 1 with new design)
- `apps/web/src/features/finance/index.ts`
- `apps/web/src/app/useAppState.ts` (old 12-entry palette state — rebuild in Story 5)

**Files to CREATE:**
- `apps/web/src/features/settings/SettingsPage.tsx` — minimal placeholder ("Einstellungen — kommt bald")
- `apps/web/src/app/KeyboardShortcuts.tsx` — update to handle ⌘1-4 for page nav (keep ⌘K and ⌘N stubs)

**CSS additions to `global.css`:**
```css
.fo-app-shell {
  display: grid;
  grid-template-columns: 240px 1fr;
  height: 100%;
  background: rgb(var(--canvas));
}

.fo-sidebar {
  background: rgb(var(--surface));
  border-right: 1px solid rgb(var(--border));
  display: flex;
  flex-direction: column;
  padding: 16px 0;
  gap: 4px;
}

.fo-sidebar-logo {
  padding: 0 16px 16px;
  border-bottom: 1px solid rgb(var(--border));
  margin-bottom: 8px;
}

.fo-nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  font-size: 14px;
  font-weight: 500;
  color: rgb(var(--text-secondary));
  cursor: pointer;
  border: none;
  background: none;
  width: 100%;
  text-align: left;
  border-left: 3px solid transparent;
  transition: all 150ms ease-out;
}

.fo-nav-item:hover {
  background: rgb(var(--canvas));
  color: rgb(var(--text-primary));
}

.fo-nav-item.active {
  color: rgb(var(--accent));
  border-left-color: rgb(var(--accent));
  background: rgb(var(--accent-tint));
}
```

**Acceptance criteria:**
- [ ] App renders with sidebar + main content layout
- [ ] 4 nav items navigate between pages
- [ ] ⌘1-4 keyboard shortcuts switch pages
- [ ] Active page has correct 3px left border + tint background
- [ ] ConnectionStatus banner still works
- [ ] `yarn typecheck` passes

---

## Epic 1: Contracts

**Goal:** Full contract CRUD. This is the input side of the entire system. Until contracts are populated, calendar and dashboard are empty. Quality bar: Finanzguru-style list rows, not cards.

**Dependencies:** Epic 0 complete

**Estimated effort:** 1.5 dev days

---

### Story 1.1 — Amount Display Utility Component

**Why:** Contracts, Calendar, and Dashboard all need to display amounts with consistent polarity formatting. Build it once, use everywhere.

**Files to CREATE:**

`apps/web/src/components/AmountDisplay.tsx`:

```typescript
// Implements design-system-v1.md §3 Amount Display rules:
//
// Income:   +€3.200,00  → weight 600, --positive color, + prefix
// Expense:  –€890,00    → weight 500, --text-secondary, – prefix
// Transfer: €500,00     → weight 400, --text-muted, no prefix
//
// Props:
//   amount: number         (positive = income, negative = expense)
//   size?: 'sm' | 'md' | 'lg'
//   showSign?: boolean     (default true)
//   context?: 'list' | 'summary'
//   className?: string
//
// context='list': expenses use --text-secondary (no rose color — no wall of red)
// context='summary': expenses use rose color (2-3 numbers in summary cards)

type AmountDisplayProps = {
  amount: number;
  size?: 'sm' | 'md' | 'lg';
  showSign?: boolean;
  context?: 'list' | 'summary';
  className?: string;
};
```

**Acceptance criteria:**
- [ ] `+€3.200,00` renders emerald, weight 600, tabular-nums
- [ ] `–€890,00` renders text-secondary in list context, weight 500
- [ ] `–€890,00` renders rose in summary context
- [ ] Always uses `tabular-nums` font-variant
- [ ] German locale formatting (period for thousands, comma for decimals)
- [ ] `yarn typecheck` passes

---

### Story 1.2 — Contract List Page (Finanzguru-Style Rows)

**Why:** The existing `ContractsPage.tsx` uses a card grid layout. The design brief calls for list rows with category color indicators (3px left border), matching Finanzguru's visual language. The existing file has good logic (filter state, search) but wrong layout — surgical update, not a rewrite.

**Files to MODIFY:**

`apps/web/src/features/contracts/ContractsPage.tsx`:

```
Changes:
- KEEP: filter state (search, healthFilter, typeFilter)
- KEEP: useQuery call, stats computation, openCreate/openEdit handlers
- REPLACE: SummaryCard grid at top — use new MetricRow component with
  design-system-v1.md §11 Metric Card pattern
  (VERFÜGBAR / MONATLICH / JAHRES-GESAMT — 3 metrics, not 7)
- REPLACE: contract card grid → contract list rows
  (Each row: 3px left border in category color, health chip, name/provider,
   amount with AmountDisplay, interval, next_payment_date)
- REPLACE: empty state → design-system-v1.md §9 pattern
  Icon (48px Stone-300) + "Noch keine Verträge" + "Erfasse deine Miete..."
  + primary button "Ersten Vertrag anlegen"
- KEEP: ContractForm slide-over (update in Story 1.3)
```

`apps/web/src/features/contracts/ContractRow.tsx` — **new file** (replaces ContractCard for list view):

```
Layout per design-system-v1.md §11 Contract Row:
┌──────────────────────────────────────────────────────┐
│ ▮ [health chip]  [name]      [amount/interval]  [cat] │
│   [provider]                 [annual cost]     [date] │
└──────────────────────────────────────────────────────┘

- 3px left border = category color (Wohnen=blue-400, etc. per §4)
  For now: if no category, use Stone-400. Category colors hardcoded for MVP.
- Health chip: icon + text per §3 Status Chips table
  ✓ Gesund (emerald), ⚠ Kündigung (amber), ✕ Überfällig (rose), — Pausiert (stone)
- Amount: AmountDisplay component (positive for income, negative for expense)
- Hover: Stone-50 background (not dark highlight)
- onClick → opens ContractForm in edit mode
```

**Acceptance criteria:**
- [ ] Contract list renders as rows (not cards)
- [ ] Each row has 3px left border in category color
- [ ] Health chip shows icon + text + correct color
- [ ] Income contracts show `+€3.200,00` in emerald
- [ ] Expense contracts show `–€890,00` in text-secondary
- [ ] Empty state renders with CTA button
- [ ] Search and filter still work
- [ ] `yarn typecheck` passes

---

### Story 1.3 — Contract Form: Add Income Type + next_payment_date

**Why:** The existing `ContractForm.tsx` is functional but missing: (1) `income` as a type option, (2) `next_payment_date` field for calendar anchoring, (3) `notes` field, (4) updated to new design tokens.

**Files to MODIFY:**

`apps/web/src/features/contracts/ContractForm.tsx`:

```
Changes:
- ADD 'income' to the TYPE_CONFIG map (icon: TrendingUp, label: 'Einkommen')
- ADD 'next_payment_date' field (date input, label: "Nächste Zahlung")
  Position: after interval, before start_date
  Help text: "Für die Kalenderansicht — z.B. nächster Gehaltstag"
- ADD 'notes' textarea field (optional, at bottom before actions)
- UPDATE: form field labels to use .fo-label CSS class
- UPDATE: inputs to use new CSS token colors (--border, --accent focus ring)
- UPDATE: error display to use --critical color
- FIX: amount input — allow negative values for income (positive = income,
  negative = expense). Add a +/– toggle button next to amount field,
  defaulting to – (expense) unless type is 'income' (default +).
- KEEP: all existing validation logic
- KEEP: AnimatePresence slide-over animation
```

**Acceptance criteria:**
- [ ] `income` type selectable, shows TrendingUp icon in form header
- [ ] `next_payment_date` field present and saves to SurrealDB
- [ ] `notes` textarea saves correctly
- [ ] Amount polarity toggle works (+ for income, – for expense)
- [ ] Form saves and invalidates `['contracts']` query cache
- [ ] `yarn typecheck` passes

---

### Story 1.4 — Contract Templates

**Why:** First-run setup is painful if you enter 15 contracts from scratch. Templates pre-fill name + provider for common German contracts and set sensible defaults for type, interval, and notice_period_months.

**Files to CREATE:**

`apps/web/src/features/contracts/contract-templates.ts`:

```typescript
export type ContractTemplate = {
  id: string;
  name: string;
  provider: string;
  type: Contract['type'];
  interval: Contract['interval'];
  notice_period_months?: number;
  auto_renewal?: boolean;
  amount_hint?: string;     // e.g., "Mietpreis eintragen"
  category_hint?: string;   // category name for display only
};

export const CONTRACT_TEMPLATES: ContractTemplate[] = [
  // Wohnen
  { id: 'miete', name: 'Miete', provider: 'Vermieter', type: 'other',
    interval: 'monthly', notice_period_months: 3, amount_hint: 'Monatliche Miete' },
  { id: 'strom', name: 'Strom', provider: 'Stromanbieter', type: 'utility',
    interval: 'monthly' },
  { id: 'gas', name: 'Gas / Heizung', provider: 'Gasanbieter', type: 'utility',
    interval: 'monthly' },
  { id: 'internet', name: 'Internet', provider: 'Telefonanbieter', type: 'subscription',
    interval: 'monthly', notice_period_months: 1 },
  // Mobilität
  { id: 'kfz-versicherung', name: 'KFZ-Versicherung', provider: 'Versicherung',
    type: 'insurance', interval: 'annual', notice_period_months: 1 },
  { id: 'handy', name: 'Handyvertrag', provider: 'Mobilfunkanbieter',
    type: 'subscription', interval: 'monthly', notice_period_months: 1 },
  // Streaming
  { id: 'netflix', name: 'Netflix', provider: 'Netflix', type: 'subscription',
    interval: 'monthly' },
  { id: 'spotify', name: 'Spotify', provider: 'Spotify', type: 'subscription',
    interval: 'monthly' },
  // Einkommen
  { id: 'gehalt', name: 'Gehalt', provider: 'Arbeitgeber', type: 'income',
    interval: 'monthly', amount_hint: 'Netto-Gehalt' },
  { id: 'nebeneinkommen', name: 'Nebeneinkommen', provider: 'Auftraggeber',
    type: 'income', interval: 'monthly' },
  // Versicherungen
  { id: 'haftpflicht', name: 'Haftpflichtversicherung', provider: 'Versicherung',
    type: 'insurance', interval: 'annual', notice_period_months: 3 },
  { id: 'krankenversicherung', name: 'Krankenversicherung', provider: 'Krankenkasse',
    type: 'insurance', interval: 'monthly' },
  { id: 'lebensversicherung', name: 'Lebensversicherung', provider: 'Versicherung',
    type: 'insurance', interval: 'annual', notice_period_months: 3 },
];
```

`apps/web/src/features/contracts/TemplateSelector.tsx`:

```
A modal/popover triggered from "Aus Vorlage" button in ContractForm.
Layout: searchable grid of template tiles.
Each tile: icon (by type) + name + provider hint.
On selection: pre-fills the ContractForm fields.
Grouped by category: Wohnen / Mobilität / Streaming / Einkommen / Versicherungen.
```

**ContractForm.tsx changes:**
- ADD "Aus Vorlage" button in form header, triggers TemplateSelector
- When template selected: pre-fill name, provider, type, interval, notice_period_months

**Acceptance criteria:**
- [ ] "Aus Vorlage" button opens template picker
- [ ] All 13 templates selectable
- [ ] Selecting a template pre-fills the form correctly
- [ ] After template selection, all fields still editable
- [ ] `yarn typecheck` passes

---

### Story 1.5 — Setup Wizard (First-Run)

**Why:** A fresh user landing on an empty Verträge page needs guided entry. A 3-step wizard covers the most common starting setup: salary (step 1), rent (step 2), other fixed costs (step 3). It skips to normal view if contracts already exist.

**Files to CREATE:**

`apps/web/src/features/contracts/SetupWizard.tsx`:

```
Shown when: contracts list is empty AND user hasn't dismissed wizard
  (store dismissed state in localStorage: 'finance-os-setup-dismissed')

Step 1 — Einkommen:
  "Was kommt monatlich rein?"
  Single field: Netto-Gehalt (positive number)
  Provider: "Arbeitgeber" (pre-filled, editable)
  Next_payment_date: next 1st of month
  Creates a 'Gehalt' income contract on save.

Step 2 — Miete:
  "Deine wichtigste Ausgabe"
  Single field: monatliche Miete
  Vermieter: editable
  Notice period: 3 Monate (pre-filled)
  Creates a 'Miete' contract on save.

Step 3 — Weitere Verträge:
  "Was läuft noch monatlich?"
  Compact inline list: [Name] [Betrag] [+ Hinzufügen]
  Each row creates a contract on submit.
  "Ich ergänze das später" skips step 3.

Completion: dismisses wizard, shows ContractsPage.

Design: Full-width modal overlay. Clean single-question layout.
Progress bar at top (3 steps). Each step: icon + title + subtitle + form + Next button.
```

**Acceptance criteria:**
- [ ] Wizard shown only when no contracts exist and not dismissed
- [ ] Step 1 creates an income contract with correct positive amount
- [ ] Step 2 creates an expense contract with correct negative amount
- [ ] Step 3 allows multiple contracts, each saved individually
- [ ] "Ich ergänze das später" dismisses wizard permanently
- [ ] After wizard: ContractsPage shows all created contracts
- [ ] `yarn typecheck` passes

---

## Epic 2: Calendar

**Goal:** Computed payment calendar from contracts + invoices. Next 30/60/90 days, grouped by week, with running balance projection. No bank data needed.

**Dependencies:** Epic 0 + Story 1.1 (AmountDisplay)

**Estimated effort:** 1 dev day

---

### Story 2.1 — Calendar Data Hook (Contracts Only)

**Why:** The existing `useCalendarData.ts` already handles the core projection logic but it calls `listSchedules`, `listTransactions`, and `getDashboardPulse` — all of which no longer exist in the MVP API. The hook needs to be trimmed to contracts + invoices only, and the balance projection needs to work without a real account balance (use 0 as starting balance since we have no account data in MVP).

**Files to MODIFY:**

`apps/web/src/features/calendar/useCalendarData.ts`:

```
Changes:
- REMOVE: useQuery calls for schedules, transactions, dashboard pulse
- KEEP: useQuery for contracts
- ADD: useQuery for invoices (from new finance-api.ts)
- KEEP: projectContractDates() logic — it is correct and well-tested
- ADD: projectInvoiceDates() — trivial: invoice has a single due_date
- REPLACE: totalBalance source — use 0 (no account data in MVP)
  Add a TODO comment: "// TODO Phase-3: derive from account balances"
- UPDATE: Payment type — replace 'schedule'/'transaction' sources
  with just 'contract' | 'invoice'
- KEEP: CalendarDay type, running balance computation
- ADD: isCrunchDay computation: true if runningBalance < some threshold
  (For MVP threshold = 0: crunch day = balance goes negative)
```

**Acceptance criteria:**
- [ ] `useCalendarData(start, end)` returns correct CalendarDay[] from contracts
- [ ] Invoice due dates appear on correct calendar days
- [ ] Running balance decreases for expense contracts, increases for income contracts
- [ ] isCrunchDay = true when projected balance < 0
- [ ] `yarn typecheck` passes
- [ ] Hook has no dead imports (no references to deleted finance-api functions)

---

### Story 2.2 — Calendar List View (Rebuild + Design Tokens)

**Why:** The existing `CalendarListView.tsx` has the right structural approach (daily groups, running balance) but uses old design tokens (`var(--fo-muted)`, Tailwind color classes like `text-amber-400` directly) and the 'transaction'/'schedule' source types that no longer exist.

**Files to MODIFY:**

`apps/web/src/features/calendar/CalendarListView.tsx`:

```
Changes:
- REMOVE: 'schedule' and 'transaction' source types and their SOURCE_CONFIG entries
- KEEP: 'contract' source type
- ADD: 'invoice' source type (icon: Receipt, label: 'Rechnung')
- REPLACE: old --fo-* CSS variable references with new system
  (var(--fo-muted) → rgb(var(--text-muted)), etc.)
- REPLACE: direct Tailwind color classes (text-amber-400) with CSS custom props
- REPLACE: "Heute" badge — use --accent color (indigo), not blue-400
- ADD: crunch day visual indicator — if day.isCrunchDay:
  Show a subtle rose-tinted row or "Achtung: Saldo wird negativ" warning
- KEEP: the day header structure (date + total + running balance)
- KEEP: AnimatePresence stagger animation
- UPDATE: AmountDisplay usage to new component from Story 1.1
```

**Design per design-system-v1.md §11 Calendar Group:**
```
┌──────────────────────────────────────────────────────┐
│ DIESE WOCHE · 3 Zahlungen · –€976,00                │  ← .fo-label
│ ─────────────────────────────────────                │
│  Mo 03.03   Spotify          –€9,99                  │
│  Mi 05.03   Miete            –€890,00                │
│  Do 06.03   Strom            –€85,00                 │
│  ─── Saldo danach: €1.340,00 ───                     │  ← .fo-caption, right-aligned
└──────────────────────────────────────────────────────┘
```

**Acceptance criteria:**
- [ ] Days grouped with week headers
- [ ] Running balance shown at bottom of each week group
- [ ] Crunch days show rose warning indicator
- [ ] Income entries show in emerald
- [ ] Invoice entries show source badge "Rechnung"
- [ ] No old design token references (`--fo-muted`, `--fo-text`, etc.)
- [ ] `yarn typecheck` passes

---

### Story 2.3 — Calendar Page

**Why:** The existing `CalendarPage.tsx` has a list/grid toggle and range selector. For MVP we keep the 30-day list view only (grid adds complexity without solving daily-use). The range selector (30/60/90 days) is useful and stays.

**Files to MODIFY:**

`apps/web/src/features/calendar/CalendarPage.tsx`:

```
Changes:
- REMOVE: CalendarGridView import and toggle button (grid view cut from MVP)
- KEEP: range selector (30/60/90 days)
- KEEP: useCalendarData hook call
- REPLACE: old design tokens with new CSS custom properties
- ADD: summary bar at top of page:
  "X Zahlungen · Gesamt: –€Y,YY · Einnahmen: +€Z,ZZ"
  (aggregated from all CalendarDay payments in range)
- ADD: "Heute" anchor — auto-scroll to today's entry on mount
  (use a ref on the today element + scrollIntoView)
- REPLACE: loading skeleton — use new .fo-skeleton pulse class
- UPDATE: empty state per design-system-v1.md §9:
  "Keine Zahlungen geplant"
  "Trage Verträge ein, damit der Kalender sich automatisch befüllt."
  Link to Verträge page.
```

**Files to DELETE:**
- `apps/web/src/features/calendar/CalendarGridView.tsx`
- `apps/web/src/features/calendar/HolidayBadge.tsx`
- `apps/web/src/features/calendar/HolidaySettings.tsx`
- `apps/web/src/features/calendar/holidays.ts`
- `apps/web/src/features/calendar/useHolidays.ts`
- `apps/web/src/features/calendar/__tests__/holidays.test.ts`

(Holidays are a Phase 3 feature. Removing them declutters the MVP.)

**Acceptance criteria:**
- [ ] Calendar page renders with 30/60/90 day range selector
- [ ] Payments correctly projected from contracts
- [ ] Summary bar at top shows aggregated stats
- [ ] Auto-scrolls to today on load
- [ ] Empty state links to Verträge page
- [ ] `yarn typecheck` passes

---

## Epic 3: Dashboard

**Goal:** The daily check-in screen. Status metrics, pressing payments (next 7 days), and attention items (contracts needing action). All computed from contracts + invoices — no bank data.

**Dependencies:** Epic 0 + Epic 1 + Story 2.1 (useCalendarData)

**Estimated effort:** 1 dev day

---

### Story 3.1 — Dashboard Metrics Computation Hook

**Why:** Dashboard data is pure derivation from contracts + invoices. No separate API call needed. This hook centralizes the math so the UI is purely presentational.

**Files to CREATE:**

`apps/web/src/features/dashboard/useDashboardMetrics.ts`:

```typescript
// Derives DashboardMetrics from contracts + invoices queries
//
// totalMonthlyIncome: sum of all active income contracts normalized to monthly
// totalMonthlyExpenses: sum of all active expense contracts normalized to monthly
// availableToSpend: totalMonthlyIncome + totalMonthlyExpenses (expenses are negative)
// cashRunwayDays: if available <= 0, 0. Else: how many days until balance projected < 0.
//   Simplified for MVP: availableToSpend / (dailyBurnRate) where dailyBurnRate = expenses/30
// contractsNeedingAttention: contracts where health = 'yellow' | 'red'
// upcomingPayments: CalendarPayments for next 7 days (derived from contracts)
// overdueInvoices: invoices where status = 'overdue' or (status = 'open' AND due_date < today)

export function useDashboardMetrics(): {
  metrics: DashboardMetrics | null;
  isLoading: boolean;
}
```

**Implementation notes:**
- Uses `useQuery(['contracts'])` and `useQuery(['invoices'])` — same cache keys as other features
- No new API calls — reuses existing query cache
- Pure TypeScript computation, fully testable without SurrealDB

**Acceptance criteria:**
- [ ] `totalMonthlyIncome` correctly sums all `type === 'income'` contracts
- [ ] `totalMonthlyExpenses` correctly sums all non-income active contracts
- [ ] `availableToSpend` = income + expenses (expenses are negative, correct sign)
- [ ] `cashRunwayDays` is positive when income > expenses
- [ ] `contractsNeedingAttention` includes yellow + red health only
- [ ] `upcomingPayments` covers exactly next 7 days
- [ ] `yarn typecheck` passes

---

### Story 3.2 — Dashboard Metric Cards

**Why:** The top section of Dashboard shows 3-4 hero metrics. These are the most important numbers in the app and must be implemented to the exact spec in design-system-v1.md §11 Metric Card pattern.

**Files to CREATE:**

`apps/web/src/features/dashboard/MetricCard.tsx`:

```
Per design-system-v1.md §11:
┌────────────────────┐
│ VERFÜGBAR          │  ← .fo-label
│ €485               │  ← .fo-display (32px/700, tabular-nums)
│ von €3.200         │  ← .fo-caption
└────────────────────┘

Props:
  label: string
  value: number | string
  caption?: string
  color?: 'default' | 'positive' | 'critical'
  size?: 'sm' | 'lg'

4 cards on Dashboard:
  1. VERFÜGBAR      €[available]       von €[income]/Monat
  2. MONATLICHE KOSTEN  €[expenses]    [X] Verträge aktiv
  3. EINNAHMEN      +€[income]         [interval summary]
  4. CASH RUNWAY    [X] Tage          bei aktuellem Verbrauch
```

**Acceptance criteria:**
- [ ] .fo-display 32px font renders correctly
- [ ] tabular-nums active on all amounts
- [ ] Positive available-to-spend shows emerald
- [ ] Negative available-to-spend shows rose (critical context)
- [ ] `yarn typecheck` passes

---

### Story 3.3 — Dashboard Page

**Why:** Assembles the full dashboard from MetricCards + pressing payments list + attention items section.

**Files to CREATE:**

`apps/web/src/features/dashboard/DashboardPage.tsx`:

```
Layout (3 sections):

Section 1 — Status Metrics (top, 4 MetricCards in a row):
  VERFÜGBAR · MONATLICHE KOSTEN · EINNAHMEN · CASH RUNWAY
  Grid: repeat(auto-fit, minmax(180px, 1fr)), gap: 16px

Section 2 — Pressing Payments (next 7 days):
  Title: "Diese Woche" + date range
  List of CalendarPayment rows:
    [date]  [name / provider]  [AmountDisplay]
  If empty: "Keine Zahlungen diese Woche. Genießen Sie die Ruhe."
  Max 8 items shown, "Zum Kalender →" link if more.

Section 3 — Attention (contracts needing action):
  Title: "Handlungsbedarf" + badge count
  Only shown if contractsNeedingAttention.length > 0
  List of contract attention rows:
    [health chip]  [name]  [end_date / notice deadline]  [→ Vertrag öffnen]
  Empty = entire section hidden.

Section 4 — Open Invoices (from Story 4):
  Stub for now: rendered from useDashboardMetrics().overdueInvoices
  "Offene Rechnungen" section, shown only if overdueInvoices.length > 0

Page padding: 32px. Section gap: 32px.
```

**Files to DELETE:**
- `apps/web/src/features/dashboard/DashboardGrid.tsx` (12-col grid — wrong approach)
- `apps/web/src/features/dashboard/WidgetWrapper.tsx`
- `apps/web/src/features/dashboard/useBalanceProjection.ts`
- `apps/web/src/features/dashboard/useDashboardLayout.ts`
- `apps/web/src/features/dashboard/index.ts`

(The old dashboard (Phase 1 legacy) also references a `DashboardPage` in a subdirectory.
Check if `apps/web/src/features/dashboard/DashboardPage.tsx` exists from the old Phase 1
implementation and delete it too before creating the new one.)

**Acceptance criteria:**
- [ ] 4 metric cards render correctly with real contract data
- [ ] Pressing payments list shows next 7 days of payments
- [ ] Attention section hidden when no yellow/red contracts
- [ ] Attention section shows contracts with health = yellow/red
- [ ] Open invoices section shows overdue invoices
- [ ] Loading skeleton shown during data fetch
- [ ] `yarn typecheck` passes

---

## Epic 4: Open Invoices

**Goal:** Track one-time bills (open, paid, overdue). They feed into Calendar and Dashboard automatically via the `invoice` table.

**Dependencies:** Epic 0 (schema + types) + Story 1.1 (AmountDisplay)

**Estimated effort:** 0.5 dev days

---

### Story 4.1 — Invoice List + Form

**Why:** Open invoices are simpler than contracts — no interval, no health computation (just overdue = past due date). One page with a list + a simple form slide-over.

**Files to CREATE:**

`apps/web/src/features/invoices/InvoicesPage.tsx`:

```
Layout:
- Page header: "Offene Rechnungen" + "+ Neue Rechnung" button
- Filter chips: Alle | Offen | Überfällig
- List of invoice rows:
  [due_date]  [payee]  [notes?]  [AmountDisplay]  [status chip]  [Mark as Paid]

Status chips:
  Offen: Stone-100 bg, Stone-500 text, "○ Offen"
  Überfällig: Rose-50 bg, Rose-700 text, "✕ Überfällig"
  Bezahlt: Emerald-50 bg, Emerald-700 text, "✓ Bezahlt"

Empty state: "Keine offenen Rechnungen. Alles bezahlt!"
  (Positive framing — this is the good state.)
```

`apps/web/src/features/invoices/InvoiceForm.tsx`:

```
Slide-over (same animation pattern as ContractForm).
Fields:
  Empfänger (payee) — required, text input
  Betrag — required, positive number (always stored as negative)
  Fällig am (due_date) — required, date input
  Notiz — optional, textarea

On save: createInvoice() mutation, invalidates ['invoices'] query.
```

`apps/web/src/features/invoices/index.ts` — barrel export

**Navigation integration:**
- Add "Rechnungen" as a 5th nav item in App.tsx? NO — per the design brief,
  open invoices are NOT a separate top-level page. They are an overlay/quick-access.
  For MVP: add a small "Rechnungen" section at the bottom of the Verträge page,
  separated by a divider, with "+ Neue Rechnung" quick-add button.
  Or expose via the Dashboard attention section.

**Decision:** Put InvoicesPage content as a secondary section on the Verträge page:
```
Verträge page layout:
  [Summary metrics]
  [Contracts list]     ← primary
  ──────────────────
  [Offene Rechnungen]  ← secondary, collapsible, shows count badge
  [+ Rechnung hinzufügen]
```

**Acceptance criteria:**
- [ ] Invoice list renders on Verträge page (secondary section)
- [ ] "+ Neue Rechnung" opens form slide-over
- [ ] Overdue invoices auto-detected (due_date < today)
- [ ] "Bezahlt markieren" button calls markInvoicePaid() and updates UI
- [ ] Invoice due dates appear in Calendar (from Story 2.1)
- [ ] Overdue invoices appear in Dashboard attention section (from Story 3.3)
- [ ] `yarn typecheck` passes

---

## Epic 5: Polish

**Goal:** Keyboard shortcuts, command palette, loading skeletons, mobile responsiveness. The features work — now make them feel premium.

**Dependencies:** All prior epics complete

**Estimated effort:** 1 dev day

---

### Story 5.1 — Loading Skeletons

**Why:** With SurrealDB WebSocket, data loads fast but not instantly. Skeletons prevent layout shift and signal "it's loading, not broken."

**Files to CREATE:**

`apps/web/src/components/Skeleton.tsx`:

```typescript
// Variants:
//   'row' — single line placeholder (for list rows)
//   'card' — rectangle placeholder (for metric cards)
//   'text' — short text placeholder

// CSS: .fo-skeleton { background: rgb(var(--border)); border-radius: 4px; animation: pulse 1.5s ease-in-out infinite; }
// @keyframes pulse: opacity 0.4 → 0.8 → 0.4

type SkeletonProps = {
  variant?: 'row' | 'card' | 'text';
  width?: string;
  height?: string;
  count?: number;     // render N skeletons
};
```

**Usage:**
- ContractsPage loading: 6x `<Skeleton variant="row" />`
- CalendarPage loading: 4x `<Skeleton variant="card" height="80px" />`
- DashboardPage loading: 4x `<Skeleton variant="card" height="96px" />` + 3x row

**Acceptance criteria:**
- [ ] Skeletons render during SurrealDB data fetch
- [ ] No layout shift when data replaces skeletons
- [ ] `prefers-reduced-motion` disables pulse animation
- [ ] `yarn typecheck` passes

---

### Story 5.2 — Keyboard Shortcuts

**Why:** Power user. ⌘K, ⌘N, ⌘1-4 are the three interactions the daily loop needs.

**Files to MODIFY:**

`apps/web/src/app/KeyboardShortcuts.tsx`:

```
Current: handles ⌘K (palette) + ⌘N (quick add)
Changes:
- ADD: ⌘1 → navigate to dashboard
- ADD: ⌘2 → navigate to contracts
- ADD: ⌘3 → navigate to calendar
- ADD: ⌘4 → navigate to settings
- ADD: Escape → close any open slide-over (via a context or event bus)
- KEEP: ⌘K, ⌘N handlers
- ADD: ? → show keyboard shortcut cheatsheet (simple modal)
```

**Acceptance criteria:**
- [ ] ⌘1-4 navigate between pages correctly
- [ ] ⌘K opens command palette stub
- [ ] ⌘N opens quick add stub (or contract form as quick add)
- [ ] Escape closes open slide-overs
- [ ] Shortcuts don't fire when focus is inside a text input
- [ ] `yarn typecheck` passes

---

### Story 5.3 — Command Palette (MVP Scope)

**Why:** ⌘K is a power-user affordance. For MVP: navigate to pages + quick actions. No fuzzy contract search yet (that's post-MVP).

**Files to CREATE/MODIFY:**

`apps/web/src/app/CommandPalette.tsx` — **replace existing:**

```
MVP entries (8 total):
  Navigation (4):
    "Dashboard öffnen"          ⌘1
    "Verträge öffnen"           ⌘2
    "Kalender öffnen"           ⌘3
    "Einstellungen öffnen"      ⌘4
  Actions (4):
    "Neuen Vertrag anlegen"     ⌘N
    "Neue Rechnung anlegen"     (no shortcut)
    "Setup-Assistent starten"   (no shortcut)
    "Zum heutigen Tag springen" (no shortcut — navigates Calendar to today)

Uses shadcn/ui Command component (cmdk).
Design: design-system-v1.md §12 Command component.
  Background: --surface-overlay
  Shadow: --shadow-lg
  Input: Stone-200 border, --accent focus ring
  Selected item: --accent-tint background
  Keyboard indicators: small .fo-kbd tags on right
```

**Acceptance criteria:**
- [ ] ⌘K opens palette
- [ ] Navigation entries switch pages
- [ ] "Neuen Vertrag anlegen" opens ContractForm
- [ ] Escape closes palette
- [ ] Palette uses new design tokens throughout
- [ ] `yarn typecheck` passes

---

### Story 5.4 — Mobile Responsiveness (PWA-Ready)

**Why:** The sidebar layout breaks on mobile. For MVP: collapse sidebar to bottom nav bar on < 768px, ensure forms are usable on phone.

**Files to MODIFY:**

`apps/web/src/styles/global.css`:

```css
/* Mobile: sidebar becomes bottom nav */
@media (max-width: 768px) {
  .fo-app-shell {
    grid-template-columns: 1fr;
    grid-template-rows: 1fr auto;
  }

  .fo-sidebar {
    flex-direction: row;
    border-right: none;
    border-top: 1px solid rgb(var(--border));
    padding: 8px 0;
    order: 2;
    justify-content: space-around;
  }

  .fo-nav-item {
    flex-direction: column;
    gap: 4px;
    padding: 6px 12px;
    font-size: 11px;
    border-left: none;
    border-top: 3px solid transparent;
  }

  .fo-nav-item.active {
    border-left-color: transparent;
    border-top-color: rgb(var(--accent));
  }
}
```

`apps/web/src/features/contracts/ContractForm.tsx`:
- Slide-over: on mobile, use full-screen bottom sheet (100vw, 90vh, fixed bottom)
  instead of right-side panel

`apps/web/index.html` (or vite entry):
- Confirm `<meta name="viewport" content="width=device-width, initial-scale=1">`
- Add `<meta name="theme-color">` and `<link rel="manifest">` for PWA

**Acceptance criteria:**
- [ ] App usable on 375px wide (iPhone SE viewport)
- [ ] Bottom nav shows on mobile
- [ ] ContractForm takes full screen on mobile
- [ ] `yarn typecheck` passes

---

## Dependency Graph

```
Epic 0 (Foundation)
  └── 0.1 Delete modules
  └── 0.2 Design system CSS          ← unblocks all UI work
  └── 0.3 Schema update              ← unblocks all data work
  └── 0.4 MVP types + API client
  └── 0.5 App shell (sidebar nav)

Epic 1 (Contracts) — depends on Epic 0
  └── 1.1 AmountDisplay component    ← unblocks 1.2, 2.2, 3.2
  └── 1.2 Contract list (rows)       ← depends on 1.1
  └── 1.3 ContractForm updates       ← depends on 0.3
  └── 1.4 Templates                  ← depends on 1.3
  └── 1.5 Setup wizard               ← depends on 1.3, 1.4

Epic 2 (Calendar) — depends on Epic 0 + 1.1
  └── 2.1 useCalendarData (trimmed)  ← depends on 0.4
  └── 2.2 CalendarListView (tokens)  ← depends on 2.1, 1.1
  └── 2.3 CalendarPage               ← depends on 2.1, 2.2

Epic 3 (Dashboard) — depends on Epic 1 + 2.1
  └── 3.1 useDashboardMetrics        ← depends on 0.4, 2.1
  └── 3.2 MetricCard component       ← depends on 0.2
  └── 3.3 DashboardPage              ← depends on 3.1, 3.2, 1.1

Epic 4 (Invoices) — depends on Epic 0 + 1.1
  └── 4.1 InvoicesPage + Form        ← depends on 0.3, 0.4, 1.1

Epic 5 (Polish) — depends on all prior epics
  └── 5.1 Loading skeletons
  └── 5.2 Keyboard shortcuts
  └── 5.3 Command palette
  └── 5.4 Mobile responsiveness
```

---

## Sequencing for a Single Developer

Recommended order to minimize blocked time:

```
Day 1 (morning):  0.1 → 0.3 → 0.4 (delete + schema + types)
Day 1 (afternoon): 0.2 → 0.5 (design system + app shell)
Day 2 (morning):  1.1 → 1.2 → 1.3 (AmountDisplay + contract list + form)
Day 2 (afternoon): 1.4 → 1.5 (templates + wizard)
Day 3 (morning):  2.1 → 2.2 → 2.3 (calendar hook + view + page)
Day 3 (afternoon): 3.1 → 3.2 → 3.3 (dashboard metrics + cards + page)
Day 4 (morning):  4.1 (invoices)
Day 4 (afternoon): 5.1 → 5.2 → 5.3 (skeletons + shortcuts + palette)
Day 5:            5.4 + integration testing + typecheck + design QA
```

---

## File Inventory

### New files (create from scratch)

| File | Story | Purpose |
|------|-------|---------|
| `schema/002b-invoices.surql` | 0.3 | Invoice table definition |
| `apps/web/src/components/AmountDisplay.tsx` | 1.1 | Amount formatting component |
| `apps/web/src/components/Skeleton.tsx` | 5.1 | Loading skeleton component |
| `apps/web/src/features/contracts/ContractRow.tsx` | 1.2 | List-style contract row |
| `apps/web/src/features/contracts/contract-templates.ts` | 1.4 | Template data + types |
| `apps/web/src/features/contracts/TemplateSelector.tsx` | 1.4 | Template picker modal |
| `apps/web/src/features/contracts/SetupWizard.tsx` | 1.5 | First-run wizard |
| `apps/web/src/features/dashboard/DashboardPage.tsx` | 3.3 | Main dashboard |
| `apps/web/src/features/dashboard/MetricCard.tsx` | 3.2 | Hero metric display |
| `apps/web/src/features/dashboard/useDashboardMetrics.ts` | 3.1 | Metrics computation hook |
| `apps/web/src/features/invoices/InvoicesPage.tsx` | 4.1 | Invoice list |
| `apps/web/src/features/invoices/InvoiceForm.tsx` | 4.1 | Invoice create/edit form |
| `apps/web/src/features/invoices/index.ts` | 4.1 | Barrel export |
| `apps/web/src/features/settings/SettingsPage.tsx` | 0.5 | Settings placeholder |

### Modified files

| File | Story | Changes |
|------|-------|---------|
| `apps/web/src/styles/global.css` | 0.2, 5.4 | Full design system replacement |
| `apps/web/src/core/types/finance.ts` | 0.4 | Replace with MVP types |
| `apps/web/src/core/api/finance-api.ts` | 0.4 | Replace with 10 MVP functions |
| `apps/web/src/app/App.tsx` | 0.5 | Replace tab shell with sidebar nav |
| `apps/web/src/app/KeyboardShortcuts.tsx` | 5.2 | Add ⌘1-4, Escape, ? |
| `apps/web/src/app/CommandPalette.tsx` | 5.3 | Replace with MVP 8-entry palette |
| `apps/web/src/features/contracts/ContractsPage.tsx` | 1.2 | Row layout + new design tokens |
| `apps/web/src/features/contracts/ContractForm.tsx` | 1.3 | income type + next_payment_date |
| `apps/web/src/features/calendar/useCalendarData.ts` | 2.1 | Trim to contracts + invoices |
| `apps/web/src/features/calendar/CalendarListView.tsx` | 2.2 | New tokens + invoice source |
| `apps/web/src/features/calendar/CalendarPage.tsx` | 2.3 | Remove grid, add summary bar |
| `schema/002-contracts.surql` | 0.3 | Add income type + next_payment_date |
| `schema/005-api-endpoints.surql` | 0.3 | Add invoice endpoints |
| `schema/apply.sh` | 0.3 | Update file list |

### Deleted files (not exhaustive — all non-listed feature modules)

| Directory/File | Story |
|----------------|-------|
| `apps/web/src/features/analytics/` | 0.1 |
| `apps/web/src/features/budget/` | 0.1 |
| `apps/web/src/features/import/` | 0.1 |
| `apps/web/src/features/intelligence/` | 0.1 |
| `apps/web/src/features/review/` | 0.1 |
| `apps/web/src/features/quick-add/` | 0.1 |
| `apps/web/src/features/categories/` | 0.1 |
| `apps/web/src/features/finance/` | 0.1 + 0.5 |
| `apps/web/src/features/calendar/CalendarGridView.tsx` | 2.3 |
| `apps/web/src/features/calendar/holidays.ts` + related | 2.3 |
| `apps/web/src/features/dashboard/DashboardGrid.tsx` | 3.3 |
| `apps/web/src/features/dashboard/WidgetWrapper.tsx` | 3.3 |
| `apps/web/src/features/dashboard/useBalanceProjection.ts` | 3.3 |
| `apps/web/src/features/dashboard/useDashboardLayout.ts` | 3.3 |
| `apps/worker/` | 0.1 |
| `schema/003-command-platform.surql` | 0.1 |
| `schema/004-intelligence.surql` | 0.1 |
| `schema/007-014-*.surql` | 0.1 |

---

## Quality Checklist (run before marking any Epic complete)

```
[ ] yarn typecheck              — zero TypeScript errors
[ ] yarn lint:fix               — zero lint errors
[ ] yarn workspace @actual-app/web build — successful production build
[ ] Manual smoke test: create a contract, see it in calendar + dashboard
[ ] Open DevTools: no console errors at idle
[ ] Design QA: compare against design-system-v1.md §11 reference layouts
[ ] Keyboard: Tab through all interactive elements — visible focus ring
[ ] Empty state: delete all contracts — verify all empty states render
[ ] Mobile: Chrome DevTools device simulation at 375px
```

---

## Risks and Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| SurrealDB schema ALTER conflicts — existing data doesn't match new fields | Medium | Run `REMOVE TABLE contract` + reapply schema in local dev. Never delete prod data. |
| `useCalendarData` balance projection is inaccurate without real account data | Low | Balance starts at 0, documented as MVP limitation. Cash runway is directionally correct even with 0 baseline. |
| shadcn/ui Command component doesn't match design tokens out of box | Low | shadcn uses CSS variables — override `--popover` and `--border` to match Stone system. |
| ContractCard imports break after ContractRow is added | Low | Keep ContractCard for backward compat, use ContractRow in ContractsPage, delete ContractCard once ContractsPage fully migrated in Story 1.2. |
| Design system CSS migration breaks existing Tailwind utility usage | Medium | Global CSS custom properties coexist with Tailwind. `rgb(var(--text-primary))` works alongside `text-stone-900`. Migrate incrementally per story, not all at once. |

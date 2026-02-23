# Actual Budget++ Requirements Specification

> Generated from deep brainstorming session (112 questions, 6 rounds, 3 UX refinement passes).
> This document is the input for `/sc:design` (architecture) and implementation planning.

## 1. Product Vision

**"Finance OS"** — A daily-use personal finance command center that combines Finanzguru's ease of use, StarMoney's feature depth, AI automation, and full data sovereignty.

- **User**: Single power user (desktop-first, German financial context)
- **Usage**: Daily. Open like a cockpit, not a chore.
- **Design**: Dense, modern, premium feel. Fluid but information-rich. Not minimal consumer app — operational command center.
- **Philosophy**: The app gets smarter over time. Progressive automation reduces manual work from 20 items/week to 2-3 items/week.

## 2. Tech Stack (Existing — No Migration)

| Layer              | Technology                            | Notes                                                                   |
| ------------------ | ------------------------------------- | ----------------------------------------------------------------------- |
| Frontend           | React 19 + Vite 7                     | Monorepo: `packages/desktop-client/`                                    |
| Styling            | `@emotion/css` (CSS-in-JS)            | NOT Tailwind. Premium feel via design tokens, not framework swap.       |
| UI Primitives      | `react-aria-components`               | Accessible Button (`isDisabled`, `onPress`), Select, etc.               |
| Component Library  | `@actual-app/components`              | View, Text, Button, Input, Card, Select, Menu, Popover, Toggle, Tooltip |
| Command Palette    | `cmdk` v1.1.1                         | Already exists as `CommandBar.tsx` — extend, don't rebuild              |
| Keyboard Shortcuts | `react-hotkeys-hook` v5.2.4           | Already installed                                                       |
| Dashboard Layout   | `react-grid-layout` v2.2.2            | Already installed — enables widget customization                        |
| Drag & Drop        | `react-dnd` v16.0.1                   | Already installed                                                       |
| Backend            | Express 5 (sync-server)               | `packages/sync-server/`                                                 |
| Core Engine        | loot-core                             | Handler bridge: client → loot-core → HTTP → Express                     |
| Database           | SQLite (account.sqlite)               | Custom tables via sync-server migrations                                |
| AI                 | Ollama (VPS, 32GB RAM shared)         | `mistral-small` default, `llama3.2-vision` for OCR                      |
| Infrastructure     | Docker, GHCR CI/CD, VPS 212.69.84.228 | Self-hosted, full data sovereignty                                      |
| Bank Sync          | Docker sync scripts (community)       | Max control, n8n integration pipeline                                   |
| Mobile             | PWA (Progressive Web App)             | Same React codebase, responsive design                                  |

## 3. Architecture Decisions (Locked)

### 3.1 Contract/Schedule Model

**ONE enriched contract object, layered on Actual's schedule engine.**

- A "contract" is the user-facing concept. Under the hood it references Actual's `schedule_id`.
- `contracts` table adds: type, notice_period, cancellation_date, auto_renewal, payment_history, documents, notes.
- Multiple payment events per contract: primary schedule (monthly) + additional_events (annual fees, one-time charges).
- Price changes logged with history. System detects amount mismatches from bank transactions.
- Contract with no payment (free trial) → `schedule_id = null`.

### 3.2 Category System

**Pre-built 2-level German category tree, customizable, with lightweight tags.**

Default tree:
| Level 1 | Level 2 |
|---------|---------|
| Wohnen | Miete, Nebenkosten, Strom, Gas, Internet, Hausrat, Renovierung |
| Mobilität | Auto-Versicherung, Tanken, Werkstatt, Leasing, ÖPNV, Taxi, Fahrrad |
| Lebensmittel | Supermarkt, Restaurant, Lieferdienst, Kaffee, Bäckerei, Markt |
| Freizeit | Streaming, Sport, Ausgehen, Hobbys, Reisen, Kultur, Bücher |
| Versicherungen | Kranken, Haftpflicht, Hausrat, BU, Rechtsschutz, KFZ, Leben |
| Finanzen | Sparen, Kredit-Tilgung, Zinsen, Gebühren, Investitionen |
| Gesundheit | Apotheke, Arzt, Brille, Zahnarzt, Fitness |
| Einkäufe | Kleidung, Elektronik, Möbel, Haushalt, Geschenke, Online |
| Bildung | Kurse, Software, Abonnements, Schule |
| Kinder | Betreuung, Kleidung, Schule, Spielzeug, Taschengeld |
| Sonstiges | Unkategorisiert, Bargeldabhebung, Gebühren, Sonstiges |
| Einkommen | Gehalt, Nebeneinkommen, Kindergeld, Zinserträge, Erstattungen |

- User can add 3rd level if needed (not pre-populated)
- Each L1 category has distinct color + icon
- Free-form tags: `Urlaub`, `Steuerlich relevant`, `Geteilt`, `Einmalig` (pre-suggested, user-extensible)
- Contracts bind to categories: all matched transactions inherit automatically
- IBAN-based categorization rules for German direct debits

### 3.3 AI Strategy — "Smart Matching"

**Three-tier system: Pinned → AI High Confidence → AI Low Confidence.**

| Tier           | Trigger                 | Behavior                                            | UX                   |
| -------------- | ----------------------- | --------------------------------------------------- | -------------------- |
| Pinned         | User explicitly assigns | Deterministic default. Overridable per-transaction. | Lock icon            |
| AI High (>85%) | Pattern + history       | Auto-categorize silently                            | "AI" sparkle badge   |
| AI Low (<85%)  | New/rare payee          | Auto-categorize + add to review queue               | Yellow "?" indicator |

- Even pinned assignments can be overridden per-transaction
- AI learns from user corrections over time
- After 5 consistent categorizations for a payee, system suggests auto-pin
- After 95%+ accuracy over 10 transactions, auto-promote to silent processing

### 3.4 Unified Review Queue — "Needs Attention"

**All AI-generated items in one unified inbox.**

Item types: Uncategorized transactions, Recurring pattern detection, Amount anomalies, Budget suggestions.

Priority tiers: Urgent (red, e.g. potential overdraft) → Review (yellow, e.g. low-confidence AI) → Suggestions (blue, e.g. budget recommendation).

Key behaviors: Batch accept >90% confidence, delegation rules per-payee, undo stack, auto-dismiss when resolved, snooze with smart timing, weekly digest.

### 3.5 Bank Sync

**Docker sync scripts** (community approach, maximum control).

- Transactions route through n8n before import → AI categorization in pipeline
- Sync status dashboard with health monitoring
- Manual sync trigger + scheduled sync
- Transaction preview before commit with AI-suggested categories
- Amount mismatch detection against existing schedules

### 3.6 Mobile Strategy

**PWA first.** Same React codebase, responsive design. No native app until specific need arises (camera OCR, offline-first, biometric auth).

## 4. Feature Specifications

### 4.1 Operations Dashboard (Home Screen)

The cockpit is for MANAGING money, not ANALYZING it. No charts, no category breakdowns, no recent transactions on this page.

**Hero metrics:**

- **Total Balance**: Sum across all accounts
- **Available to Spend**: Total minus all committed future payments this month
- **Cash Runway**: Available / daily burn rate → "Money lasts until Mar 27"

**Layout (4-column):**

```
┌─ MONEY PULSE (dismissible) ──────────────────────────────────────────────┐
│ €2,325 total · €485 available · Runway: Mar 27 · ⚠ 3 reviews           │
├──────────────────────────────────────────────────────────────────────────┤
│ ACCOUNTS          │ UPCOMING (30 days)           │ ACTIONS              │
│ Giro    €2,340    │ TODAY / THIS WEEK / NEXT...  │ + QUICK ADD          │
│ Visa     -€180    │ Grouped by week with totals  │ [Amount] [Category]  │
│ PayPal    €120    │ Running balance projection   │ [Save] [+New] [Park] │
│ Cash       €45    │ Crunch day indicators        │                      │
│                   │ Income entries (toggleable)   │ ── ATTENTION ──      │
│ ── THIS MONTH ──  │ "LATER" section (collapsed)  │ Inline quick-actions │
│ Income   +€3,200  │                              │ per item type        │
│ Fixed    -€1,840  │ BALANCE PROJECTION           │ Badge with count +   │
│ Spent      -€890  │ Today → ... → Salary → End   │ priority color       │
│ Available  €485   │                              │                      │
│ Runway: Mar 27    │                              │                      │
└───────────────────┴──────────────────────────────┴──────────────────────┘
```

**Widgets (customizable via react-grid-layout in Phase 2):**

- Account Balances card
- "This Month" summary card
- Upcoming Payments list (configurable depth)
- Attention Queue
- Quick Add inline form
- Balance Projection chart
- Cash Runway indicator
- Money Pulse daily brief
- Budget Gauges (when budgets active)

**Money Pulse daily brief (top bar, dismissible):**
Three-line summary on app open:
"€2,325 total · No payments today · 3 items need review · This week: €976 · After: €1,349 available"

### 4.2 Contract & Recurring Payment Management

**Data model:**

```
Contract {
  // Identity
  id, name, provider, category_id, type (subscription|insurance|utility|loan|membership|other)

  // Primary payment (linked to Actual Schedule)
  schedule_id → Actual Schedule
  amount, interval (monthly|quarterly|semi-annual|annual|weekly|custom)
  next_payment_date, payment_account_id

  // Additional payment events
  additional_events: [{ description, amount, interval, month?, date?, one_time }]

  // Contract terms
  start_date, end_date, notice_period_months, auto_renewal (boolean)
  cancellation_deadline → computed: end_date - notice_period

  // Price history
  price_changes: [{ date, old_amount, new_amount, reason }]

  // Health
  status: active|expiring|cancelled|paused
  health: green|yellow|red (computed)

  // Meta
  notes, tags[], documents[], linked_transaction_ids[]
  iban, counterparty

  // Computed
  annual_cost, cost_per_day, total_increase_since_start
}
```

**List view features:**

- Health indicators: 🟢 (good) 🟡 (renewal in 60 days) 🔴 (cancellation deadline in 30 days)
- Sort by: name, amount, next payment, type, status, annual cost
- Filter by: type, status, category, account
- Group by: type, category, account
- Multi-select with Shift+click → "Selected: 5 contracts, €180/month"
- Monthly/Annual cost toggle display
- Cost-per-day display
- Total commitment summary card

**Contract templates (pre-built):**
Mietvertrag (12 months notice typical), Handyvertrag (24 months, 3 months notice), Stromvertrag (12 months, 6 weeks notice), Versicherung (varies), Streaming (monthly, cancel anytime), Fitnessstudio (12-24 months, 3 months notice).

**Contract creation flows:**

1. Manual: Click "+" → name, amount, interval, category (auto-suggest), optional fields on expand
2. AI-detected: After 3 recurring bank transactions → appears in review queue → one-click creation with pre-filled data
3. Bulk import: From Finanzguru export or during Getting Started wizard

**Price change handling:**

1. Bank transaction amount differs from schedule → review queue item
2. User clicks "Update to new amount" → schedule updates, change logged in history
3. Cashflow projections immediately use new amount

**Cancellation features:**

- Cancellation deadline computed and displayed prominently
- Deadline approaching → contract turns 🟡 then 🔴
- Cancellation letter template: pre-filled Kündigungsschreiben (name, address, contract number, date) for copy-paste

**Contract timeline visualization (Phase 3):**
Horizontal timeline showing all contracts across years with price changes and cancellation deadlines marked.

### 4.3 Payment Calendar / Cashflow Projection

**Default view:** Next 30 days, grouped by week, with running balance.

**Layout:**

- Week headers with total: "THIS WEEK — 3 items, €976"
- Each item: date, contract name, amount, account icon
- Running balance after each payment cluster
- "LATER" section collapsed (click to expand)
- Crunch day indicators: "March 1st: 5 payments, €1,240"
- Income entries (salary) shown in green, toggleable

**Views available:**

- Next 30 days (default, grouped by week)
- Full month grid (calendar view)
- Full year overview
- Payday cycle toggle (27th→26th instead of 1st→last)

**Balance projection:**

- Running balance from today forward
- Shows balance at each payment cluster
- Income (salary on predictable date) included
- Balance corridor: red zone when below user-set threshold (e.g., €500 buffer)

**Scenario mode (Phase 3):**
Drag payments to different dates → see how projection changes.

### 4.4 Quick Add Expense

**Base flow (3-4 seconds):** Amount → Category → Save.

**Layout:**

```
┌─ QUICK ADD (⌘N) ─────────────────────────────────────────────┐
│  PRESETS: [☕ 3.80] [🛒 Supermarkt] [🍕 Restaurant] [📸 OCR] │
│  Amount: [€________] ← calculator: "12.50+8.30" works        │
│  Category: [________] ← fuzzy search + frecency              │
│  ─── expand (Tab) ────────                                    │
│  Payee: [____]  Notes: [____]  Account: [Cash ▾]  Date: [▾]  │
│  ┌─ RECENT: [REWE -34.50] [Bäcker -5.80] [Taxi -18] ────┐   │
│  [Save ↵] [Save+New ⌘↵] [Save+Dup ⌘⇧↵] [Park ⌘P]          │
└───────────────────────────────────────────────────────────────┘
```

**Features:**
| Feature | Shortcut | Description |
|---------|----------|-------------|
| Preset buttons | Click | User-pinned + auto-learned from frequency (coexist) |
| Save + New | ⌘+Enter | Save and open fresh form |
| Save + Duplicate | ⌘+Shift+Enter | Save and open with same category |
| Park for Later | ⌘+P | Save amount only as draft, categorize later |
| Recent templates | Click | Clone recent transaction as new entry |
| Calculator | Type math | "12.50+8.30" computes in amount field |
| Smart Amount | Auto | Pre-fills typical amount when category selected |
| +/- toggle | Click | Default expense, toggle for income |
| Photo attach | 📎 / 📸 | Camera or file upload, OCR if enabled |
| Fuzzy search | Type | "Kaf" → "Kaffee" with frecency |
| Expense Train | ⌘T | Rapid multi-entry mode with running total |

**"Park for Later" system:**
Drafts appear in attention queue. AI suggests categories based on: time of day (morning → Bäckerei), amount patterns (€3-5 → Kaffee), user history. "Accept All AI" for batch categorization.

**"Expense Train" mode:**
Rapid sequential entry with visible running total. All items saved at once to default account.

### 4.5 Invoice OCR

**Use Case A — Cash receipt scan (Phase 2):**

1. Camera button in Quick Add (mobile) or drag-drop zone (desktop)
2. Image uploaded to VPS → Ollama llama3.2-vision processes
3. Extraction: amount (90%+), date (90%+), vendor (70-80%)
4. Pre-filled Quick Add form with receipt thumbnail
5. Side-by-side: receipt image with highlighted extraction regions + extracted data
6. User confirms/adjusts → Save with receipt attached

**Use Case B — Digital invoice linking (Phase 2):**

1. On contract detail page: "Upload invoice" / drag PDF
2. OCR extracts: amount, date, invoice number
3. "This matches Vodafone contract (€39.90/month). Link?" → Confirm

**Use Case C — Receipt-to-transaction matching (Phase 2):**
Receipt inbox: unmatched receipts waiting for bank transaction. When match found → auto-link suggestion.

**Use Case D — Email forwarding (Phase 3):**
Forward invoice email → n8n processes → draft appears in review queue.

**Technical constraints:**

- llama3.2-vision 11B needs ~8GB RAM. On 32GB shared VPS → may need smaller model or request queuing.
- Always show for review — never auto-save from OCR.

### 4.6 Data Migration & Import

**Getting Started wizard (first-run):**

1. CREATE ACCOUNTS: Add bank accounts, credit cards, cash wallet, PayPal
2. IMPORT DATA: [Finanzguru XLSX] [Bank CSV] [Skip]
3. SET UP BANK SYNC: [Configure Docker sync] [Later]
4. REVIEW CONTRACTS: "23 recurring payments detected. Verify and enrich."
5. CUSTOMIZE CATEGORIES: [German defaults] [Map from Finanzguru] [Customize]

**Finanzguru import wizard:**

- Upload XLSX export (columns: Hauptkategorie, Unterkategorie, transaction fields, contract info)
- Auto-map Finanzguru categories to our tree (with manual override)
- Import transactions, detect recurring patterns
- Preview before committing

**Bank CSV import:**

- Auto-detect German bank format: DKB, ING, Sparkasse, Commerzbank, N26, Comdirect, Deutsche Bank
- Handle encoding (Windows-1252) and separator (semicolon) issues
- Smart deduplication against already-imported transactions

**Import advisor:**
"234 transactions detected. 189 can be auto-categorized. 23 look like contracts. 22 need manual review. [Import]"

**Additional formats (Phase 2):**

- MT940 (SWIFT German bank statement)
- CAMT.053 (ISO 20022 XML)

### 4.7 Statistics / Analytics

Separate page from dashboard. NOT operational — analytical.

**Core views (Phase 2):**
| View | Description |
|------|------------|
| Spending by Category | Bar/pie/treemap with L1→L2 drill-down |
| Monthly Overview | Income vs expenses waterfall, net savings trend |
| Fixed vs Variable | Committed (contracts) vs discretionary breakdown |
| Spending Trends | Line chart per category over time |
| Budget vs Actual | Per-category comparison (when budgets set up) |
| "What Changed?" | This month vs last month, biggest deltas |
| Top Merchants | "€2,340 at REWE this year, €890 at Amazon" |

**Advanced views (Phase 3):**

- Subscription creep tracker (total subscriptions over time)
- Spending velocity ("At current pace: €3,100 this month")
- Seasonal patterns ("More in Dec and Aug")
- Merchant loyalty ("REWE 3.2x/week, avg €38")
- Year-over-year comparison
- Cost of living trend (core costs over 12 months)
- Annual report PDF export

**All views:** Time range selector (month, quarter, year, custom, YoY comparison).

### 4.8 Budgeting (Progressive, Phase 2+)

- Envelope-style: assign money to categories
- Rollover: unspent budget rolls (configurable per category)
- Hero metric: "Left to spend" = budget - committed - already spent
- Budget alerts: "Essen 85% used, 10 days left"
- AI budget suggestions from 3-month spending average
- Savings goals with progress bars (Phase 3)

### 4.9 Loan Tracking (Phase 3)

- Loan IS a contract with type "Kredit" + additional fields
- Additional fields: principal, interest_rate, term_months, remaining_balance
- Tilgungsplan visualization: each payment → principal, interest, remaining
- Loan overview card: original amount, current balance, monthly payment, remaining term
- Early repayment calculator: "Pay €200 extra → save €X interest, finish Y months early"

## 5. Global UX Patterns

### 5.1 Command Palette (⌘K)

Extends existing `CommandBar.tsx` (cmdk v1.1.1).

**Modes:**
| Mode | Trigger | Function |
|------|---------|----------|
| Search | Type anything | Transactions, contracts, payees, categories |
| Navigate | Type page name | Go to any page |
| Actions | Type ">" | `> add`, `> contract`, `> review`, `> sync` |
| Calculator | Type "=" | `= 3200 - 1840` → shows result |
| Transaction search | "€89" or "REWE" | Find by amount or payee |
| Contract search | Contract name | Show details inline with quick actions |

Context-sensitive: on contracts page → contract actions surface first.

### 5.2 Keyboard Shortcuts

Uses `react-hotkeys-hook` (already installed).

| Shortcut | Action                            |
| -------- | --------------------------------- |
| ⌘K       | Command palette                   |
| ⌘N       | Quick add expense                 |
| ⌘T       | Expense train mode                |
| ⌘1-9     | Navigate to page                  |
| J / K    | Navigate up/down in lists         |
| Enter    | Open selected item                |
| E        | Edit selected item inline         |
| Esc      | Close overlay / go back           |
| ⌘Z       | Undo last action                  |
| ?        | Show keyboard shortcuts reference |

### 5.3 Navigation Structure

```
⌘1  Dashboard        ← Operations cockpit
⌘2  Accounts         ← Account list + transactions
⌘3  Contracts        ← All recurring payments
⌘4  Calendar         ← Payment timeline
⌘5  Budget           ← Envelope budgets
⌘6  Analytics        ← Charts + reports
⌘7  Import           ← Bank sync + data import
⌘8  Review (badge)   ← AI review queue
⌘9  Settings         ← Configuration

Always available (overlays, not pages):
⌘N  Quick Add
⌘K  Command Palette
```

**Progressive feature discovery:**

- First visit: Dashboard + Accounts + Import. Others dimmed with unlock hints.
- After import: Contracts + Calendar activate
- After AI processes: Review queue appears
- After budgets set: Budget page activates

### 5.4 Micro-Interactions (Premium Feel)

| Pattern                        | Description                                      | Phase |
| ------------------------------ | ------------------------------------------------ | ----- |
| Inline editing                 | Click amount/category in lists → edit in place   | 1     |
| Bulk select                    | Shift+Click range → batch categorize/tag/delete  | 1     |
| Toast + Undo                   | Every action → "Saved" toast with 10-sec undo    | 1     |
| Skeleton loading               | Gray pulsing shapes (not spinners)               | 1     |
| Smooth transitions             | Cards slide in, dismissed items fade out         | 1     |
| Color-coded amounts            | Expenses red, income green, transfers gray       | 1     |
| Empty state guidance           | "No contracts yet. [Import] or [Add first]"      | 1     |
| "Last visited" memory          | App reopens to last page                         | 1     |
| Breadcrumbs                    | Dashboard > Contracts > FitX                     | 1     |
| Amount formatting              | Auto €, comma decimals (German), thousand seps   | 1     |
| Fuzzy search                   | Everywhere: contracts, payees, categories, notes | 1     |
| Context menus                  | Right-click → quick actions                      | 2     |
| Smart date input               | "morgen", "letzten Freitag" → parsed (German)    | 2     |
| Density toggle                 | Comfortable / Dense / Compact                    | 2     |
| Drag-and-drop                  | Categorize by dragging transactions              | 2     |
| Dashboard widget customization | react-grid-layout drag/resize                    | 2     |

### 5.5 Design Token Refresh

Update `packages/component-library/src/theme.ts`:

- Modern color palette (inspired by Linear/Superhuman, not "2011 open source")
- Consistent spacing scale: 4/8/12/16/24/32/48px
- Typography: Inter (already used), refined size/weight scale
- Subtle shadows and border-radius for premium card feel
- Smooth hover/focus transitions
- Color-coded categories with distinct hues per L1

## 6. Phase Plan

### Phase 1 — "Start Using It" (MVP)

**Goal:** Contract overview + payment calendar + dashboard. User opens the app daily.

| Area            | Scope                                                                                                                 |
| --------------- | --------------------------------------------------------------------------------------------------------------------- |
| Dashboard       | Operations cockpit with all widgets (static layout)                                                                   |
| Contracts       | Full CRUD, health indicators, templates, bulk import, document attachment, multi-select, annual cost, cost-per-day    |
| Calendar        | Next 30 days + year, grouped by week, running balance, income, crunch days                                            |
| Quick Add       | Full spec: frecency, presets, save+new/dup/park, calculator, recent templates, expense train                          |
| AI              | Three-tier Smart Matching, review queue with batch accept, delegation rules, weekly digest                            |
| Categories      | Pre-built German tree, icons+colors, tags, contract binding, IBAN rules                                               |
| Command Palette | Extended: transactions, contracts, actions, calculator                                                                |
| Keyboard        | ⌘K, ⌘N, ⌘T, ⌘1-9, J/K, E, ?, ⌘Z                                                                                       |
| Import          | Finanzguru wizard, German bank CSV, Getting Started wizard, deduplication, import advisor                             |
| Design          | Token refresh, skeleton loading, micro-animations, toast+undo, inline editing, bulk select, breadcrumbs, empty states |
| Architecture    | Contract model on Actual's schedules, new migrations, handler bridge, Express routes, feature flags                   |

### Phase 2 — "Daily Delight"

| Area      | Scope                                                                            |
| --------- | -------------------------------------------------------------------------------- |
| Dashboard | Widget customization, Money Pulse brief, monthly snapshot/postcard               |
| Contracts | Cancellation letter template, annual review wizard, CSV/Excel export             |
| Calendar  | Payday cycle toggle, balance threshold red zone, .ics export                     |
| Quick Add | Smart amount memory, split transactions, smart day/time suggestions              |
| AI        | Explain button, autopilot progress display, confidence bands                     |
| OCR       | Photo receipt scan, PDF drag-drop, receipt-to-transaction matching               |
| Budget    | Envelope system, rollover, "left to spend", budget alerts                        |
| Analytics | All core views (spending, trends, fixed/variable, merchants, budget vs actual)   |
| Import    | MT940, CAMT.053 formats                                                          |
| UX        | Density toggle, smart German date input, context menus, drag-drop categorization |

### Phase 3 — "Power User"

| Area      | Scope                                                                       |
| --------- | --------------------------------------------------------------------------- |
| AI        | Full autopilot mode, "teach the AI" training                                |
| Calendar  | Scenario engine (what-if drag-to-reschedule)                                |
| Contracts | Timeline visualization, bundle detection                                    |
| Loans     | Tilgungsplan, overview, early repayment calculator                          |
| Savings   | Goals with progress bars                                                    |
| Analytics | Seasonal patterns, merchant loyalty, annual report PDF, cost of living, YoY |
| OCR       | Email forwarding (n8n), batch scanning                                      |
| Mobile    | PWA optimization, voice note entry                                          |
| Other     | Net worth placeholder, Financial Health Score (opt-in)                      |

### Backlog

- Native mobile app (React Native)
- Investment/portfolio tracking
- Multi-currency
- Data export for accountant/loan applications
- n8n advanced automation workflows
- Custom themes
- Crawl4AI integration

## 7. Unique Differentiators

1. **Progressive AI Automation ("Autopilot")**: The app gets smarter every day. Review queue shrinks from 20/week to 2-3/week. No competitor does this.

2. **Financial Pulse**: AI-generated daily brief + weekly digest + monthly snapshot. The app TALKS to you about your money.

3. **German-First, Self-Hosted**: Full data sovereignty. IBAN-based matching. German category tree. Kündigungsfristen. German bank CSV formats. German receipt OCR. No third-party data access.

## 8. What to Kill / Deprecate

From the existing fork, these modules should be **deprecated or removed**:

- `packages/sync-server/src/intelligence/` — too abstract, no daily utility. Replaced by review queue.
- `packages/sync-server/src/nl-query/` — cool tech, zero daily utility. Replaced by command palette.
- `packages/sync-server/src/events/` — over-engineered event bus for current scale. Use direct function calls.
- `packages/sync-server/src/documents/` — replaced by simpler invoice OCR scope (Phase 2).
- `packages/sync-server/src/forecast/` — replaced by simpler balance projection on calendar.

**Keep and enhance:**

- `packages/sync-server/src/ai/` — refocus on Smart Matching three-tier system
- `packages/sync-server/src/contracts/` — rebuild as the enriched contract model

## 9. Open Items for Implementation

- [ ] Finanzguru export file analysis (user to provide sample)
- [ ] German bank CSV format samples (DKB, ING, Sparkasse)
- [ ] Actual Budget schedule system deep dive (exact schema, APIs)
- [ ] Ollama model benchmarking on VPS (RAM usage, latency, accuracy)
- [ ] Design token palette selection (specific colors, shadows, spacing values)
- [ ] Docker sync script evaluation (actualbudget-sync community options)
- [ ] n8n workflow design for AI categorization pipeline

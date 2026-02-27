# Finance OS — Design Brief

**Date:** 2026-02-27
**Status:** User-validated
**Source:** First Principles brainstorming session (see brainstorming-session-2026-02-26.md)

---

## 1. Purpose

**Get my finances under control, then keep them there.**

Not analytics. Not budgeting (yet). Not categorization of past spending. The app's job is to give one German power user clarity over financial commitments and upcoming payments — every day, in under 30 seconds.

## 2. Definition of "Under Control"

- All recurring payments tracked (contracts, subscriptions, fixed costs)
- All income tracked (salary, side income — same system)
- Know what's due today, this week, this month
- Know how much is available to spend after commitments
- Open invoices tracked with due dates
- Attention queue nearly empty (only genuine edge cases)

## 3. Design Principles

### 3.1 "It Just Works" (Primary)

Complexity belongs in the engine, not the UI. The app should feel effortless even when doing sophisticated things under the hood. Minimal manual input. Smart defaults. Progressive automation over time.

### 3.2 Finanzguru's Clarity, Not Its Simplicity

Take Finanzguru's visual language — clean cards, color-coded amounts, generous typography — but fill it with denser, more actionable information. Not a consumer app. Not a Bloomberg terminal. The sweet spot between clarity and depth.

**Reference:** Finanzguru for visual language + contract tracking + "it just works" feeling. NOT for navigation structure.

### 3.3 Tesla Cockpit

Dense but clean. The surface is calm; the depth is available on demand. Progressive disclosure: the daily view shows status and pressing items. Drilling in reveals full detail. Power features exist but don't clutter the default view.

### 3.4 One System, Multiple Views

Avoid special cases. Income and expenses use the same data model (contracts). Calendar and dashboard are computed views of the same data. No feature should require its own parallel universe of concepts.

## 4. Two Modes of Use

### Mode 1: Getting to Control (Weeks 1-4)

- Enter contracts manually (templates help)
- Enter income sources
- Log open invoices
- Set up categories
- Optional: setup wizard for salary + major fixed costs

### Mode 2: Staying in Control (Forever)

- Open app → see status + pressing items (30 seconds)
- Handle 2-3 attention items if any
- Done. Close the app.

## 5. MVP Scope: "Know What I Owe"

### Core Features (MVP)

| Feature | Description |
|---------|-------------|
| **Contracts** | Full CRUD for all recurring payments AND income. One unified model. Manual entry with templates (Mietvertrag, Handyvertrag, Streaming, etc.). Health indicators (green/yellow/red). Notice periods. Annual cost computation. |
| **Calendar** | Computed from contracts. Next 30/60/90 days, grouped by week. Running balance projection. Crunch day indicators. Income entries shown. |
| **Dashboard** | Status: total balance, total committed, available to spend, cash runway. Pressing: payments due today/tomorrow/this week. Attention: items needing action. |
| **Open Invoices** | One-time bills with payee, amount, due date, status (open/paid). Feed into calendar and dashboard. |

### Unified Data Model

Income and expenses are the same object:

```
Contract {
  name, provider, category
  amount              // positive = income, negative = expense
  interval            // monthly, quarterly, annual, weekly, one-time
  next_payment_date
  account             // which account it hits

  // Contract terms
  start_date, end_date
  notice_period_months
  auto_renewal

  // Health (computed)
  health: green | yellow | red
  cancellation_deadline  // computed: end_date - notice_period
  annual_cost           // computed

  // Meta
  category, tags[], notes
  type: subscription | insurance | utility | loan | membership | income | other
}
```

Salary (+€3,200/month) and Miete (-€890/month) live in the same table, same list, same calendar. A setup wizard makes entry friendly; the system is uniform underneath.

### Navigation Structure (MVP)

4 pages + overlays:

```
Sidebar / Top Nav:
  📊 Dashboard       ← Home. Status + pressing + attention.
  📋 Verträge        ← Contract list + detail view.
  📅 Kalender        ← Payment calendar + projection.
  ⚙️ Einstellungen   ← Settings, categories.

Overlays (not pages):
  ⌘N  Quick Add      ← Add contract or invoice quickly.
  ⌘K  Command Palette ← Search + navigate + actions.
```

NOT 12 tabs. 4 focused pages that serve the daily loop: Dashboard → see pressing → drill into Verträge or Kalender if needed → done.

### What's NOT in MVP

| Feature | When |
|---------|------|
| Bank account connections | Post-MVP: when bank import is built |
| Transaction list/history | Post-MVP: needs bank data |
| AI categorization | Post-MVP: needs transactions |
| Review queue (AI-generated) | Post-MVP: needs AI |
| Analytics/charts | Post-MVP: needs historical data |
| Budget/envelope system | Post-MVP: needs spending data |
| OCR/receipts | Post-MVP phase |
| Intelligence/Ops panels | Cut entirely — overengineered |
| Tags as standalone page | Cut — tags are inline on contracts |

## 6. Tech Stack (Confirmed)

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | React 19 + Vite 7 | `apps/web/` |
| Styling | Tailwind CSS v4 + shadcn/ui | "Clarity Through Restraint" design language |
| Database | SurrealDB 3.0 | WebSocket, DEFINE API, computed fields |
| Design System | `packages/design-system/` | Full overhaul — see `design-system-v1.md` |
| Worker + AI | **Skip for MVP** | Add when bank import arrives |

### Existing Code: Salvage + Rebuild

**Keep (review + trim):**
- `apps/web/src/core/api/surreal-client.ts` — SurrealDB connection singleton
- `apps/web/src/core/types/finance.ts` — TypeScript types (trim to MVP)
- `apps/web/src/components/ui/` — shadcn/ui primitives (button, card, dialog, etc.)
- `schema/*.surql` — SurrealDB schema (trim to MVP tables)

**Overhaul:**
- `packages/design-system/` — full redesign per `design-system-v1.md`: "Clarity Through Restraint" system with semantic color language, warm Stone neutrals, Inter + tabular-nums, 4-layer surface system, CSS custom properties for dark mode readiness. NOT a simple theme swap — a Level 5 design communication system.

**Delete:**
- All 12 feature modules in `apps/web/src/features/` — empty shells, start fresh
- `apps/web/src/core/api/finance-api.ts` — 35+ functions for features that don't exist yet
- `apps/worker/` — not needed for MVP
- `apps/gateway/`, `apps/ai-policy/`, `apps/sync/` — already being phased out

**Rebuild from scratch:**
- `features/contracts/` — contract CRUD with Finanzguru-inspired cards
- `features/calendar/` — payment projection computed from contracts
- `features/dashboard/` — status + pressing + attention
- `features/invoices/` — open invoice tracking (possibly part of contracts)
- `app/App.tsx` — simplified shell with 4-page navigation

## 7. Quality Bar

Every feature must pass this test before it ships:

- [ ] Does it work with real data? (not mock/placeholder)
- [ ] Does it feel "thought through"? (interaction design, not just layout)
- [ ] Can I complete the core action in < 5 seconds?
- [ ] Does it look like Finanzguru? (clean cards, color-coded, generous typography)
- [ ] Is the information hierarchy clear? (most important thing is most visible)
- [ ] Does the empty state guide me? ("No contracts yet. Start with your rent.")

## 8. Build Sequence

```
Phase 0: Foundation
  - Delete empty feature modules
  - Trim SurrealDB schema to MVP tables
  - Verify surreal-client + shadcn/ui primitives work
  - Overhaul design-system: new color palette, spacing scale, typography,
    shadows, border-radius — Finanzguru-inspired premium feel
  - Define component patterns: Card, List, Badge, Form, Status indicators

Phase 1: Contracts (core feature)
  - Contract data model in SurrealDB
  - Contract list page (Finanzguru-style cards)
  - Contract detail/edit (slide-over or page)
  - Contract templates (Miete, Handy, Streaming, etc.)
  - Health computation (green/yellow/red)
  - Setup wizard for first-run (salary + major fixed costs)

Phase 2: Calendar
  - Computed from contracts
  - Next 30 days, grouped by week
  - Running balance projection
  - Crunch day indicators
  - Income entries visible

Phase 3: Dashboard
  - Total committed / available to spend
  - Pressing: payments due today/this week
  - Attention: contracts needing action
  - Money Pulse summary line

Phase 4: Open Invoices
  - One-time bills with due dates
  - Feed into calendar + dashboard
  - Mark as paid

Phase 5: Polish
  - Keyboard shortcuts (⌘K, ⌘N, ⌘1-4)
  - Command palette
  - Empty states with guidance
  - Loading states (skeletons)
  - Mobile responsiveness (PWA)
```

---

## 9. Success Criteria

The MVP is done when:

1. I can enter all my contracts and see them in a clean list
2. I can see the next 30 days of payments in a calendar view
3. I can see "available to spend" on the dashboard
4. I can track open invoices with due dates
5. The daily check-in takes < 30 seconds
6. It looks and feels like a premium app, not a prototype

---

*This document is the single source of truth for Finance OS MVP development. All implementation decisions should reference this brief.*

# Finance OS — Brainstorming Session

**Date:** 2026-02-27
**Technique:** First Principles Thinking
**Facilitator:** Claude Code
**Status:** ✅ Complete

---

## Session Goal

Strip away inherited assumptions about what a personal finance app "should" look like, and rebuild from bedrock truths about what ONE German power user actually needs every day.

---

## Step 1: UX Vision ✅

### Bedrock Truth

**The ONE job of Finance OS every morning: "What's the status, and what needs my attention right now?"**

Not analysis. Not categorization. Not budgeting. Status + pressing items.

### "Under Control" Defined

- All recurring payments tracked
- All income tracked
- Know what's due and when
- Know available spending money
- Open invoices tracked
- Attention queue nearly empty

### Two Modes

- **Getting to control** (weeks 1-4): Import, enter contracts, set up structure
- **Staying in control** (forever): 30-second daily check-in, handle 2-3 items, done

### Design Philosophy

- **Finanzguru's visual clarity** — clean cards, color-coded amounts, generous typography
- **NOT Finanzguru's simplicity** — denser, more actionable, desktop-first
- **"It just works"** — complexity in engine, not UI. Smart defaults. Progressive automation.
- **Tesla cockpit** — clean surface, depth on demand

---

## Step 2: Feature Priority Map ✅

### Key Insight

The agents built **breadth** (12 empty feature shells) when the real need is **depth** (4 core features, fully functional). The "it just works" feeling requires working engines, not pretty dashboards with no data.

### MVP Realization

**The user wants to start organizing BEFORE bank data exists.** The MVP is manual entry of contracts, fixed costs, and open invoices — not bank import.

### Unified Data Model

Income and expenses use the SAME contract model. Gehalt (+€3,200/month) and Miete (-€890/month) are both contracts. One system, multiple views.

### Feature Triage

**MVP (4 features):**
1. Contracts — full CRUD, templates, health indicators
2. Calendar — computed from contracts, 30-day projection
3. Dashboard — status + pressing + available to spend
4. Open Invoices — one-time bills with due dates

**Post-MVP:** Accounts, Transactions, AI Review, Categories, Analytics, Budget, Import

**Cut:** Intelligence/Ops panels, Tags as standalone page

---

## Step 3: Architecture Review ✅

### Stack Confirmed

- SurrealDB 3.0: Keep (schema exists, computed fields elegant, DEFINE API)
- Tailwind v4 + shadcn/ui: Keep (maps to Finanzguru visual style)
- React 19 + Vite: Keep (standard, no reason to change)
- Worker + Ollama: Skip for MVP (no AI needed yet)

### Existing Code Strategy

- **Keep:** surreal-client, TypeScript types, shadcn/ui primitives, design-system, SurrealDB schema
- **Delete:** All 12 empty feature modules, 35+ unused API functions, worker, gateway
- **Rebuild:** 4 focused feature modules from scratch
- **Overhaul:** design-system itself (tokens, spacing, typography to match Finanzguru-inspired vision)

---

## Step 4: Synthesis ✅

→ See **finance-os-design-brief.md** for the complete, actionable design brief.

---

## Verification Checklist

- [x] User answered "What does Finance OS do every morning?" — status + pressing items
- [x] Feature priority list exists (keep/cut/defer) for all 12+ current tabs
- [x] Layout/navigation structure sketched: 4 pages + overlays, not 12 tabs
- [x] Architecture confirmed: SurrealDB + Tailwind v4 + React 19, no changes needed
- [x] Design Brief document written and user-validated

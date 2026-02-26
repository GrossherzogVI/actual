# Finance OS — Project Overview

**Generated:** 2026-02-26
**Platform:** Level-5 (SurrealDB 3.0 + React 19)
**Status:** Active development — Phase 2 complete, Phase 3 in planning

---

## What It Is

Finance OS is a self-hosted personal finance command center for German power users. It combines the ease of use of Finanzguru with the feature depth of StarMoney, adding AI automation and full data sovereignty. A single user desktop-first app that opens like a cockpit, not a chore.

**Core value propositions:**
- **German-first:** IBAN-based matching, German category tree, MT940/CAMT.053 bank import, SEPA payment export, German tax forms (EÜR + USt)
- **AI-powered:** Ollama-based transaction classification (mistral-small), receipt OCR (llama3.2-vision), anomaly detection
- **Self-hosted:** Full data sovereignty — no third-party data access, SurrealDB on your own VPS
- **Progressive automation:** Reduces manual work from ~20 items/week to 2-3 over time

---

## Tech Stack Summary

| Layer | Technology | Version | Notes |
|-------|-----------|---------|-------|
| Frontend | React | 19.2.4 | ESM, Vite 7 |
| Styling | Tailwind CSS | v4.2.0 | No Emotion, no CSS-in-JS |
| UI Components | Radix UI | various | Dialog, ScrollArea, Select |
| Data Fetching | TanStack Query | ^5.90.20 | useQuery + useMutation |
| Animations | motion/react | ^12.23.24 | Framer Motion v12 |
| Icons | lucide-react | ^0.575.0 | |
| Command Palette | cmdk | ^1.1.1 | |
| Charts | ECharts | ^6.0.0 | echarts-for-react wrapper |
| Database | SurrealDB | 3.0.0 (Docker) | WebSocket SDK 1.3.2 |
| Worker Runtime | Node.js + tsx | ^4.20.6 | ESM watch mode |
| AI | Ollama | self-hosted | mistral-small + llama3.2-vision |
| Build | Vite | ^7.3.1 | |
| Testing | Vitest | ^4.0.8 | + Testing Library |
| Type Checking | TypeScript | ^5.9.3 | strict mode |
| CI/CD | GitHub Actions | — | → GHCR → VPS |

---

## Architecture Type

**Monorepo** with 3 active Level-5 parts:

| Part | Path | Role |
|------|------|------|
| `web` | `apps/web/` | React 19 SPA — all UI, data queries, business logic |
| `worker` | `apps/worker/` | Node.js background jobs — AI classification, anomaly detection, OCR, queue drain |
| `schema` | `schema/` | SurrealQL definitions — tables, computed fields, auth, seed data |

All three communicate exclusively through **SurrealDB** — no REST API between web and worker. The `job_queue` table acts as the async communication channel.

---

## Application Scope

### Currently Built (12 Feature Modules)

| Module | Tab Label | Description |
|--------|-----------|-------------|
| Dashboard | Dashboard | KPI widgets, balance projection, upcoming payments, health score |
| Transactions | Transaktionen | Account/category-filtered list with SurrealDB live subscriptions |
| Contracts | Verträge | Subscription/recurring expense management with notice period tracking |
| Calendar | Kalender | 30-day list + month grid view of upcoming payments |
| Categories | Kategorien | 2-level German category tree (L1 groups → L2 categories) |
| Review Queue | Prüfungen | AI-generated review items — accept/dismiss/snooze with batch support |
| Analytics | Analysen | 6 ECharts visualizations (monthly overview, spending by category, trends, top merchants, fixed vs variable, what changed) |
| Import | Import | Bank CSV import: DKB, ING, Sparkasse, MT940, CAMT.053, generic |
| Budget | Budget | Envelope budgeting with rollover, per-category monthly budgets |
| Tax | Steuer | German tax forms (EÜR + USt), category-to-tax-code mapping |
| Receipts | Belege | Receipt inbox with OCR via Ollama llama3.2-vision |
| SEPA | SEPA | SEPA XML payment export with IBAN/BIC validation |

### Worker Jobs (Queue-based)

| Job Name | Trigger | Action |
|----------|---------|--------|
| `classify-transaction` | On import | Ollama classification → auto-apply (≥0.85) or review queue |
| `import-csv` | Upload | Parse + deduplicate + bulk insert transactions |
| `ocr-receipt` | Receipt upload | Tesseract.js + Ollama vision → extract amount/date/payee |
| `check-deadlines` | Periodic | Find red-health contracts → create review items |
| `detect-anomalies` | Periodic | 2× moving average outliers → create anomaly records |
| `analyze-spending-patterns` | Periodic | Recurring untracked payees → spending pattern suggestions |
| `explain-classification` | On request | Ollama explanation for AI classification decisions |

---

## What Is NOT Yet Built

**High priority (Phase 2 wiring):**
- Most Phase 2 modules are UI-complete but query real data — needs validation with production data
- Worker intelligence loop (detect-anomalies, analyze-spending-patterns) not scheduled automatically
- Authentication on frontend SurrealDB connection (currently root credentials)

**Medium priority (Phase 3):**
- MT940/CAMT.053 full parser validation
- Contract auto-detection from imported transactions
- IBAN-based categorization rules

**Low priority (Phase 4+):**
- Net worth tracking, savings goals, loan amortization
- Investment portfolio tracking
- Year overview in calendar

# Finance OS — Source Tree Analysis

**Generated:** 2026-02-26
**Scope:** Level-5 platform only (apps/web, apps/worker, schema)

---

## Level-5 Platform Structure

```
actual-budget/
│
├── apps/
│   ├── web/                        ◄ PRIMARY FRONTEND (React 19 SPA)
│   │   ├── index.html              # Vite entry point
│   │   ├── vite.config.ts          # Vite 7 config
│   │   ├── tailwind.config.ts      # Tailwind v4 config
│   │   ├── vitest.config.ts        # Test runner config
│   │   ├── components.json         # shadcn/ui registry (Radix base)
│   │   └── src/
│   │       ├── main.tsx            # React 19 root, TanStack Query provider
│   │       ├── app/                # ◄ APPLICATION SHELL
│   │       │   ├── App.tsx         # Root component: shell, command palette, quick-add
│   │       │   ├── App.test.tsx    # App-level tests
│   │       │   ├── CommandPalette.tsx  # cmdk-based command palette (Cmd+K)
│   │       │   ├── KeyboardShortcuts.tsx  # Global keyboard handler
│   │       │   └── useAppState.ts  # Palette entries, global state
│   │       │
│   │       ├── core/               # ◄ INFRASTRUCTURE LAYER
│   │       │   ├── api/
│   │       │   │   ├── surreal-client.ts  # Singleton DB connection, connect/signin/signout
│   │       │   │   ├── finance-api.ts     # 35+ typed SurrealQL functions
│   │       │   │   └── index.ts    # Re-exports
│   │       │   ├── types/
│   │       │   │   └── finance.ts  # 20+ TypeScript types (Account, Transaction, Contract…)
│   │       │   └── utils/
│   │       │       └── format.ts   # Currency/date formatting utilities
│   │       │
│   │       ├── components/         # ◄ SHARED UI COMPONENTS
│   │       │   ├── ErrorBoundary.tsx  # Zone-aware error boundary
│   │       │   ├── PanelSkeleton.tsx  # Loading skeleton
│   │       │   └── ui/             # Radix-based primitives
│   │       │       ├── badge.tsx
│   │       │       ├── button.tsx
│   │       │       ├── command.tsx
│   │       │       ├── dialog.tsx
│   │       │       ├── input.tsx
│   │       │       ├── scroll-area.tsx
│   │       │       └── select.tsx
│   │       │
│   │       └── features/           # ◄ FEATURE MODULES (12 modules)
│   │           ├── finance/        # Tab shell + transaction view
│   │           │   ├── FinancePage.tsx    # Main tab router (12 tabs, lazy-loaded)
│   │           │   ├── AccountPanel.tsx   # Left sidebar: account list
│   │           │   ├── CategoryTree.tsx   # Left sidebar: category filter
│   │           │   ├── TransactionList.tsx # Transaction table
│   │           │   └── AmountDisplay.tsx  # German number formatting
│   │           │
│   │           ├── dashboard/      # Dashboard with 9 widgets
│   │           │   ├── DashboardPage.tsx
│   │           │   ├── DashboardGrid.tsx  # 12-col responsive grid
│   │           │   ├── AccountBalancesWidget.tsx
│   │           │   ├── ThisMonthWidget.tsx
│   │           │   ├── UpcomingPaymentsWidget.tsx
│   │           │   ├── CashRunwayWidget.tsx
│   │           │   ├── HealthScoreWidget.tsx
│   │           │   ├── MoneyPulseWidget.tsx
│   │           │   ├── BalanceProjectionWidget.tsx
│   │           │   ├── AvailableToSpendWidget.tsx
│   │           │   ├── WidgetWrapper.tsx  # Error+loading wrapper
│   │           │   └── WidgetError.tsx
│   │           │
│   │           ├── contracts/      # Subscription/recurring expense management
│   │           │   ├── ContractsPage.tsx
│   │           │   ├── ContractCard.tsx
│   │           │   ├── ContractForm.tsx   # Slide-over create/edit
│   │           │   ├── CancellationDialog.tsx
│   │           │   └── CancellationLetter.tsx
│   │           │
│   │           ├── calendar/       # Payment calendar
│   │           │   ├── CalendarPage.tsx
│   │           │   ├── CalendarListView.tsx
│   │           │   ├── CalendarGridView.tsx
│   │           │   ├── HolidayBadge.tsx
│   │           │   ├── HolidaySettings.tsx
│   │           │   ├── holidays.ts         # German public holiday engine
│   │           │   ├── useCalendarData.ts
│   │           │   ├── useHolidays.ts
│   │           │   └── __tests__/
│   │           │       └── holidays.test.ts
│   │           │
│   │           ├── categories/     # Category tree management
│   │           │   ├── CategoriesPage.tsx
│   │           │   ├── CategoryTree.tsx
│   │           │   ├── CategoryForm.tsx
│   │           │   └── CategoryColorPicker.tsx
│   │           │
│   │           ├── review/         # AI review queue
│   │           │   ├── ReviewQueuePage.tsx
│   │           │   └── ReviewItemCard.tsx
│   │           │
│   │           ├── analytics/      # 6 ECharts visualizations
│   │           │   ├── AnalyticsPage.tsx
│   │           │   ├── MonthlyOverviewChart.tsx
│   │           │   ├── SpendingByCategoryChart.tsx
│   │           │   ├── SpendingTrendsChart.tsx
│   │           │   ├── TopMerchantsChart.tsx
│   │           │   ├── FixedVsVariableChart.tsx
│   │           │   ├── CategoryFlowChart.tsx
│   │           │   ├── WhatChangedCard.tsx
│   │           │   ├── TimeRangeSelector.tsx
│   │           │   ├── ChartContainer.tsx
│   │           │   ├── chart-theme.ts
│   │           │   └── useAnalyticsData.ts
│   │           │
│   │           ├── import/         # German bank CSV import
│   │           │   ├── ImportPage.tsx
│   │           │   ├── BankFormatSelector.tsx
│   │           │   ├── CsvUploadZone.tsx
│   │           │   ├── CsvPreviewTable.tsx
│   │           │   ├── DuplicateResolver.tsx
│   │           │   ├── ImportProgressBar.tsx
│   │           │   ├── ImportSummaryCard.tsx
│   │           │   ├── Mt940Preview.tsx
│   │           │   ├── useImportFlow.ts
│   │           │   └── parsers/    # Bank-specific parsers
│   │           │       ├── detector.ts    # Auto-detect format
│   │           │       ├── dkb.ts         # DKB CSV
│   │           │       ├── ing.ts         # ING CSV
│   │           │       ├── sparkasse.ts   # Sparkasse CSV
│   │           │       ├── mt940.ts       # MT940 (SWIFT)
│   │           │       ├── camt053.ts     # CAMT.053 (XML)
│   │           │       ├── generic.ts     # Generic CSV fallback
│   │           │       ├── dedup.ts       # Duplicate detection
│   │           │       ├── encoding.ts    # ISO-8859-1 detection
│   │           │       ├── types.ts
│   │           │       └── __tests__/
│   │           │           ├── mt940.test.ts
│   │           │           └── camt053.test.ts
│   │           │
│   │           ├── budget/         # Envelope budgeting
│   │           │   ├── BudgetPage.tsx
│   │           │   ├── BudgetEnvelope.tsx
│   │           │   ├── BudgetForm.tsx
│   │           │   ├── BudgetMonthNav.tsx
│   │           │   ├── BudgetOverviewBar.tsx
│   │           │   ├── BudgetProgressRing.tsx
│   │           │   ├── BudgetAlertBanner.tsx
│   │           │   ├── budget-utils.ts
│   │           │   └── useBudgetData.ts
│   │           │
│   │           ├── intelligence/   # AI insights panel
│   │           │   ├── IntelligenceInsights.tsx
│   │           │   ├── AnomalyCard.tsx
│   │           │   ├── SpendingPatternCard.tsx
│   │           │   ├── AIExplainButton.tsx
│   │           │   ├── ConfidenceBadge.tsx
│   │           │   ├── useAnomalies.ts
│   │           │   └── useSpendingPatterns.ts
│   │           │
│   │           ├── tax/            # German tax export
│   │           │   ├── TaxExportPage.tsx
│   │           │   ├── EuerForm.tsx        # EÜR (income/surplus)
│   │           │   ├── UstForm.tsx         # Umsatzsteuer (VAT)
│   │           │   ├── TaxCategoryMapping.tsx
│   │           │   ├── tax-category-map.ts # Category → tax code mapping
│   │           │   ├── tax-export-utils.ts
│   │           │   ├── tax-api.ts
│   │           │   ├── types.ts
│   │           │   ├── useTaxData.ts
│   │           │   └── __tests__/
│   │           │       └── tax-category-map.test.ts
│   │           │
│   │           ├── ocr/            # Receipt OCR inbox
│   │           │   ├── ReceiptInbox.tsx
│   │           │   ├── OcrUploadZone.tsx
│   │           │   ├── OcrResultPreview.tsx
│   │           │   ├── OcrMatchSuggestion.tsx
│   │           │   ├── ocr-api.ts
│   │           │   ├── types.ts
│   │           │   └── useOcrProcess.ts
│   │           │
│   │           ├── sepa/           # SEPA payment export
│   │           │   ├── SepaExportPage.tsx
│   │           │   ├── SepaPaymentForm.tsx
│   │           │   ├── sepa-xml.ts    # SEPA XML generation
│   │           │   ├── iban-utils.ts  # IBAN validation + BIC lookup
│   │           │   ├── sepa-api.ts
│   │           │   ├── types.ts
│   │           │   └── __tests__/
│   │           │       ├── sepa-xml.test.ts
│   │           │       └── iban-utils.test.ts
│   │           │
│   │           └── quick-add/      # Cmd+N quick transaction entry
│   │               ├── QuickAddOverlay.tsx  # Radix Dialog
│   │               ├── useCalculator.ts     # German comma math expressions
│   │               └── useCategorySearch.ts # Fuzzy category search
│   │
│   └── worker/                     ◄ BACKGROUND WORKER (Node.js)
│       └── src/
│           ├── main.ts             # Entry: DB connect, task scheduling, queue drain
│           ├── types.ts            # Worker config type
│           └── handlers/           # External job handlers
│               ├── index.ts        # Handler registry
│               ├── import-csv.ts   # CSV import job handler
│               └── ocr-receipt.ts  # Receipt OCR job handler
│
├── schema/                         ◄ SURREALDB SCHEMA (SurrealQL)
│   ├── 000-auth.surql              # DEFINE ACCESS + user table
│   ├── 001-financial-core.surql    # account, payee, category, transaction, schedule
│   ├── 002-contracts.surql         # contract (+ computed annual_cost, health) + price_history + contract_event
│   ├── 003-command-platform.surql  # job_queue, command_run, playbook, delegate_lane
│   ├── 004-intelligence.surql      # review_item, classification, anomaly (legacy)
│   ├── 005-api-endpoints.surql     # DEFINE API (REST endpoints, currently supplementary)
│   ├── 006-seed-german-categories.surql  # Pre-seeded 2-level German category tree
│   ├── 007-user-prefs.surql        # user_pref (key-value store)
│   ├── 008-budget.surql            # budget table (envelope budgeting)
│   ├── 009-import.surql            # import_batch table
│   ├── 010-intelligence.surql      # spending_pattern table (Phase 2)
│   ├── 011-receipts.surql          # receipt table for OCR
│   ├── 012-tax.surql               # tax-related tables
│   ├── 013-sepa.surql              # sepa_payment table
│   ├── 014-user-prefs.surql        # user_pref extended fields
│   └── apply.sh                    # Loads all .surql files into SurrealDB in order
│
├── docs/                           ◄ BMAD DOCUMENTATION (this directory)
├── planning-artifacts/             # BMAD planning docs
├── implementation-artifacts/       # BMAD story files
│   └── stories/
├── bmad/                           # BMAD config
│
└── (legacy packages — NOT the Level-5 platform)
    ├── packages/sync-server/       # Express 5 backend (legacy, not used by Level-5)
    ├── packages/loot-core/         # SQLite core engine (legacy)
    └── packages/desktop-client-archive  # (branch only, not in main)
```

---

## Critical Paths for Development

| Task | Key Files |
|------|-----------|
| Add a new feature module | `apps/web/src/features/{name}/` → `FinancePage.tsx` tabs → `useAppState.ts` palette → `finance-api.ts` |
| Add a SurrealDB query | `apps/web/src/core/api/finance-api.ts` + corresponding type in `core/types/finance.ts` |
| Add a worker job | `apps/worker/src/main.ts` `processQueueJob()` switch case |
| Add a new DB table | `schema/0NN-*.surql` → `schema/apply.sh` |
| Modify auth | `schema/000-auth.surql` |
| Add a bank import format | `apps/web/src/features/import/parsers/{bank}.ts` → register in `detector.ts` |

---

## Entry Points

| Part | Entry Point | Purpose |
|------|------------|---------|
| Web frontend | `apps/web/index.html` → `src/main.tsx` → `App.tsx` | Vite SPA |
| Worker | `apps/worker/src/main.ts` | Node.js process, started with `tsx` |
| Schema | `schema/apply.sh` | Idempotent schema loader |

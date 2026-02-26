# Finance OS — Component Inventory (Web)

**Generated:** 2026-02-26
**Path:** `apps/web/src/`

---

## Application Shell

| Component | File | Purpose |
|-----------|------|---------|
| `App` | `app/App.tsx` | Root: shell layout, ConnectionStatus, keyboard handler wiring |
| `ConnectionStatus` | `app/App.tsx` (inline) | DB health banner with retry button |
| `CommandPalette` | `app/CommandPalette.tsx` | cmdk-based palette (Cmd+K), 13 navigation entries |
| `KeyboardShortcuts` | `app/KeyboardShortcuts.tsx` | Global Cmd+K / Cmd+N handler |
| `FinancePage` | `features/finance/FinancePage.tsx` | 12-tab router with lazy-loaded modules |

---

## Shared UI Primitives (`components/ui/`)

These are Radix-based primitives following shadcn/ui pattern (class-variance-authority + tailwind-merge).

| Component | Base | Usage |
|-----------|------|-------|
| `Badge` | Radix-free | Status chips, priority indicators |
| `Button` | Radix Slot | Primary/secondary/ghost variants |
| `Command` | cmdk | Powers CommandPalette |
| `Dialog` | Radix Dialog | All modals and slide-overs |
| `Input` | HTML input | Forms throughout |
| `ScrollArea` | Radix ScrollArea | Transaction lists, long panels |
| `Select` | Radix Select | Dropdowns in forms |

**Shared layout components:**
- `ErrorBoundary` — zone-aware, logs errors with zone name
- `PanelSkeleton` — animated loading placeholder

---

## Feature Components by Module

### Dashboard (`features/dashboard/`)

| Component | Description |
|-----------|-------------|
| `DashboardPage` | Root: greeting, KPI badges, DashboardGrid |
| `DashboardGrid` | 12-column CSS grid, responsive widget layout |
| `WidgetWrapper` | Error boundary + loading state for each widget |
| `WidgetError` | Per-widget error display with retry |
| `AccountBalancesWidget` | All account balances with type icons |
| `ThisMonthWidget` | Income/expenses/net for current month |
| `UpcomingPaymentsWidget` | Next 7 days of scheduled payments |
| `CashRunwayWidget` | Days until balance reaches zero |
| `HealthScoreWidget` | Overall financial health score |
| `MoneyPulseWidget` | Real-time balance pulse |
| `BalanceProjectionWidget` | 30-day balance projection (ECharts line) |
| `AvailableToSpendWidget` | Balance minus committed contracts |

**Custom hooks:** `useDashboardLayout`, `useBalanceProjection`, `useMoneyPulse`

---

### Transactions (`features/finance/`)

| Component | Description |
|-----------|-------------|
| `AccountPanel` | Left sidebar: account list with balances |
| `CategoryTree` | Left sidebar: category tree filter (L1 > L2) |
| `TransactionList` | Main transaction table with search/filter |
| `AmountDisplay` | German locale number formatting (tnum) |

---

### Contracts (`features/contracts/`)

| Component | Description |
|-----------|-------------|
| `ContractsPage` | Summary metrics + search/filter bar + card grid |
| `ContractCard` | Shows type badge, amount, interval, health chip |
| `ContractForm` | Slide-over (Dialog): create/edit with all fields |
| `CancellationDialog` | Confirm cancellation, sets notice period deadline |
| `CancellationLetter` | Generates formal German cancellation letter text |

**Health chips:** green/yellow/red/grey based on computed `health` field from SurrealDB.

---

### Calendar (`features/calendar/`)

| Component | Description |
|-----------|-------------|
| `CalendarPage` | Toggle between list and grid view |
| `CalendarListView` | 30-day chronological list, grouped by date, "Heute" marker |
| `CalendarGridView` | 7-column month grid with color-coded payment cells |
| `HolidayBadge` | Displays German public holiday name |
| `HolidaySettings` | Select German state for holiday calendar |

**Custom hooks:** `useCalendarData` (projects payments), `useHolidays` (state-specific holidays)
**Logic:** `holidays.ts` — German public holiday engine (fixed + variable dates, 16 states)

---

### Categories (`features/categories/`)

| Component | Description |
|-----------|-------------|
| `CategoriesPage` | Summary stats + search + tree view |
| `CategoryTree` | Hierarchical L1 > L2 with expand/collapse |
| `CategoryForm` | Slide-over: create/edit with color picker |
| `CategoryColorPicker` | 16 preset colors + custom hex input |

---

### Review Queue (`features/review/`)

| Component | Description |
|-----------|-------------|
| `ReviewQueuePage` | Priority stats, filter bar, batch accept button |
| `ReviewItemCard` | Priority/type badges, AI suggestion, accept/dismiss/snooze |

**Animations:** `AnimatePresence` on exit when items are accepted/dismissed.
**Per-item mutation tracking:** Each card tracks its own pending state independently.

---

### Analytics (`features/analytics/`)

All charts use ECharts via `echarts-for-react`. Wrapped in `ChartContainer` (handles loading/error).

| Component | Chart Type | Data Source |
|-----------|-----------|-------------|
| `MonthlyOverviewChart` | Grouped bar | `getMonthlyOverview()` |
| `SpendingByCategoryChart` | Pie/donut | `getSpendingByCategory()` |
| `SpendingTrendsChart` | Stacked area | `getSpendingTrends()` |
| `TopMerchantsChart` | Horizontal bar | `getTopMerchants()` |
| `FixedVsVariableChart` | Stacked bar | `getFixedVsVariable()` |
| `CategoryFlowChart` | Sankey/flow | Category hierarchy |
| `WhatChangedCard` | Delta table | `getWhatChanged()` |
| `TimeRangeSelector` | UI control | Sets date range for all charts |
| `ChartContainer` | Wrapper | Loading state + error fallback |

**Theme:** `chart-theme.ts` — dark palette matching Finance OS design tokens.
**Hook:** `useAnalyticsData` — coordinates all chart queries, shares `TimeRangeSelector` state.

---

### Import (`features/import/`)

| Component | Description |
|-----------|-------------|
| `ImportPage` | Step flow: select format → upload → preview → import |
| `BankFormatSelector` | Bank picker: DKB, ING, Sparkasse, MT940, CAMT.053, Generic |
| `CsvUploadZone` | Drag-and-drop file upload |
| `CsvPreviewTable` | Preview parsed transactions before import |
| `Mt940Preview` | MT940-specific preview with balance display |
| `DuplicateResolver` | Shows detected duplicates, lets user choose |
| `ImportProgressBar` | Progress during bulk insert |
| `ImportSummaryCard` | Final summary: created/duplicates/errors |

**Parsers (`features/import/parsers/`):**
| Parser | Format |
|--------|--------|
| `dkb.ts` | DKB Girocard CSV (German) |
| `ing.ts` | ING-DiBa CSV |
| `sparkasse.ts` | Sparkasse CSV |
| `mt940.ts` | MT940 (SWIFT standard) |
| `camt053.ts` | CAMT.053 XML (ISO 20022) |
| `generic.ts` | Configurable generic CSV |
| `detector.ts` | Auto-detects format from file content |
| `dedup.ts` | Duplicate detection by date+amount+payee |
| `encoding.ts` | Handles ISO-8859-1 encoded files |

---

### Budget (`features/budget/`)

| Component | Description |
|-----------|-------------|
| `BudgetPage` | Month navigation + overview bar + envelope grid |
| `BudgetEnvelope` | Single category budget card: allocated/spent/remaining |
| `BudgetForm` | Set/edit budget amount for a category |
| `BudgetMonthNav` | Previous/next month navigation |
| `BudgetOverviewBar` | Total budgeted vs total spent progress bar |
| `BudgetProgressRing` | Circular progress indicator per envelope |
| `BudgetAlertBanner` | Warning when over-budget envelopes detected |

**Hook:** `useBudgetData` — fetches budgets + actuals + computes remaining per envelope.
**Utility:** `budget-utils.ts` — envelope math helpers.

---

### Intelligence (`features/intelligence/`)

| Component | Description |
|-----------|-------------|
| `IntelligenceInsights` | Container: anomalies + spending patterns |
| `AnomalyCard` | Single anomaly with severity badge and resolve action |
| `SpendingPatternCard` | Recurring pattern suggestion with dismiss action |
| `AIExplainButton` | Triggers `explain-classification` job, shows result |
| `ConfidenceBadge` | Color-coded AI confidence display (0.0–1.0) |

---

### Tax (`features/tax/`)

| Component | Description |
|-----------|-------------|
| `TaxExportPage` | Tax year selector + form switcher |
| `EuerForm` | Einnahmenüberschussrechnung (EÜR) form |
| `UstForm` | Umsatzsteuer (VAT) declaration form |
| `TaxCategoryMapping` | Maps Finance OS categories to German tax codes |

**Logic files:**
- `tax-category-map.ts` — Category to `§4 EStG` tax code mapping
- `tax-export-utils.ts` — Aggregation functions for tax forms

---

### OCR Receipts (`features/ocr/`)

| Component | Description |
|-----------|-------------|
| `ReceiptInbox` | Grid of uploaded receipts with OCR status |
| `OcrUploadZone` | Drag-and-drop receipt upload |
| `OcrResultPreview` | Shows extracted amount/date/payee from OCR |
| `OcrMatchSuggestion` | Suggests matching transaction for receipt |

**Hook:** `useOcrProcess` — uploads image, queues `ocr-receipt` job, polls for result.
**API:** `ocr-api.ts` — creates job_queue entry for worker processing.

---

### SEPA (`features/sepa/`)

| Component | Description |
|-----------|-------------|
| `SepaExportPage` | SEPA payment management and XML export |
| `SepaPaymentForm` | Create SEPA credit transfer with IBAN/BIC |

**Logic files:**
- `sepa-xml.ts` — Generates SEPA XML (pain.001.003.03 format)
- `iban-utils.ts` — IBAN validation (checksum) + BIC lookup

---

### Quick Add (`features/quick-add/`)

| Component | Description |
|-----------|-------------|
| `QuickAddOverlay` | Radix Dialog (Cmd+N): calculator input + German presets |

**Custom hooks:**
- `useCalculator` — Evaluates German math expressions: `"12,50+8,30"` → 20.80
- `useCategorySearch` — Fuzzy search: prefix match → contains match, ranked by score

**German presets:** Einkauf, Kaffee, ÖPNV, Restaurant, Tanken.

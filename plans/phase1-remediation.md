---
planStatus:
  planId: plan-phase1-remediation
  title: "Phase 1 Remediation: Make It Actually Work"
  status: draft
  planType: bug-fix
  priority: high
  owner: frederik
  stakeholders: []
  tags:
    - phase1
    - remediation
    - ux
    - actually-works
  created: "2026-02-22"
  updated: "2026-02-22T02:10:00.000Z"
  progress: 0
---
# Phase 1 Remediation: Make It Actually Work

## Problem Statement

Phase 1 was implemented across 132 files (~12K lines added) but delivers **zero visible improvement** to the user because:

1. **Triple gate** — All 8 feature flags default to `false`, progressive disclosure dims nav items, pages guard themselves
2. **Placeholder widgets** — 4 of 8 dashboard widgets are stubs showing "coming soon" text
3. **Missing wiring** — Quick Add overlay exists (286 lines) but has no entry point (no shortcut, no route)
4. **No transaction submission** — `useQuickAdd.submitTransaction()` is a `console.log` stub
5. **No visual change** — 22 new design tokens added but zero existing tokens modified. App looks identical.
6. **Calendar does own date math** — Ignores Actual's schedule engine entirely
7. **Dashboard doesn't use Actual's data** — ThisMonth shows `null` for income/spent, CashRunway shows "connect account balance"
8. **No cash account onboarding** — No way to create manual/cash accounts from the new Finance OS UX flows

**Core issue:** The implementation was "mile wide, inch deep" — every feature exists as scaffolding, none is cooked.

---

## Remediation Strategy

**Philosophy: Depth over breadth.** Fix the features that create the most impact, make them work end-to-end. Leave scaffolded features honestly disabled.

**Priority features:**
1. **Dashboard** — The first thing you see. Wire it to real Actual data.
2. **Quick Add** — The daily workflow improvement. Wire it, make it submit real transactions.
3. **Calendar** — Integrate with Actual's schedule engine.
4. **Cash Accounts** — Surface account creation in Finance OS flows.
5. **Visual Identity** — Make it look different from stock Actual.

Everything else (Review Queue, German Categories, Import wizards) stays as-is — they're scaffolded and will work once backend data exists.

---

## Sprint 1: Remove the Gates

**Goal:** Everything is reachable without arcane settings knowledge.
**Dependencies:** None
**Files touched:** `useFeatureFlag.ts`, `PrimaryButtons.tsx`, `ImportPage.tsx`

### Task 1.1: Default feature flags to `true`

**File:** `packages/desktop-client/src/hooks/useFeatureFlag.ts`

**EXACT CHANGE:** In the `DEFAULT_FEATURE_FLAG_STATE` object (lines 5-22), change these four values from `false` to `true`:

```typescript
// BEFORE:
contractManagement: false,
financeOS: false,
// ...
paymentCalendar: false,
// ...
extendedCommandBar: false,

// AFTER:
contractManagement: true,
financeOS: true,
// ...
paymentCalendar: true,
// ...
extendedCommandBar: true,
```

**Leave as ****`false`****:**
- `aiSmartMatching` — needs Ollama running
- `reviewQueue` — needs AI to populate
- `quickAdd` — will be enabled in Sprint 3 after it's wired
- `germanCategories` — destructive (modifies category tree), must be opt-in

**Verification:** After this change, the sidebar should show the Finance OS layout (Dashboard, Accounts, Budget, Reports, Contracts, Calendar) instead of the default layout.

### Task 1.2: Remove progressive disclosure gating from PrimaryButtons

**File:** `packages/desktop-client/src/components/sidebar/PrimaryButtons.tsx`

**WHAT TO REMOVE:** Three `<View style={{ opacity: ... }}>` wrappers that dim nav items.

**Change 1 — Contracts (lines 112-117):**
```typescript
// BEFORE:
<View
  style={{ opacity: hasContracts ? 1 : 0.4, pointerEvents: hasContracts ? 'auto' : 'none' }}
  title={hasContracts ? undefined : t('Import data to unlock')}
>
  <Item title={t('Contracts')} Icon={SvgCreditCard} to="/contracts" />
</View>

// AFTER:
<Item title={t('Contracts')} Icon={SvgCreditCard} to="/contracts" />
```

**Change 2 — Calendar (lines 119-124):** Same pattern — unwrap `<Item>` from `<View>`.

```typescript
// BEFORE:
<View
  style={{ opacity: hasContracts ? 1 : 0.4, pointerEvents: hasContracts ? 'auto' : 'none' }}
  title={hasContracts ? undefined : t('Import data to unlock')}
>
  <Item title={t('Calendar')} Icon={SvgCalendar3} to="/calendar" />
</View>

// AFTER:
<Item title={t('Calendar')} Icon={SvgCalendar3} to="/calendar" />
```

**Change 3 — Review (lines 141-154):** Same pattern — unwrap `<SecondaryItem>` from `<View>`.

```typescript
// BEFORE:
<View
  style={{
    opacity: hasReviewItems ? 1 : 0.4,
    pointerEvents: hasReviewItems ? 'auto' : 'none',
  }}
  title={hasReviewItems ? undefined : t('AI will populate this')}
>
  <SecondaryItem title={t('Review')} Icon={SvgCheckmark} to="/review" indent={15} />
</View>

// AFTER:
<SecondaryItem title={t('Review')} Icon={SvgCheckmark} to="/review" indent={15} />
```

**ALSO:** Delete the `hasContracts` and `hasReviewItems` state and the `useEffect` that checks them (lines 41-66). This removes the `(send as Function)('contract-list', {})` and `(send as Function)('review-count')` calls that were only used for progressive disclosure.

**Verification:** All sidebar items should be clickable. Contracts, Calendar, Review should be full opacity and respond to clicks.

### Task 1.3: Fix ImportPage flag guard

**File:** `packages/desktop-client/src/components/import/ImportPage.tsx`

**EXACT CHANGE:** Line 138 uses `useFeatureFlag('germanCategories')` as its guard. This is wrong — Import is a general feature, not a German-categories-only feature.

Remove the guard entirely. Delete lines 138-152:

```typescript
// DELETE THIS ENTIRE BLOCK:
const enabled = useFeatureFlag('germanCategories');

if (!enabled) {
  return (
    <Page header={t('Import')}>
      <View style={{ padding: 20 }}>
        <Text style={{ color: theme.pageTextSubdued }}>
          <Trans>
            Import is not enabled. Enable it in Settings &gt; Feature Flags.
          </Trans>
        </Text>
      </View>
    </Page>
  );
}
```

Also remove the now-unused import:
```typescript
// DELETE:
import { useFeatureFlag } from '@desktop-client/hooks/useFeatureFlag';
```

The Import page hub should always be accessible. The CategorySetupCard within it can check its own flag if needed (it doesn't currently, which is fine — it's just a button).

**Verification:** Navigating to `/import` should show the hub with Finanzguru, CSV, and Category Setup cards — without needing to enable any feature flag.

---

## Sprint 2: Wire Dashboard to Real Data

**Goal:** Dashboard shows real numbers from the user's actual budget.
**Dependencies:** Sprint 1 (flags must be on so Dashboard is accessible)
**Files touched:** `ThisMonthWidget.tsx`, `CashRunwayWidget.tsx`, `AccountBalancesWidget.tsx`, `BalanceProjectionWidget.tsx`, `QuickAddWidget.tsx`, `DashboardPage.tsx`

### Task 2.1: Fix ThisMonthWidget — wire to Actual's spreadsheet

**File:** `packages/desktop-client/src/components/dashboard/widgets/ThisMonthWidget.tsx`

Currently `incomeCents = null` and `spentCents = null` are hardcoded on lines 51-52.

**CRITICAL PATTERN — How Actual's Spreadsheet Works:**

Budget bindings (`totalIncome`, `totalSpent`) are NOT query-based. They read from a spreadsheet sheet that is named `budget202602` (for Feb 2026). The component must be wrapped in `<SheetNameProvider>` to set this context.

Account bindings (`allAccountBalance()`) ARE query-based and work globally without any provider.

**Step 1 — DashboardPage.tsx:** Wrap `ThisMonthWidget` in `SheetNameProvider`:

```typescript
// Add imports to DashboardPage.tsx:
import * as monthUtils from 'loot-core/shared/months';
import { SheetNameProvider } from '@desktop-client/hooks/useSheetName';

// Wrap the widget (around line 127):
<SheetNameProvider name={monthUtils.sheetForMonth(monthUtils.currentMonth())}>
  <ThisMonthWidget summary={contractSummary} loading={loading} />
</SheetNameProvider>
```

**Step 2 — ThisMonthWidget.tsx:** Replace hardcoded nulls with spreadsheet hooks:

```typescript
// Add imports:
import { useSheetValue } from '@desktop-client/hooks/useSheetValue';
import { envelopeBudget } from '@desktop-client/spreadsheet/bindings';

// Replace lines 51-52. BEFORE:
const incomeCents = null;
const spentCents = null;

// AFTER:
const incomeCents = useSheetValue<'envelope-budget', 'total-income'>(
  envelopeBudget.totalIncome,
);
const spentCents = useSheetValue<'envelope-budget', 'total-spent'>(
  envelopeBudget.totalSpent,
);
```

**How ****`useSheetValue`**** works:** It takes a binding (string field name or `{ name, query }` object) and returns the numeric value from the spreadsheet engine. For budget bindings (string fields like `'total-income'`), the sheet context is provided by `SheetNameProvider`. For account bindings (objects with `query`), the sheet name is embedded in the binding itself.

**REFERENCE PATTERN:** See `packages/desktop-client/src/components/budget/BalanceWithCarryover.tsx:119-122` — uses `useSheetValue(carryover)` etc. in exactly this way.

**Verification:** ThisMonthWidget should show real income/spent values from the current month's budget. If no budget data exists, values will be 0 (which is correct — the widget shows €0.00).

### Task 2.2: Fix CashRunwayWidget — read account balance

**File:** `packages/desktop-client/src/components/dashboard/widgets/CashRunwayWidget.tsx`

Currently `currentBalanceCents` prop defaults to `null` and is never passed.

**CHANGE:** Wire balance inside the widget using `useSheetValue` + `allAccountBalance()`:

```typescript
// Add imports:
import { useSheetValue } from '@desktop-client/hooks/useSheetValue';
import { allAccountBalance } from '@desktop-client/spreadsheet/bindings';

// Inside the component, add:
const totalBalance = useSheetValue<'account', 'accounts-balance'>(allAccountBalance());

// Then use totalBalance instead of the currentBalanceCents prop.
// Replace the line:
//   if (summary?.total_monthly && summary.total_monthly > 0 && currentBalanceCents != null) {
// With:
if (summary?.total_monthly && summary.total_monthly > 0 && totalBalance != null) {
  const dailyCostCents = summary.total_monthly / 30;
  const days = Math.floor(totalBalance / dailyCostCents);
  // ... rest stays the same
}
```

**IMPORTANT:** `allAccountBalance()` returns a `Binding<'account', 'accounts-balance'>` which is query-based — NO `SheetNameProvider` needed. It queries all non-closed accounts directly.

**Remove** the `currentBalanceCents` prop from the type definition since it's no longer needed.

**REFERENCE PATTERN:** See `packages/desktop-client/src/hooks/useAccountPreviewTransactions.ts:71-78` — uses `useSheetValue` with `bindings.allAccountBalance()` in exactly this way.

**Verification:** CashRunwayWidget should show a date and days count. If no contracts exist (summary.total_monthly is 0), it should still show the balance info or a helpful message.

### Task 2.3: Fix AccountBalancesWidget — show real accounts

**File:** `packages/desktop-client/src/components/dashboard/widgets/AccountBalancesWidget.tsx`

Currently 25 lines of placeholder text. Replace entirely.

**Implementation:**

```typescript
// @ts-strict-ignore
import React from 'react';
import { useTranslation } from 'react-i18next';

import { theme } from '@actual-app/components/theme';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';
import { useQuery } from '@tanstack/react-query';

import { accountQueries } from '@desktop-client/accounts';
import { CellValue } from '@desktop-client/components/spreadsheet/CellValue';
import { accountBalance } from '@desktop-client/spreadsheet/bindings';
import { WidgetCard } from './WidgetCard';

function AccountRow({ account }: { account: { id: string; name: string; offbudget?: boolean } }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '4px 0',
      }}
    >
      <Text style={{ fontSize: 13, color: theme.pageText }}>{account.name}</Text>
      <CellValue binding={accountBalance(account.id)} type="financial" />
    </View>
  );
}

export function AccountBalancesWidget() {
  const { t } = useTranslation();
  const { data: accounts = [] } = useQuery(accountQueries.listActive());

  const onBudget = accounts.filter(a => !a.offbudget);
  const offBudget = accounts.filter(a => a.offbudget);

  if (accounts.length === 0) {
    return (
      <WidgetCard title={t('Account Balances')} style={{ gridColumn: '1 / -1' }}>
        <Text style={{ color: theme.pageTextSubdued, fontSize: 13 }}>
          {t('No accounts yet. Add an account from the sidebar to get started.')}
        </Text>
      </WidgetCard>
    );
  }

  return (
    <WidgetCard title={t('Account Balances')} style={{ gridColumn: '1 / -1' }}>
      {onBudget.length > 0 && (
        <View style={{ marginBottom: offBudget.length > 0 ? 12 : 0 }}>
          <Text style={{ fontSize: 11, color: theme.pageTextSubdued, marginBottom: 6 }}>
            {t('On Budget')}
          </Text>
          {onBudget.map(a => <AccountRow key={a.id} account={a} />)}
        </View>
      )}
      {offBudget.length > 0 && (
        <View>
          <Text style={{ fontSize: 11, color: theme.pageTextSubdued, marginBottom: 6 }}>
            {t('Off Budget')}
          </Text>
          {offBudget.map(a => <AccountRow key={a.id} account={a} />)}
        </View>
      )}
    </WidgetCard>
  );
}
```

**KEY PATTERN:** `CellValue` component renders `useSheetValue(binding)` result with formatting. `accountBalance(account.id)` returns a query-based binding — no SheetNameProvider needed. The `type="financial"` prop formats the value as currency.

**REFERENCE PATTERN:** `CellValue` is used extensively in `packages/desktop-client/src/components/spreadsheet/CellValue.tsx`. See `packages/desktop-client/src/components/CommandBar.tsx` lines 42-44 for similar account balance rendering imports.

**API:** `useQuery(accountQueries.listActive())` returns `AccountEntity[]` with `id`, `name`, `offbudget`, `closed` fields. `listActive()` already filters out closed accounts.

**Verification:** Should show all non-closed accounts grouped by on/off budget with live balances.

### Task 2.4: Fix BalanceProjectionWidget — show text-based projection

**File:** `packages/desktop-client/src/components/dashboard/widgets/BalanceProjectionWidget.tsx`

Currently shows emoji placeholder. Replace with a text-based 30-day projection using data already available in DashboardPage.

**CHANGE DashboardPage.tsx:** Pass `upcomingFlat` and total balance to the widget:

```typescript
// In DashboardPage's render, change:
<BalanceProjectionWidget />
// To:
<BalanceProjectionWidget upcomingPayments={upcomingFlat} />
```

**REPLACE BalanceProjectionWidget.tsx entirely:**

```typescript
// @ts-strict-ignore
import React from 'react';
import { useTranslation } from 'react-i18next';

import { theme } from '@actual-app/components/theme';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';

import { useSheetValue } from '@desktop-client/hooks/useSheetValue';
import { allAccountBalance } from '@desktop-client/spreadsheet/bindings';

import type { UpcomingPayment } from '../types';
import { WidgetCard } from './WidgetCard';

function formatEur(cents: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

type Props = {
  upcomingPayments: UpcomingPayment[];
};

export function BalanceProjectionWidget({ upcomingPayments }: Props) {
  const { t } = useTranslation();
  const balance = useSheetValue<'account', 'accounts-balance'>(allAccountBalance());

  if (balance == null) {
    return (
      <WidgetCard title={t('Balance Projection')} style={{ gridColumn: '1 / -1' }}>
        <Text style={{ color: theme.pageTextSubdued, fontSize: 13 }}>
          {t('Add an account to see balance projections.')}
        </Text>
      </WidgetCard>
    );
  }

  // Build projection at 7, 14, 30 day intervals
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const intervals = [7, 14, 30];
  const rows = intervals.map(days => {
    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() + days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const paymentsInRange = upcomingPayments.filter(p => p.date <= cutoffStr);
    const totalOutflow = paymentsInRange.reduce((sum, p) => sum + (p.amount ?? 0), 0);
    const projected = balance - totalOutflow;

    return { days, count: paymentsInRange.length, totalOutflow, projected };
  });

  return (
    <WidgetCard title={t('Balance Projection')} style={{ gridColumn: '1 / -1' }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
        <Text style={{ fontSize: 13, color: theme.pageTextSubdued }}>{t('Today')}</Text>
        <Text style={{ fontSize: 13, fontWeight: 600, color: theme.pageText }}>
          {formatEur(balance)}
        </Text>
      </View>
      {rows.map(row => (
        <View
          key={row.days}
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '4px 0',
          }}
        >
          <View>
            <Text style={{ fontSize: 13, color: theme.pageTextSubdued }}>
              {t('+{{days}} days', { days: row.days })}
            </Text>
            {row.count > 0 && (
              <Text style={{ fontSize: 11, color: theme.pageTextSubdued }}>
                {t('{{count}} payments: -{{amount}}', {
                  count: row.count,
                  amount: formatEur(row.totalOutflow),
                })}
              </Text>
            )}
          </View>
          <Text
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: row.projected < 0 ? '#ef4444' : theme.pageText,
            }}
          >
            {formatEur(row.projected)}
          </Text>
        </View>
      ))}
    </WidgetCard>
  );
}
```

**NOTE:** This projection uses `upcomingPayments` from `useUpcomingPayments(14)`. For the 30-day interval to be accurate, the `withinDays` parameter in DashboardPage should be increased to 30:

```typescript
// DashboardPage.tsx, change:
const { grouped, loading: paymentsLoading, error: paymentsError } = useUpcomingPayments(14);
// To:
const { grouped, loading: paymentsLoading, error: paymentsError } = useUpcomingPayments(30);
```

**Verification:** Should show today's balance and projected balances at +7, +14, +30 days.

### Task 2.5: Fix QuickAddWidget — make it a button

**File:** `packages/desktop-client/src/components/dashboard/widgets/QuickAddWidget.tsx`

Currently just shows "Use ⌘N" text. Replace with a button that opens the Quick Add overlay.

**REPLACE entirely:**

```typescript
// @ts-strict-ignore
import React from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { theme } from '@actual-app/components/theme';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';

import { WidgetCard } from './WidgetCard';

type Props = {
  onOpenQuickAdd?: () => void;
};

export function QuickAddWidget({ onOpenQuickAdd }: Props) {
  const { t } = useTranslation();

  return (
    <WidgetCard title={t('Quick Add')}>
      <View style={{ alignItems: 'center', gap: 12, paddingTop: 8, paddingBottom: 4 }}>
        <Button
          variant="primary"
          onPress={() => onOpenQuickAdd?.()}
          style={{ width: '100%' }}
        >
          {t('Add Expense')}
        </Button>
        <Text style={{ color: theme.pageTextSubdued, fontSize: 11 }}>
          {t('or press ⌘N anywhere')}
        </Text>
      </View>
    </WidgetCard>
  );
}
```

**DashboardPage.tsx change:** Pass `onOpenQuickAdd` callback. This connects to the QuickAddOverlay mounted in Sprint 3. Until Sprint 3, the button fires a CustomEvent:

```typescript
// In DashboardPage.tsx:
<QuickAddWidget onOpenQuickAdd={() => document.dispatchEvent(new CustomEvent('quick-add-open'))} />
```

**Verification:** Should show an "Add Expense" button instead of static text. Button click dispatches event (handled after Sprint 3).

### Task 2.6: DashboardPage — fix empty state logic + add SheetNameProvider

**File:** `packages/desktop-client/src/components/dashboard/DashboardPage.tsx`

**Change 1:** `hasNoData` currently only checks contracts. Dashboard should show content if there are ANY accounts (even with 0 contracts). Add account count check:

```typescript
// Add import:
import { useAccounts } from '@desktop-client/hooks/useAccounts';

// Inside the component:
const { data: accounts = [] } = useAccounts();

// Change hasNoData logic (lines 62-70):
// BEFORE:
const hasNoData =
  !isInitialLoading &&
  !error &&
  contractSummary !== null &&
  totalContracts === 0 &&
  upcomingFlat.length === 0;

// AFTER:
const hasNoData =
  !isInitialLoading &&
  !error &&
  accounts.length === 0 &&
  totalContracts === 0 &&
  upcomingFlat.length === 0;
```

**Change 2:** Wrap ThisMonthWidget in SheetNameProvider (see Task 2.1):

```typescript
// Add imports:
import * as monthUtils from 'loot-core/shared/months';
import { SheetNameProvider } from '@desktop-client/hooks/useSheetName';

// Wrap:
<SheetNameProvider name={monthUtils.sheetForMonth(monthUtils.currentMonth())}>
  <ThisMonthWidget summary={contractSummary} loading={loading} />
</SheetNameProvider>
```

**Change 3:** Change `useUpcomingPayments(14)` to `useUpcomingPayments(30)` for the projection widget.

**Change 4:** Pass `upcomingFlat` to `BalanceProjectionWidget` and `onOpenQuickAdd` to `QuickAddWidget`:

```typescript
<BalanceProjectionWidget upcomingPayments={upcomingFlat} />
<QuickAddWidget onOpenQuickAdd={() => document.dispatchEvent(new CustomEvent('quick-add-open'))} />
```

**Verification:** Dashboard should show widgets with real data when accounts exist, even without contracts.

---

## Sprint 3: Wire Quick Add to Real Transactions

**Goal:** There's a way to open the Quick Add overlay and submitting creates a real Actual transaction.
**Dependencies:** Sprint 1 (flags)
**Files touched:** `GlobalKeys.ts`, `FinancesApp.tsx`, `useQuickAdd.ts`, `QuickAddOverlay.tsx`, `useFeatureFlag.ts`

### Task 3.1: Add ⌘N handler to GlobalKeys

**File:** `packages/desktop-client/src/components/GlobalKeys.ts`

**PROBLEM:** The `Platform.isBrowser` check on line 14 returns early for browser environments, blocking ALL keyboard shortcuts in the web app. This needs to be fixed for ⌘N to work (it's the primary deployment target — Docker web app).

**EXACT CHANGE:** Add ⌘N handling. The handler should work in BOTH browser and desktop modes.

```typescript
// REPLACE the entire useEffect body with:
const handleKeys = (e: KeyboardEvent) => {
  if (!e.metaKey && !e.ctrlKey) return;

  // Quick Add — works everywhere, browser + desktop
  if (e.key === 'n' && financeOS) {
    e.preventDefault();
    document.dispatchEvent(new CustomEvent('quick-add-open'));
    return;
  }

  // Navigation shortcuts — desktop only (browser uses its own ⌘+number behavior)
  if (Platform.isBrowser) return;

  if (financeOS) {
    switch (e.key) {
      case '1': void navigate('/dashboard'); break;
      case '2': void navigate('/accounts'); break;
      // ... rest of financeOS cases stay the same
    }
    return;
  }

  // Default mode shortcuts stay the same
  switch (e.key) {
    case '1': void navigate('/budget'); break;
    // ... rest stays the same
  }
};
```

**KEY INSIGHT:** ⌘N must fire BEFORE the `Platform.isBrowser` early return. The numbered shortcuts can stay browser-gated (they conflict with browser tab switching).

**Verification:** Pressing ⌘N (or Ctrl+N) should dispatch the `quick-add-open` CustomEvent. Console: `document.dispatchEvent(new CustomEvent('quick-add-open'))` should work.

### Task 3.2: Mount QuickAddOverlay in FinancesApp

**File:** `packages/desktop-client/src/components/FinancesApp.tsx`

**EXACT CHANGE:** Add QuickAddOverlay as a global overlay sibling to CommandBar.

```typescript
// Add imports (around line 30):
import { useState, useEffect } from 'react';  // useState may already be imported
import { QuickAddOverlay } from './quick-add/QuickAddOverlay';
import { useFeatureFlag } from '@desktop-client/hooks/useFeatureFlag';

// Inside FinancesApp component (before the return):
const quickAddEnabled = useFeatureFlag('quickAdd');
const [quickAddOpen, setQuickAddOpen] = useState(false);

useEffect(() => {
  if (!quickAddEnabled) return;
  const handler = () => setQuickAddOpen(true);
  document.addEventListener('quick-add-open', handler);
  return () => document.removeEventListener('quick-add-open', handler);
}, [quickAddEnabled]);

// In JSX, right after <CommandBar /> (line 208):
{quickAddEnabled && (
  <QuickAddOverlay isOpen={quickAddOpen} onClose={() => setQuickAddOpen(false)} />
)}
```

**NOTE:** `useFeatureFlag` is already imported in the file via PrimaryButtons. If not in FinancesApp directly, add the import: `import { useFeatureFlag } from '@desktop-client/hooks/useFeatureFlag';`

**NOTE 2:** The `useState` import — check if it's already imported from React at the top of the file. If `useEffect` and `useRef` are imported but not `useState`, add it to the destructured import.

**Verification:** With `quickAdd` flag enabled, pressing ⌘N should open the overlay. ESC should close it.

### Task 3.3: Implement real transaction submission

**File:** `packages/desktop-client/src/components/quick-add/hooks/useQuickAdd.ts`

**EXACT CHANGE:** Replace the `console.log` stub (lines 54-58) with real Actual transaction creation.

```typescript
// Add imports at top of file:
import { v4 as uuidv4 } from 'uuid';
import { send } from 'loot-core/platform/client/connection';

// REPLACE submitTransaction (lines 54-58):
// BEFORE:
const submitTransaction = useCallback(async (): Promise<boolean> => {
  if (!form.evaluatedAmount && !form.amount) return false;
  console.log('[QuickAdd] Submit transaction:', form);
  return true;
}, [form]);

// AFTER:
const submitTransaction = useCallback(async (): Promise<boolean> => {
  const amount = form.evaluatedAmount;
  if (!amount) return false;

  const accountId = form.accountId || defaultAccountId;
  if (!accountId) {
    console.error('[QuickAdd] No account selected and no default account');
    return false;
  }

  // Resolve payee name to ID if provided
  let payeeId: string | undefined;
  if (form.payee.trim()) {
    try {
      payeeId = await send('payees-get-or-create-payee', {
        name: form.payee.trim(),
      });
    } catch {
      // Payee creation failed — submit without payee
    }
  }

  const transaction = {
    id: uuidv4(),
    date: form.date,               // YYYY-MM-DD string
    amount: -Math.abs(amount),      // IntegerAmount (cents), negative = expense
    account: accountId,             // AccountEntity['id'] — REQUIRED
    category: form.categoryId || undefined,
    payee: payeeId || undefined,
    notes: form.notes || undefined,
  };

  try {
    await send('transaction-add', transaction);
    return true;
  } catch (err) {
    console.error('[QuickAdd] Failed to add transaction:', err);
    return false;
  }
}, [form, defaultAccountId]);
```

**CRITICAL NOTES FOR AGENTS:**
- `transaction-add` is in the typed `Handlers` union — use `send()` directly, NOT `(send as Function)`
- `id` MUST be a v4 UUID string (import from `uuid` package, already in project dependencies)
- `account` is REQUIRED — transactions MUST have an account
- `payee` takes `PayeeEntity['id']`, NOT a name string. Use `send('payees-get-or-create-payee', { name })` to convert
- `amount` must be in cents (IntegerAmount). Negative = expense.
- `date` must be `YYYY-MM-DD` string (form.date already provides this)
- See type definition at `packages/loot-core/src/types/models/transaction.ts`

### Task 3.4: Add default account selection to useQuickAdd

**File:** `packages/desktop-client/src/components/quick-add/hooks/useQuickAdd.ts`

The hook needs a `defaultAccountId` for when no account is explicitly selected.

**CHANGE:** Accept `defaultAccountId` as a parameter:

```typescript
// Change function signature:
export function useQuickAdd(defaultAccountId?: string): UseQuickAddReturn {
```

**File:** `packages/desktop-client/src/components/quick-add/QuickAddOverlay.tsx`

Pass the default account from the component:

```typescript
// Add import:
import { useQuery } from '@tanstack/react-query';
import { accountQueries } from '@desktop-client/accounts';

// Inside QuickAddOverlay component:
const { data: accounts = [] } = useQuery(accountQueries.listOnBudget());
const defaultAccountId = accounts[0]?.id;

// Change useQuickAdd call:
const { form, setField, resetForm, prefill, submitTransaction } = useQuickAdd(defaultAccountId);
```

### Task 3.5: Enable quickAdd flag

**File:** `packages/desktop-client/src/hooks/useFeatureFlag.ts`

After the above wiring is done, change `quickAdd` default to `true`:

```typescript
quickAdd: true,
```

**Verification:** Full flow: ⌘N opens overlay → enter amount → optionally pick category/payee → ⌘Enter submits → transaction appears in account register.

---

## Sprint 4: Calendar Integration with Actual's Schedule Engine

**Goal:** Calendar shows both contract payments AND Actual's existing schedules.
**Dependencies:** Sprint 1 (flags)
**Files touched:** `useCalendarData.ts`, `useUpcomingPayments.ts`, `CalendarPage.tsx`

### Task 4.1: Fix useCalendarData to merge contracts + schedules

**File:** `packages/desktop-client/src/components/calendar/hooks/useCalendarData.ts`

Currently only fetches contracts with hand-rolled date math. Should ALSO use Actual's schedule engine.

**APPROACH:** The hook should merge two data sources:
1. Contracts via `send('contract-list', { status: 'active' })` (existing)
2. Actual schedules via `useSchedules` hook

**Add schedule data:**

```typescript
// Add imports:
import { useSchedules, getSchedulesQuery } from '@desktop-client/hooks/useSchedules';

// Inside the hook, add:
const { schedules, isLoading: schedulesLoading } = useSchedules({
  query: getSchedulesQuery(),
});
```

**Map schedules to CalendarEntry format:** Each `ScheduleEntity` has computed fields `_amount`, `_payee`, `_account`, and `next_date`. Map these to the same entry format as contracts.

**Remove hand-rolled date math:** Delete `advanceByInterval()`, `getUpcomingDatesForContract()`, and similar functions. Replace with schedule `next_date` for the canonical "when is the next payment?" answer.

**Keep contracts as a separate source** — contracts represent subscriptions/contracts with metadata (counterparty, cancellation, IBAN) beyond what schedules track. Show both, deduplicate by matching contract↔schedule links (contracts already create Actual schedules in `contract-create`).

**REFERENCE:** `useSchedules` API at `packages/desktop-client/src/hooks/useSchedules.ts:29-47`. Returns `{ schedules: ScheduleEntity[], statuses, statusLabels, isLoading }`. Each schedule has `next_date`, `_amount` (computed), `_payee` (PayeeEntity), `_account` (AccountEntity).

### Task 4.2: Fix useUpcomingPayments to include schedule data

**File:** `packages/desktop-client/src/components/dashboard/hooks/useUpcomingPayments.ts`

Same problem — only uses contracts with naive date math.

**APPROACH:** Keep contract fetching (for contract metadata display). Add schedule data for accurate next-payment dates.

This is a custom hook (not a component), so it can't use `useSchedules` directly since that's a React hook that requires component context. Two options:

**Option A (recommended):** Convert `useUpcomingPayments` to use `useSchedules` hook since it's already called from React components:

```typescript
import { useSchedules, getSchedulesQuery } from '@desktop-client/hooks/useSchedules';

// Add inside the hook:
const { schedules } = useSchedules({ query: getSchedulesQuery() });

// Map schedules to UpcomingPayment format using next_date and _amount
```

**Option B:** Pass schedules from the parent component.

The hand-rolled date math (`getNextPaymentDate`, `getPaymentDatesWithinDays`) should be removed entirely. Actual's schedule engine handles all recurrence types correctly (monthly, weekly, annual, quarterly, semi-annual, custom).

### Task 4.3: CalendarPage — show schedule source badges

**File:** `packages/desktop-client/src/components/calendar/CalendarPage.tsx` (or the PaymentItem subcomponent)

When displaying payments, show a subtle badge indicating the source:
- Contract entries: small "Contract" badge
- Schedule entries: small "Schedule" badge (or the schedule name)

This is a minor UI enhancement — implement only after 4.1 and 4.2 are working.

---

## Sprint 5: Cash Account Onboarding

**Goal:** Users can create manual/cash accounts from the Finance OS flows — wizard, import page, dashboard.
**Dependencies:** Sprint 1 (flags)
**Files touched:** `GettingStartedWizard.tsx`, `ImportPage.tsx`, `DashboardPage.tsx`

### Task 5.1: Add "Create Account" step to GettingStartedWizard

**File:** `packages/desktop-client/src/components/import/GettingStartedWizard.tsx`

Currently has 5 steps: Welcome, Categories, Import, Review, Done. The wizard never prompts to create an account — but transactions need an account.

**CHANGE:** Add a new Step 2 (shift existing steps to 3-6):

```
Step 1: Welcome (existing)
Step 2: Create Account (NEW)
Step 3: Categories (was step 2)
Step 4: Import (was step 3)
Step 5: Review (was step 4)
Step 6: Done (was step 5)
```

**Step type changes:**
```typescript
type Step = 1 | 2 | 3 | 4 | 5 | 6;
```

**New Step 2 UI:** Show two options:
1. **"Add a Cash Account"** — inline name + starting balance form, creates account via `send('account-create', { name, balance, offBudget: false })`
2. **"I'll connect a bank later"** — skip button, navigates to next step

**Account creation pattern** (from `packages/desktop-client/src/accounts/mutations.ts`):
```typescript
import { send } from 'loot-core/platform/client/connection';

// Create account:
const accountId = await send('account-create', {
  name: accountName,      // string, e.g. "Cash Wallet"
  balance: balanceCents,   // IntegerAmount in cents, e.g. 50000 for €500
  offBudget: false,        // boolean — on-budget by default
});
```

**Inline form fields:**
- Account name (text input, default: "Bargeld" / "Cash Wallet" based on language)
- Starting balance (number input in EUR, convert to cents for API)
- Off-budget toggle (default: unchecked = on-budget)

**Reference:** `packages/desktop-client/src/components/modals/CreateLocalAccountModal.tsx` shows the existing form pattern — name, balance, off-budget toggle, uses `useCreateAccountMutation()`.

**Steps array update:**
```typescript
const steps = [
  { label: t('Welcome') },
  { label: t('Account') },    // NEW
  { label: t('Categories') },
  { label: t('Import') },
  { label: t('Review') },
  { label: t('Done') },
];
```

### Task 5.2: Add "Create Cash Account" card to ImportPage

**File:** `packages/desktop-client/src/components/import/ImportPage.tsx`

Add a fourth card to the import hub alongside Finanzguru, CSV, and Category Setup.

**Add new card component:**

```typescript
function CreateAccountCard() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <ImportCard
      icon="💰"
      title={t('Cash Account')}
      description={t(
        'Create a manual account for cash, savings, or other non-bank accounts. Track expenses without bank sync.',
      )}
      onStart={() => {
        // Open Actual's built-in "Add account" modal
        // This triggers the same modal as the sidebar "Add account" button
        void navigate('/accounts');
        // NOTE: Ideally open the modal directly. If that's complex,
        // navigating to /accounts and letting the user click "Add account" is acceptable.
      }}
    />
  );
}
```

**Add to the card grid (around line 189):**
```typescript
<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
  <ImportCard ... /> {/* Finanzguru */}
  <ImportCard ... /> {/* CSV */}
  <CreateAccountCard />
  <CategorySetupCard />
</View>
```

**Verification:** Import page should show 4 cards. "Cash Account" card should navigate to accounts page where user can create an account.

### Task 5.3: Add "Add Account" to Dashboard empty state

**File:** `packages/desktop-client/src/components/dashboard/DashboardPage.tsx`

The dashboard empty state (lines 103-120) currently shows "Import Data" and "Set Up Categories" buttons. Add a third action:

```typescript
// Add to the actions array in EmptyState:
actions={[
  {
    label: t('Add Account'),
    onPress: () => navigate('/accounts'),
    primary: true,
  },
  {
    label: t('Import Data'),
    onPress: () => navigate('/import'),
  },
  {
    label: t('Set Up Categories'),
    onPress: () => (send as Function)('categories-setup-german-tree'),
  },
]}
```

Make "Add Account" the primary action since accounts are the most fundamental prerequisite.

---

## Sprint 6: Visual Polish

**Goal:** The app looks noticeably different from stock Actual.
**Dependencies:** Sprints 1-5
**Files touched:** `WidgetCard.tsx`, sidebar `Item.tsx`, `Titlebar.tsx`

### Task 6.1: Card component visual upgrade

**File:** `packages/desktop-client/src/components/dashboard/widgets/WidgetCard.tsx`

Dashboard cards should look more polished:

```typescript
// BEFORE (current styles):
backgroundColor: theme.tableBackground,
borderRadius: 8,
border: `1px solid ${theme.tableBorder}`,
padding: 16,

// AFTER:
backgroundColor: theme.tableBackground,
borderRadius: 10,
border: `1px solid ${theme.tableBorder}`,
padding: 16,
boxShadow: '0 1px 3px rgba(0,0,0,.04), 0 1px 2px rgba(0,0,0,.06)',
```

Small change, visible improvement. Don't over-engineer.

### Task 6.2: Sidebar active state

**File:** `packages/desktop-client/src/components/sidebar/Item.tsx`

Add a left border accent for the active item:

Find the active state styling and add:
```css
borderLeft: '3px solid [theme.buttonPrimaryBackground]'
```

with corresponding padding adjustment to prevent layout shift.

### Task 6.3: FinanceOS default route

**File:** `packages/desktop-client/src/components/FinancesApp.tsx`

When `financeOS` is enabled and accounts exist, default route should go to `/dashboard` instead of `/budget`:

```typescript
// In the root Route element (lines 254-265), add financeOS awareness:
// If financeOS flag is true and accounts exist, redirect to /dashboard
// Otherwise keep existing behavior (/budget or /accounts)
```

This requires reading the `financeOS` flag inside the route. Use `useFeatureFlag('financeOS')` inside the component or pass it down.

---

## What This Plan Does NOT Cover (Intentionally)

These stay scaffolded and will work once their data sources exist:

| Feature | Status | Why it's OK to defer |
| --- | --- | --- |
| Review Queue | Backend API exists, frontend exists | Needs AI classification to populate. Works when Ollama produces review items. |
| German Category Tree | Handler + install button exist | One-click install on Import page. Works already. |
| Finanzguru Import | Wizard exists | Needs real XLSX parsing. Current UI is ready for backend work. |
| CSV Import | Wizard exists | Same — UI ready, needs bank format parsers. |
| AI Smart Matching | Handlers exist | Needs Ollama running + transaction data. Gated by flag. |
| Contract Discovery | Backend stub | Needs transaction pattern analysis. Future sprint. |

---

## Agent Execution Guide

### Sprint ordering

Sprints 1-5 can be run in this order. Sprint 6 depends on all others.

| Sprint | Estimated effort | Can parallelize? |
| --- | --- | --- |
| Sprint 1: Remove Gates | Small | No — do first |
| Sprint 2: Dashboard Wiring | Medium | Yes, with Sprint 3 |
| Sprint 3: Quick Add Wiring | Medium | Yes, with Sprint 2 |
| Sprint 4: Calendar Integration | Medium | Yes, with Sprint 2/3 |
| Sprint 5: Cash Account Onboarding | Small | Yes, with Sprint 2/3/4 |
| Sprint 6: Visual Polish | Small | No — do last |

### File ownership per sprint

| Sprint | Files touched |
| --- | --- |
| 1 | `useFeatureFlag.ts`, `PrimaryButtons.tsx`, `ImportPage.tsx` |
| 2 | `ThisMonthWidget.tsx`, `CashRunwayWidget.tsx`, `AccountBalancesWidget.tsx`, `BalanceProjectionWidget.tsx`, `QuickAddWidget.tsx`, `DashboardPage.tsx` |
| 3 | `GlobalKeys.ts`, `FinancesApp.tsx`, `useQuickAdd.ts`, `QuickAddOverlay.tsx`, `useFeatureFlag.ts` |
| 4 | `useCalendarData.ts`, `useUpcomingPayments.ts`, `CalendarPage.tsx` |
| 5 | `GettingStartedWizard.tsx`, `ImportPage.tsx`, `DashboardPage.tsx` |
| 6 | `WidgetCard.tsx`, `Item.tsx`, `FinancesApp.tsx` |

**CONFLICTS:** Sprint 2 and Sprint 5 both touch `DashboardPage.tsx`. Sprint 1 and Sprint 3 both touch `useFeatureFlag.ts`. Sprint 3 and Sprint 6 both touch `FinancesApp.tsx`. Run Sprint 1 first, then parallelize 2-5, then run 6 last.

### Critical patterns (agents MUST follow)

- **Import ****`useParams`**** from ****`'react-router'`**, not `'react-router-dom'`
- **Button uses ****`isDisabled`**, not `disabled` (react-aria)
- **Button ****`onPress`** receives `PressEvent`, not `MouseEvent`
- **`useSheetValue(binding)`** — for budget bindings (string fields), component must be inside `<SheetNameProvider>`. For account bindings (objects with `query` key), no provider needed.
- **`send()`**** type safety** — use `(send as Function)` for fork handlers not in the Handlers union. For existing Actual handlers like `transaction-add`, `accounts-get`, `payees-get-or-create-payee`, use typed `send()` directly.
- **NO lazy routes** — use eager imports + `element={}`
- **Styling** — `@emotion/css` only, no Tailwind. Use `theme.X` tokens from `@actual-app/components/theme`
- **Account data** — use `useQuery(accountQueries.listActive())` from `@desktop-client/accounts`. Returns `AccountEntity[]` with `id`, `name`, `offbudget`, `closed`.
- **Transaction creation** — `send('transaction-add', { id: uuidv4(), account, amount, date, ... })`. Amount in cents. Payee must be ID not name.

### Verification checklist

After ALL sprints complete, verify:
1. [ ] Sidebar shows Finance OS layout by default (no flag flipping needed)
2. [ ] All sidebar items are clickable (no dimming)
3. [ ] Dashboard shows real account balances
4. [ ] Dashboard shows real income/spent for current month
5. [ ] Cash runway shows days remaining based on actual balance
6. [ ] Balance projection shows 7/14/30 day forecasts
7. [ ] ⌘N opens Quick Add overlay
8. [ ] Quick Add submits a real transaction (appears in account register)
9. [ ] Calendar shows scheduled payments
10. [ ] Getting Started Wizard prompts to create an account
11. [ ] Import page has "Cash Account" card
12. [ ] `yarn typecheck` passes

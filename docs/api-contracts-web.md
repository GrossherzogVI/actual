# Finance OS — API Contracts (Web Frontend)

**Generated:** 2026-02-26
**File:** `apps/web/src/core/api/finance-api.ts`
**Transport:** SurrealDB WebSocket SDK (not HTTP REST)
**Auth:** All queries execute in the authenticated SurrealDB session

All functions call `await connect()` internally before querying. The connection is a singleton with a promise-based guard to prevent race conditions.

---

## Transactions

### `listTransactions(opts?)`
```typescript
opts?: {
  accountId?: string
  categoryId?: string
  startDate?: string    // ISO datetime
  endDate?: string      // ISO datetime
  search?: string       // Searches payee.name and notes
  limit?: number        // Default: 50
  start?: number        // Offset for pagination, default: 0
}
→ Promise<Transaction[]>
```
Returns transactions with `payee_name` and `category_name` resolved via record links. Ordered `date DESC`.

### `createTransaction(data)`
```typescript
data: Omit<Transaction, 'id' | 'created_at' | 'updated_at' | 'imported' | 'cleared' | 'reconciled' | 'ai_classified'>
→ Promise<Transaction>
```

### `updateTransaction(id, data)`
```typescript
id: string
data: Partial<Transaction>
→ Promise<Transaction>
```
Uses `UPDATE...MERGE` — only specified fields updated. Always sets `updated_at = time::now()`.

### `deleteTransaction(id)`
```typescript
id: string → Promise<void>
```

### `bulkCreateTransactions(transactions)`
```typescript
transactions: Omit<Transaction, 'id' | 'created_at' | 'updated_at' | 'imported' | 'cleared' | 'reconciled' | 'ai_classified'>[]
→ Promise<{ created: number; duplicates: number }>
```
Deduplicates by `date + amount + payee`. Sets `imported = true`.

### `findDuplicateTransactions(date, amount, payee?)`
```typescript
→ Promise<Transaction[]>
```

### `createImportBatch(name, count, source)`
```typescript
→ Promise<{ id: string }>
```

### `subscribeToTransactions(callback)`
```typescript
callback: (action: string, result: Transaction) => void
→ Promise<Uuid>  // Use to unsubscribe
```
SurrealDB LIVE query — real-time updates via WebSocket.

### `unsubscribeFromTransactions(queryUuid)`
```typescript
queryUuid: Uuid → Promise<void>
```

---

## Accounts

### `listAccounts()`
```typescript
→ Promise<Account[]>
```
Returns non-closed accounts ordered by `sort_order`.

### `createAccount(data)`
```typescript
data: Pick<Account, 'name' | 'type'> & Partial<Account>
→ Promise<Account>
```
Defaults: `balance=0`, `currency='EUR'`, `sort_order=0`.

### `updateAccount(id, data)`
```typescript
→ Promise<Account>
```

---

## Categories

### `listCategories()`
```typescript
→ Promise<Category[]>
```
All categories ordered by `sort_order`. Both L1 groups and L2 children returned flat — caller builds hierarchy.

### `createCategory(data)`
```typescript
data: Pick<Category, 'name'> & Partial<Category>
→ Promise<Category>
```

---

## Contracts

### `listContracts()`
```typescript
→ Promise<Contract[]>
```
Returns non-cancelled contracts. Includes computed fields `annual_cost` and `health`.

### `createContract(data)`
```typescript
data: Pick<Contract, 'name' | 'provider' | 'amount' | 'interval'> & Partial<Contract>
→ Promise<Contract>
```
Defaults: `type='subscription'`, `auto_renewal=true`.

### `updateContract(id, data)`
```typescript
→ Promise<Contract>
```

---

## Review Queue

### `listReviewItems(status?)`
```typescript
status?: string  // 'pending' | 'accepted' | 'dismissed' | 'snoozed'
→ Promise<ReviewItem[]>
```
Priority-sorted via CASE expression. Includes resolved transaction fields.

### `updateReviewItem(id, data)`
```typescript
→ Promise<ReviewItem>
```

### `acceptReviewItem(id)`
```typescript
→ Promise<void>
```
Applies `ai_suggestion.suggested_category` to the linked transaction, then marks item `'accepted'`.

### `dismissReviewItem(id)`
```typescript
→ Promise<void>
```

### `snoozeReviewItem(id)`
```typescript
→ Promise<void>
```

### `batchAcceptReviewItems(ids)`
```typescript
ids: string[] → Promise<number>  // Count accepted
```

---

## Dashboard

### `getDashboardPulse()`
```typescript
→ Promise<DashboardPulse>
// { total_balance, pending_reviews, active_contracts, upcoming_payments }
```
Single multi-statement SurrealQL query (4 statements in one round-trip).

### `getThisMonth()`
```typescript
→ Promise<ThisMonthSummary>
// { income, expenses, net, transaction_count }
```

### `getAvailableToSpend()`
```typescript
→ Promise<{ available: number; committed: number; balance: number }>
```
`available = total_balance - sum(active_contract_amounts)`

### `getBalanceProjection(days?)`
```typescript
days?: number  // Default: 30
→ Promise<{ date: string; balance: number }[]>
```
Projects balance using today's account balance + scheduled payments day by day.

---

## Schedules

### `listSchedules(opts?)`
```typescript
opts?: { activeOnly?: boolean }  // Default: true
→ Promise<Schedule[]>
```

### `createSchedule(data)`
```typescript
data: Pick<Schedule, 'name' | 'amount' | 'account' | 'frequency' | 'next_date'> & Partial<Schedule>
→ Promise<Schedule>
```

---

## Analytics

### `getSpendingByCategory(startDate, endDate)`
```typescript
→ Promise<CategorySpending[]>
// [{ category_id, category_name, parent_id, total, count, percentage }]
```
`percentage` computed in JS after aggregation.

### `getMonthlyOverview(months?)`
```typescript
months?: number  // Default: 6
→ Promise<MonthSummary[]>
// [{ month: '2026-02', income, expenses, net }]
```

### `getFixedVsVariable(months?)`
```typescript
months?: number  // Default: 6
→ Promise<FixedVarDetail[]>
// [{ month, fixed, variable }]
```
Fixed = transactions in categories linked to active contracts. Two SurrealQL statements in one query.

### `getSpendingTrends(months?, categoryIds?)`
```typescript
months?: number
categoryIds?: string[]
→ Promise<TrendPoint[]>
// [{ month, category_id, category_name, total }]
```

### `getTopMerchants(startDate, endDate, limit?)`
```typescript
limit?: number  // Default: 10
→ Promise<MerchantSpending[]>
// [{ payee_id, payee_name, total, count }]
```

### `getWhatChanged(currentMonth, previousMonth)`
```typescript
// months in format '2026-02'
→ Promise<MonthDelta[]>
// [{ category_name, current, previous, delta, delta_pct }]
```
Sorted by `|delta|` descending.

---

## Intelligence

### `listAnomalies(resolved?)`
```typescript
resolved?: boolean
→ Promise<Anomaly[]>
```

### `resolveAnomaly(id)`
```typescript
→ Promise<void>
```

### `listSpendingPatterns(dismissed?)`
```typescript
→ Promise<SpendingPattern[]>
```
Ordered by `confidence DESC`.

### `dismissSpendingPattern(id)`
```typescript
→ Promise<void>
```

### `requestExplanation(reviewItemId)`
```typescript
→ Promise<{ explanation: string }>
```
Creates a `job_queue` entry with `name='explain-classification'`. Returns placeholder immediately — worker fills `review_item.explanation` asynchronously.

---

## Budget

### `listBudgets(month)`
```typescript
month: string  // '2026-02'
→ Promise<Budget[]>
```

### `upsertBudget(category, month, amount, rollover?)`
```typescript
→ Promise<Budget>
```
Checks for existing budget (category + month) and updates if found, creates otherwise.

### `deleteBudget(id)`
```typescript
→ Promise<void>
```

### `getBudgetSummary(month)`
```typescript
→ Promise<BudgetSummary>
// { total_budgeted, total_spent, total_remaining, envelope_count }
```

---

## User Preferences

### `getUserPref(key)`
```typescript
key: string → Promise<string | null>
```

### `setUserPref(key, value)`
```typescript
key: string, value: string → Promise<void>
```
Upsert: tries UPDATE first, falls back to CREATE.

---

## Error Handling

All functions throw on SurrealDB error. Callers (React components via `useQuery`/`useMutation`) handle errors via TanStack Query's `isError` state. Connection errors surface via `ConnectionStatus` component in `App.tsx` (polls every 30s).

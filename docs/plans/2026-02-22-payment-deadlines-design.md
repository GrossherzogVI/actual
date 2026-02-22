# Payment Deadlines Design

## Overview

Three-tier deadline system for contract payments with German business day awareness, payment method integration, and configurable visibility.

## Three Deadline Dates

| Deadline | Meaning | Default Shift on Non-Workday |
|----------|---------|-----|
| **Action** | When you must initiate the transfer | Earlier (before weekend) |
| **Soft** | When payment is ideally due | Earlier (before weekend) |
| **Hard** | Last day before consequences (late fee, service cut) | Later (next business day) |

Computation order: `action = soft - leadTime`, `hard = soft + gracePeriod`.

## Data Model

### Contract table additions (migration)

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `payment_method` | TEXT | `'manual_sepa'` | `lastschrift`, `dauerauftrag`, `manual_sepa`, `international`, `other` |
| `grace_period_days` | INTEGER | `5` | Business days from soft to hard deadline |
| `soft_deadline_shift` | TEXT | `'before'` | `'before'` or `'after'` |
| `hard_deadline_shift` | TEXT | `'after'` | `'before'` or `'after'` |
| `lead_time_override` | INTEGER | NULL | Overrides payment method default lead time (business days) |
| `show_hard_deadline` | BOOLEAN | NULL | Per-contract override. NULL = use global default. |

### Payment method lead time defaults

| Method | Lead (business days) |
|--------|-----|
| `lastschrift` (direct debit) | 0 |
| `dauerauftrag` (standing order) | 1 |
| `manual_sepa` | 2 |
| `international` | 5 |
| `other` | 2 |

### Global user preferences

- `deadline_show_hard`: boolean (default `false`)
- `deadline_bundesland`: string (default `null` = federal holidays only)

## Shared Utility — `loot-core/src/shared/deadlines.ts`

Core functions (usable by both frontend and backend):

```
isBusinessDay(date, bundesland?) -> boolean
nextBusinessDay(date, 'before'|'after', bundesland?) -> Date
addBusinessDays(date, n, bundesland?) -> Date

computeDeadlines(config) -> { action: Date, soft: Date, hard: Date }
  config: {
    nominalDate, paymentMethod, leadTimeOverride?,
    gracePeriodDays, softShift, hardShift, bundesland?
  }
```

### Deadline computation logic

1. `soft = nextBusinessDay(nominalDate, softShift, bundesland)`
2. `hard = addBusinessDays(soft, gracePeriodDays, bundesland)` then `nextBusinessDay(hard, hardShift, bundesland)`
3. `leadTime = leadTimeOverride ?? METHOD_DEFAULTS[paymentMethod]`
   `action = addBusinessDays(soft, -leadTime, bundesland)` then `nextBusinessDay(action, 'before', bundesland)`

## Holiday Module — `loot-core/src/shared/german-holidays.ts`

- Fixed federal: Neujahr, Karfreitag, Ostermontag, Tag der Arbeit, Christi Himmelfahrt, Pfingstmontag, Tag der Deutschen Einheit, 1. Weihnachtstag, 2. Weihnachtstag
- Easter-based: computed by Gauss algorithm
- Per-Bundesland: Allerheiligen, Reformationstag, Fronleichnam, Maria Himmelfahrt, Weltkindertag, etc.
- `getHolidays(year, bundesland?) -> Set<string>` returns YYYY-MM-DD strings

## Backend

### Late detection job

Runs on server startup + daily interval:
1. For each active contract with a schedule, compute soft/hard deadlines
2. Check if deadline passed without matching transaction
3. Update `expected_events.status` to `'missed'`
4. Fire webhook: `deadline.soft_passed` or `deadline.hard_passed`

### Expected events enrichment

On contract create/update, write to `expected_events` with soft deadline date and amount. Status: `pending -> matched | missed`.

### Webhook events

Uses existing `ACTUAL_WEBHOOK_URL` + `ACTUAL_WEBHOOK_SECRET`:
- `deadline.action_due` — action deadline within 2 days
- `deadline.soft_passed` — soft deadline missed
- `deadline.hard_passed` — hard deadline missed
- Payload: `{ contractId, contractName, amount, softDate, hardDate, actionDate, type }`

### API endpoint

`GET /contracts/:id/deadlines` — returns computed deadlines for next N occurrences.

## Frontend

### Calendar

`CalendarEntry` extended with optional deadline fields:

```ts
softDeadline?: string;
hardDeadline?: string;
actionDeadline?: string;
deadlineStatus?: 'ok' | 'action_due' | 'soft_passed' | 'hard_passed';
```

Visual: blue (action due), yellow (soft), orange (between soft/hard), red (hard passed).

### Contract detail page

"Payment Deadlines" section:
- Next soft deadline with countdown
- Hard deadline (if visible) with countdown
- Action deadline ("initiate by...")
- Payment method badge, grace period info

### Contract form

New fields: payment method dropdown, grace period input, show hard deadline toggle, advanced section for shift/lead time overrides.

### Dashboard attention queue

Contracts with action deadline within 7 days appear in AttentionQueue. Priority: `action_due -> review`, `soft_passed/hard_passed -> urgent`.

### Settings

- Bundesland dropdown (16 states + "Federal only")
- "Show hard deadlines by default" toggle

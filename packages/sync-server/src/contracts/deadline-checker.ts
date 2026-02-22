// @ts-strict-ignore
/**
 * Deadline checker background job.
 *
 * Runs once on startup then every 6 hours. For each active contract that has
 * a start_date, computes the current period's deadlines and fires webhooks
 * when action/soft/hard thresholds are crossed.
 *
 * Webhook firing is idempotent: a `deadline_notifications` table records every
 * fired event so the same event is not re-sent across restarts.
 */

import { getAccountDb } from '../account-db.js';
import { dispatchWebhook } from '../webhook.js';
import {
  computeDeadlines,
  deadlineStatus,
  nextPaymentDates,
  type Bundesland,
  type DeadlineConfig,
  type PaymentMethod,
} from './deadlines.js';

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

/** Lazily create the notification log table if it doesn't exist yet. */
function ensureNotificationsTable(): void {
  const db = getAccountDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS deadline_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_id TEXT NOT NULL,
      nominal_date TEXT NOT NULL,
      event_type TEXT NOT NULL,
      fired_at TEXT DEFAULT (datetime('now')),
      UNIQUE (contract_id, nominal_date, event_type)
    );
  `);
}

/** Returns true if this event has already been fired. */
function alreadyFired(
  contractId: string,
  nominalDate: string,
  eventType: string,
): boolean {
  const db = getAccountDb();
  const row = db.first(
    `SELECT 1 FROM deadline_notifications
     WHERE contract_id = ? AND nominal_date = ? AND event_type = ?`,
    [contractId, nominalDate, eventType],
  );
  return !!row;
}

/** Record that this event has been fired. */
function markFired(
  contractId: string,
  nominalDate: string,
  eventType: string,
): void {
  const db = getAccountDb();
  db.mutate(
    `INSERT OR IGNORE INTO deadline_notifications
       (contract_id, nominal_date, event_type)
     VALUES (?, ?, ?)`,
    [contractId, nominalDate, eventType],
  );
}

/** Read the deadlineBundesland global pref (stored as JSON in server_global_prefs). */
function getBundesland(): Bundesland | null {
  try {
    const db = getAccountDb();
    const row = db.first(
      "SELECT value FROM server_global_prefs WHERE key = 'deadlineBundesland'",
    ) as { value: string } | undefined;
    if (row?.value) {
      return JSON.parse(row.value) as Bundesland;
    }
  } catch {
    // Table may not exist or value may be unset — ignore
  }
  return null;
}

function runCheck(): void {
  let db;
  try {
    db = getAccountDb();
  } catch {
    // DB not ready yet (e.g. server starting up before first request)
    return;
  }

  try {
    ensureNotificationsTable();
  } catch (err) {
    console.warn('[DeadlineChecker] Could not create notifications table:', (err as Error).message);
    return;
  }

  const bundesland = getBundesland();
  const today = new Date().toISOString().split('T')[0];

  let contracts: Record<string, unknown>[];
  try {
    contracts = db.all(
      `SELECT id, name, start_date, interval, custom_interval_days,
              payment_method, grace_period_days, soft_deadline_shift,
              hard_deadline_shift, lead_time_override
       FROM contracts
       WHERE tombstone = 0
         AND status IN ('active', 'expiring')
         AND start_date IS NOT NULL`,
      [],
    ) as Record<string, unknown>[];
  } catch (err) {
    console.warn('[DeadlineChecker] Could not query contracts:', (err as Error).message);
    return;
  }

  for (const contract of contracts) {
    const contractId = contract.id as string;
    const contractName = contract.name as string;

    // Get the single nearest upcoming (or current) payment date
    let dates: string[];
    try {
      dates = nextPaymentDates(
        contract.start_date as string,
        (contract.interval as string) ?? 'monthly',
        (contract.custom_interval_days as number | null) ?? null,
        2, // get 2 so we have at least one on-or-after today
      );
    } catch {
      continue;
    }

    if (dates.length === 0) continue;

    // Use the first date that is >= today's action date (i.e. within the active period)
    // We look at both dates returned to catch the case where the first is in the past
    for (const nominalDate of dates) {
      const paymentMethod: PaymentMethod =
        (contract.payment_method as PaymentMethod | null) ?? 'manual_sepa';
      const gracePeriodDays = (contract.grace_period_days as number | null) ?? 5;
      const softShift =
        (contract.soft_deadline_shift as DeadlineConfig['softShift'] | null) ?? 'before';
      const hardShift =
        (contract.hard_deadline_shift as DeadlineConfig['hardShift'] | null) ?? 'after';
      const leadTimeOverride =
        (contract.lead_time_override as number | null) ?? null;

      const config: DeadlineConfig = {
        nominalDate,
        paymentMethod,
        leadTimeOverride,
        gracePeriodDays,
        softShift,
        hardShift,
        bundesland,
      };

      let deadlines;
      try {
        deadlines = computeDeadlines(config);
      } catch {
        continue;
      }

      const status = deadlineStatus(deadlines, today);

      // Fire webhook for each crossed threshold that hasn't been fired yet
      const eventsToFire: Array<{ type: 'deadline.action_due' | 'deadline.soft_passed' | 'deadline.hard_passed' }> = [];

      if (
        (status === 'action_due' || status === 'soft_passed' || status === 'hard_passed') &&
        !alreadyFired(contractId, nominalDate, 'deadline.action_due')
      ) {
        eventsToFire.push({ type: 'deadline.action_due' });
      }

      if (
        (status === 'soft_passed' || status === 'hard_passed') &&
        !alreadyFired(contractId, nominalDate, 'deadline.soft_passed')
      ) {
        eventsToFire.push({ type: 'deadline.soft_passed' });
      }

      if (
        status === 'hard_passed' &&
        !alreadyFired(contractId, nominalDate, 'deadline.hard_passed')
      ) {
        eventsToFire.push({ type: 'deadline.hard_passed' });
      }

      for (const ev of eventsToFire) {
        try {
          dispatchWebhook({
            type: ev.type,
            fileId: null,
            timestamp: new Date().toISOString(),
            contractId,
            contractName,
            nominalDate,
            actionDate: deadlines.action,
            softDate: deadlines.soft,
            hardDate: deadlines.hard,
          });
          markFired(contractId, nominalDate, ev.type);
          console.log(
            `[DeadlineChecker] Fired ${ev.type} for contract "${contractName}" (${contractId}), nominal date ${nominalDate}`,
          );
        } catch (err) {
          console.warn(
            `[DeadlineChecker] Failed to dispatch ${ev.type} for ${contractId}:`,
            (err as Error).message,
          );
        }
      }
    }
  }
}

let checkerInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start the deadline checker background job.
 * Runs immediately then every 6 hours.
 * Safe to call multiple times — only one interval is active at a time.
 */
export function startDeadlineChecker(): void {
  if (checkerInterval !== null) return;

  // Initial check after a short delay to let DB settle after startup
  setTimeout(() => {
    try {
      runCheck();
    } catch (err) {
      console.warn('[DeadlineChecker] Initial check failed:', (err as Error).message);
    }
  }, 5000);

  checkerInterval = setInterval(() => {
    try {
      runCheck();
    } catch (err) {
      console.warn('[DeadlineChecker] Periodic check failed:', (err as Error).message);
    }
  }, SIX_HOURS_MS);

  console.log('[DeadlineChecker] Started (6-hour interval)');
}

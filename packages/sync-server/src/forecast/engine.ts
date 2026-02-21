import { getAccountDb } from '../account-db.js';

export type ForecastEvent = {
  date: string; // YYYY-MM-DD
  amount: number; // cents (positive = income, negative = expense)
  description: string;
  sourceType: 'schedule' | 'contract' | 'invoice';
  sourceId: string;
};

export type DailyBalance = {
  date: string;
  balance: number; // cents
  events: ForecastEvent[];
};

export type ForecastResult = {
  dailyCurve: DailyBalance[];
  worstPoint: { date: string; balance: number };
  safeToSpend: number; // cents — min balance above zero over next 30 days
  monthlyNetCashflow: { month: string; net: number }[];
};

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addFrequency(
  date: Date,
  frequency: string,
): Date {
  const next = new Date(date);
  switch (frequency) {
    case 'weekly':
      next.setDate(next.getDate() + 7);
      break;
    case 'monthly':
      next.setMonth(next.getMonth() + 1);
      break;
    case 'quarterly':
      next.setMonth(next.getMonth() + 3);
      break;
    case 'yearly':
      next.setFullYear(next.getFullYear() + 1);
      break;
    default:
      // Unknown frequency — treat as one-off
      return new Date(8640000000000000); // max date, won't recur
  }
  return next;
}

export function expandEvents(
  fileId: string,
  horizonDays: number,
): ForecastEvent[] {
  const db = getAccountDb();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + horizonDays);
  const horizonStr = formatDate(horizon);

  const events: ForecastEvent[] = [];

  // 1. Contracts: active contracts with next_payment_date and frequency
  const contracts = db.all(
    `SELECT id, name, amount, next_payment_date, frequency
     FROM contracts
     WHERE file_id = ? AND status = 'active' AND next_payment_date IS NOT NULL`,
    [fileId],
  );

  for (const c of contracts) {
    let current = new Date(c.next_payment_date + 'T00:00:00');
    while (formatDate(current) <= horizonStr) {
      const dateStr = formatDate(current);
      if (dateStr >= formatDate(today)) {
        events.push({
          date: dateStr,
          amount: c.amount,
          description: c.name,
          sourceType: 'contract',
          sourceId: String(c.id),
        });
      }
      current = addFrequency(current, c.frequency);
    }
  }

  // 2. Invoices: pending invoices with due_date
  const invoices = db.all(
    `SELECT i.id, i.amount, i.due_date, c.name as contract_name
     FROM invoices i
     LEFT JOIN contracts c ON i.contract_id = c.id
     WHERE i.file_id = ? AND i.status = 'pending' AND i.due_date IS NOT NULL`,
    [fileId],
  );

  for (const inv of invoices) {
    const dateStr = inv.due_date;
    if (dateStr >= formatDate(today) && dateStr <= horizonStr) {
      events.push({
        date: dateStr,
        amount: inv.amount,
        description: inv.contract_name || 'Invoice',
        sourceType: 'invoice',
        sourceId: String(inv.id),
      });
    }
  }

  // 3. Expected events table
  const expected = db.all(
    `SELECT id, expected_amount, expected_date, source_type, source_id
     FROM expected_events
     WHERE file_id = ? AND status = 'pending'`,
    [fileId],
  );

  for (const ev of expected) {
    const dateStr = ev.expected_date;
    if (dateStr >= formatDate(today) && dateStr <= horizonStr) {
      events.push({
        date: dateStr,
        amount: ev.expected_amount || 0,
        description: `Expected: ${ev.source_type}`,
        sourceType: ev.source_type || 'schedule',
        sourceId: String(ev.source_id || ev.id),
      });
    }
  }

  // Sort by date
  events.sort((a, b) => a.date.localeCompare(b.date));

  return events;
}

export function simulateForecast(
  startingBalance: number,
  events: ForecastEvent[],
  horizonDays: number,
): ForecastResult {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Build a map of date -> events for quick lookup
  const eventsByDate = new Map<string, ForecastEvent[]>();
  for (const ev of events) {
    const existing = eventsByDate.get(ev.date);
    if (existing) {
      existing.push(ev);
    } else {
      eventsByDate.set(ev.date, [ev]);
    }
  }

  const dailyCurve: DailyBalance[] = [];
  let balance = startingBalance;
  let worstPoint = { date: formatDate(today), balance };
  let minBalance30 = balance;

  // Monthly aggregation
  const monthlyMap = new Map<string, number>();

  for (let i = 0; i <= horizonDays; i++) {
    const current = new Date(today);
    current.setDate(current.getDate() + i);
    const dateStr = formatDate(current);
    const month = dateStr.slice(0, 7); // YYYY-MM

    const dayEvents = eventsByDate.get(dateStr) || [];
    let dayNet = 0;
    for (const ev of dayEvents) {
      dayNet += ev.amount;
    }

    balance += dayNet;

    dailyCurve.push({
      date: dateStr,
      balance,
      events: dayEvents,
    });

    if (balance < worstPoint.balance) {
      worstPoint = { date: dateStr, balance };
    }

    if (i <= 30) {
      minBalance30 = Math.min(minBalance30, balance);
    }

    // Accumulate monthly net
    monthlyMap.set(month, (monthlyMap.get(month) || 0) + dayNet);
  }

  const monthlyNetCashflow = Array.from(monthlyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, net]) => ({ month, net }));

  return {
    dailyCurve,
    worstPoint,
    safeToSpend: Math.max(0, minBalance30),
    monthlyNetCashflow,
  };
}

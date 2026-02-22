// @ts-strict-ignore
/**
 * ICS (iCalendar) export utility for payment calendar entries.
 * Generates a valid VCALENDAR / VEVENT file per RFC 5545.
 */

import type { CalendarEntry } from '../components/calendar/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Format amount in cents as EUR string (e.g. -4999 → "-49,99 EUR") */
function formatAmount(cents: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(
    cents / 100,
  );
}

/**
 * Format a YYYY-MM-DD string as an iCalendar DATE value (YYYYMMDD).
 * Using all-day events (DATE only, no time) keeps them compatible with all
 * calendar clients without timezone complications.
 */
function toIcsDate(dateStr: string): string {
  return dateStr.replace(/-/g, '');
}

/**
 * Escape special characters in iCalendar text values per RFC 5545 §3.3.11.
 * Backslash, semicolon, comma, and newline must be escaped.
 */
function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '');
}

/**
 * Fold long iCalendar lines to max 75 octets per RFC 5545 §3.1.
 * Continuation lines begin with a single SPACE.
 */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let pos = 0;
  while (pos < line.length) {
    if (pos === 0) {
      parts.push(line.slice(0, 75));
      pos = 75;
    } else {
      parts.push(' ' + line.slice(pos, pos + 74));
      pos += 74;
    }
  }
  return parts.join('\r\n');
}

/** Generate a deterministic UID for a calendar entry. */
function makeUid(entry: CalendarEntry): string {
  return `${entry.id}@actual-budget`;
}

// ─── Main export function ─────────────────────────────────────────────────────

/**
 * Generate an iCalendar (.ics) string from an array of CalendarEntry objects.
 *
 * Each entry becomes a VEVENT with:
 *   - SUMMARY: contract/schedule name
 *   - DESCRIPTION: amount + interval
 *   - DTSTART: payment date (all-day)
 *   - DTEND: day after payment date (required by RFC for all-day events)
 *   - UID: deterministic per entry
 *   - DTSTAMP: current timestamp
 */
export function generateICS(entries: CalendarEntry[]): string {
  const now = new Date();
  const dtstamp =
    now.getUTCFullYear().toString() +
    String(now.getUTCMonth() + 1).padStart(2, '0') +
    String(now.getUTCDate()).padStart(2, '0') +
    'T' +
    String(now.getUTCHours()).padStart(2, '0') +
    String(now.getUTCMinutes()).padStart(2, '0') +
    String(now.getUTCSeconds()).padStart(2, '0') +
    'Z';

  const vevents = entries.map(entry => {
    const dtstart = toIcsDate(entry.date);
    // DTEND for all-day events = next day
    const dtendDate = new Date(entry.date + 'T00:00:00');
    dtendDate.setDate(dtendDate.getDate() + 1);
    const dtend =
      dtendDate.getFullYear().toString() +
      String(dtendDate.getMonth() + 1).padStart(2, '0') +
      String(dtendDate.getDate()).padStart(2, '0');

    const amountStr = formatAmount(entry.amount);
    const intervalStr = entry.interval ? ` · ${entry.interval}` : '';
    const description = `${amountStr}${intervalStr}`;

    const lines = [
      'BEGIN:VEVENT',
      foldLine(`UID:${makeUid(entry)}`),
      foldLine(`DTSTAMP:${dtstamp}`),
      foldLine(`DTSTART;VALUE=DATE:${dtstart}`),
      foldLine(`DTEND;VALUE=DATE:${dtend}`),
      foldLine(`SUMMARY:${escapeIcsText(entry.name)}`),
      foldLine(`DESCRIPTION:${escapeIcsText(description)}`),
      'END:VEVENT',
    ];

    return lines.join('\r\n');
  });

  const calendar = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Actual Budget++//Payment Calendar//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Zahlungskalender',
    'X-WR-TIMEZONE:Europe/Berlin',
    ...vevents,
    'END:VCALENDAR',
  ].join('\r\n');

  return calendar;
}

/**
 * Trigger a browser download of the ICS file.
 * Creates a temporary Blob URL and clicks a hidden anchor element.
 */
export function downloadICS(entries: CalendarEntry[], filename = 'zahlungskalender.ics'): void {
  const content = generateICS(entries);
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();

  // Clean up
  setTimeout(() => {
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }, 1000);
}

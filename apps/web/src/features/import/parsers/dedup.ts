import type { Transaction } from '../../../core/types/finance';
import type { ParsedRow } from './types';

/**
 * Computes a simple similarity score between two strings (0–1).
 * Uses character overlap — good enough for payee name matching.
 */
function stringSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  if (la === lb) return 1;

  const longer = la.length > lb.length ? la : lb;
  const shorter = la.length > lb.length ? lb : la;

  let matches = 0;
  for (const ch of shorter) {
    if (longer.includes(ch)) matches++;
  }
  return matches / longer.length;
}

/**
 * Checks whether two ISO date strings are within `toleranceDays` of each other.
 */
function withinDays(dateA: string, dateB: string, toleranceDays: number): boolean {
  const a = new Date(dateA).getTime();
  const b = new Date(dateB).getTime();
  return Math.abs(a - b) <= toleranceDays * 24 * 60 * 60 * 1000;
}

/**
 * Finds potential duplicates between parsed import rows and existing transactions.
 *
 * Matching criteria:
 *   - Amount must match exactly
 *   - Date must be within ±1 day (bank posting vs. value date can differ)
 *   - If payee is present on both sides, similarity must be > 0.5
 *
 * Returns every parsed row annotated with an optional duplicate match.
 */
export function findPotentialDuplicates(
  rows: ParsedRow[],
  existingTransactions: Transaction[],
): { row: ParsedRow; duplicateOf?: Transaction }[] {
  return rows.map(row => {
    const duplicate = existingTransactions.find(txn => {
      // Amount must match exactly
      if (txn.amount !== row.amount) return false;

      // Date must be within 1 day
      if (!withinDays(row.date, txn.date, 1)) return false;

      // If both have a payee, they should be similar
      const txnPayee = txn.payee_name ?? '';
      if (row.payee && txnPayee) {
        const similarity = stringSimilarity(row.payee, txnPayee);
        if (similarity < 0.5) return false;
      }

      return true;
    });

    return { row, duplicateOf: duplicate };
  });
}

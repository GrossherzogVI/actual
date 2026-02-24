import { useMemo } from 'react';

import { useQuery } from '@tanstack/react-query';

import { getGermanHolidays } from './holidays';
import type { GermanState, Holiday } from './holidays';

async function fetchUserState(): Promise<GermanState | undefined> {
  const { connect } = await import('../../core/api/surreal-client');
  const db = await connect();
  const [rows] = await db.query<[{ value: string }[]]>(
    `SELECT value FROM user_pref WHERE key = 'german_state' LIMIT 1`,
  );
  const raw = rows?.[0]?.value;
  return raw as GermanState | undefined;
}

/**
 * Returns German public holidays for the given year and optional state.
 * If no state arg is provided, reads the user's preferred state from SurrealDB.
 */
export function useHolidays(year: number, state?: GermanState): Holiday[] {
  const { data: preferredState } = useQuery({
    queryKey: ['user-pref', 'german_state'],
    queryFn: fetchUserState,
    staleTime: 5 * 60 * 1000, // re-fetch at most every 5 min
    enabled: state === undefined,
  });

  const resolvedState = state ?? preferredState;

  return useMemo(
    () => getGermanHolidays(year, resolvedState),
    [year, resolvedState],
  );
}

/**
 * Returns a Map from date string (YYYY-MM-DD) to Holiday for fast lookup.
 */
export function useHolidayMap(year: number, state?: GermanState): Map<string, Holiday> {
  const holidays = useHolidays(year, state);
  return useMemo(
    () => new Map(holidays.map(h => [h.date, h])),
    [holidays],
  );
}

export type { GermanState, Holiday };

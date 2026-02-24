import { useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Flag, MapPin } from 'lucide-react';

import { connect } from '../../core/api/surreal-client';
import { getGermanHolidays } from './holidays';
import type { GermanState } from './holidays';
import { HolidayBadge } from './HolidayBadge';

// ── State data ─────────────────────────────────────────────────────────────

const GERMAN_STATES: { code: GermanState; name: string }[] = [
  { code: 'BW', name: 'Baden-Württemberg' },
  { code: 'BY', name: 'Bayern' },
  { code: 'BE', name: 'Berlin' },
  { code: 'BB', name: 'Brandenburg' },
  { code: 'HB', name: 'Bremen' },
  { code: 'HH', name: 'Hamburg' },
  { code: 'HE', name: 'Hessen' },
  { code: 'MV', name: 'Mecklenburg-Vorpommern' },
  { code: 'NI', name: 'Niedersachsen' },
  { code: 'NW', name: 'Nordrhein-Westfalen' },
  { code: 'RP', name: 'Rheinland-Pfalz' },
  { code: 'SL', name: 'Saarland' },
  { code: 'SN', name: 'Sachsen' },
  { code: 'ST', name: 'Sachsen-Anhalt' },
  { code: 'SH', name: 'Schleswig-Holstein' },
  { code: 'TH', name: 'Thüringen' },
];

// ── SurrealDB helpers ──────────────────────────────────────────────────────

async function loadUserState(): Promise<GermanState | undefined> {
  const db = await connect();
  const [rows] = await db.query<[{ value: string }[]]>(
    `SELECT value FROM user_pref WHERE key = 'german_state' LIMIT 1`,
  );
  return rows?.[0]?.value as GermanState | undefined;
}

async function saveUserState(state: GermanState): Promise<void> {
  const db = await connect();
  // Upsert pattern — create or update
  await db.query(
    `IF (SELECT id FROM user_pref WHERE key = 'german_state') THEN
       UPDATE user_pref SET value = $value WHERE key = 'german_state'
     ELSE
       CREATE user_pref SET key = 'german_state', value = $value
     END`,
    { value: state },
  );
}

// ── Upcoming holidays preview ──────────────────────────────────────────────

function UpcomingHolidays({ state }: { state: GermanState }) {
  const year = new Date().getFullYear();
  const today = new Date().toISOString().slice(0, 10);

  const holidays = getGermanHolidays(year, state)
    .filter(h => h.date >= today)
    .slice(0, 5);

  const nextYearHolidays =
    holidays.length < 5
      ? getGermanHolidays(year + 1, state)
          .filter(h => h.date >= today)
          .slice(0, 5 - holidays.length)
      : [];

  const upcoming = [...holidays, ...nextYearHolidays];

  if (upcoming.length === 0) {
    return (
      <p className="text-xs text-[var(--fo-muted)] mt-2">
        Keine weiteren Feiertage dieses Jahr.
      </p>
    );
  }

  const DATE_FMT = new Intl.DateTimeFormat('de-DE', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  return (
    <div className="mt-3 fo-stack" style={{ gap: 6 }}>
      <p className="text-xs font-medium text-[var(--fo-muted)] uppercase tracking-wide">
        Nächste Feiertage
      </p>
      {upcoming.map(h => (
        <div key={h.date} className="fo-row fo-space-between">
          <div className="fo-row">
            <HolidayBadge name={h.name} type={h.type} />
          </div>
          <span className="text-xs text-[var(--fo-muted)] tabular-nums">
            {DATE_FMT.format(new Date(h.date + 'T00:00:00'))}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

type HolidaySettingsProps = {
  /** If provided, use as controlled value (no SurrealDB query). */
  value?: GermanState;
  onChange?: (state: GermanState) => void;
  /** Show the upcoming holidays preview panel (default: true). */
  showPreview?: boolean;
};

export function HolidaySettings({
  value: controlledValue,
  onChange,
  showPreview = true,
}: HolidaySettingsProps) {
  const queryClient = useQueryClient();
  const [localState, setLocalState] = useState<GermanState | undefined>(
    controlledValue,
  );

  const { data: savedState } = useQuery({
    queryKey: ['user-pref', 'german_state'],
    queryFn: loadUserState,
    enabled: controlledValue === undefined,
  });

  const mutation = useMutation({
    mutationFn: saveUserState,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['user-pref', 'german_state'] });
    },
  });

  const currentState =
    controlledValue ?? localState ?? savedState;

  function handleChange(code: GermanState) {
    setLocalState(code);
    onChange?.(code);

    if (controlledValue === undefined) {
      mutation.mutate(code);
    }
  }

  return (
    <div className="fo-card" style={{ minWidth: 260 }}>
      {/* Header */}
      <div className="fo-row mb-3">
        <MapPin size={14} className="text-[var(--fo-muted)]" />
        <span className="text-sm font-medium text-[var(--fo-text)]">
          Bundesland
        </span>
        {mutation.isPending && (
          <span className="text-[10px] text-[var(--fo-muted)] ml-auto">
            Wird gespeichert…
          </span>
        )}
        {mutation.isSuccess && !mutation.isPending && (
          <span className="text-[10px] text-emerald-400 ml-auto">
            Gespeichert
          </span>
        )}
      </div>

      {/* State selector */}
      <div className="relative">
        <select
          className="w-full fo-input text-sm appearance-none pr-8 cursor-pointer"
          value={currentState ?? ''}
          onChange={e => {
            if (e.target.value) handleChange(e.target.value as GermanState);
          }}
          aria-label="Bundesland auswählen"
        >
          <option value="" disabled>
            Bundesland auswählen…
          </option>
          {GERMAN_STATES.map(s => (
            <option key={s.code} value={s.code}>
              {s.name} ({s.code})
            </option>
          ))}
        </select>
        <Flag
          size={13}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--fo-muted)] pointer-events-none"
        />
      </div>

      {/* Error message */}
      {mutation.isError && (
        <p className="text-xs text-red-400 mt-1.5">
          Fehler beim Speichern. Bitte erneut versuchen.
        </p>
      )}

      {/* Upcoming holidays preview */}
      {showPreview && currentState && (
        <UpcomingHolidays state={currentState} />
      )}

      {!currentState && showPreview && (
        <p className="text-xs text-[var(--fo-muted)] mt-3">
          Wähle ein Bundesland, um Feiertage im Kalender anzuzeigen.
        </p>
      )}
    </div>
  );
}

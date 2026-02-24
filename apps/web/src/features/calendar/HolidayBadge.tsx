import { Flag } from 'lucide-react';

import type { Holiday } from './holidays';

type HolidayBadgeProps = {
  name: string;
  type: Holiday['type'];
  /** If true, only shows the icon (for compact grid cells). */
  compact?: boolean;
};

/**
 * Small inline badge displayed next to calendar dates that are public holidays.
 * National holidays use an amber accent; state holidays use a slate accent.
 */
export function HolidayBadge({ name, type, compact = false }: HolidayBadgeProps) {
  const isNational = type === 'national';

  const colors = isNational
    ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
    : 'bg-slate-500/10 border-slate-500/30 text-slate-400';

  if (compact) {
    return (
      <span
        className={`inline-flex items-center justify-center w-4 h-4 rounded border ${colors}`}
        title={name}
        aria-label={name}
      >
        <Flag size={9} />
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium leading-none ${colors}`}
      title={isNational ? 'Bundesweiter Feiertag' : 'Regionaler Feiertag'}
    >
      <Flag size={9} />
      {name}
    </span>
  );
}

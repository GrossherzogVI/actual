const OPTIONS: { label: string; months: number }[] = [
  { label: '3M', months: 3 },
  { label: '6M', months: 6 },
  { label: '1J', months: 12 },
  { label: '2J', months: 24 },
];

type TimeRangeSelectorProps = {
  value: number;
  onChange: (months: number) => void;
};

export function TimeRangeSelector({ value, onChange }: TimeRangeSelectorProps) {
  return (
    <div className="fo-row">
      {OPTIONS.map(opt => {
        const isActive = value === opt.months;
        return (
          <button
            key={opt.months}
            type="button"
            className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
              isActive
                ? 'bg-[rgba(255,255,255,0.08)] text-[var(--fo-text)]'
                : 'text-[var(--fo-muted)] hover:text-[var(--fo-text)] hover:bg-[rgba(255,255,255,0.03)]'
            }`}
            onClick={() => onChange(opt.months)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

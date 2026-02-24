import { useState } from 'react';

import { Check } from 'lucide-react';

type CategoryColorPickerProps = {
  value?: string;
  onChange: (color: string) => void;
};

const PRESET_COLORS = [
  '#3b82f6', // Blue
  '#10b981', // Green
  '#ef4444', // Red
  '#f59e0b', // Amber
  '#8b5cf6', // Purple
  '#14b8a6', // Teal
  '#ec4899', // Pink
  '#f97316', // Orange
  '#6366f1', // Indigo
  '#06b6d4', // Cyan
  '#84cc16', // Lime
  '#a855f7', // Violet
  '#e11d48', // Rose
  '#0ea5e9', // Sky
  '#64748b', // Slate
  '#78716c', // Stone
] as const;

export function CategoryColorPicker({ value, onChange }: CategoryColorPickerProps) {
  const [customOpen, setCustomOpen] = useState(false);

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {/* Preset grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(8, 1fr)',
          gap: 6,
        }}
      >
        {PRESET_COLORS.map(color => {
          const isActive = value === color;
          return (
            <button
              key={color}
              type="button"
              aria-label={`Farbe ${color}`}
              onClick={() => onChange(color)}
              style={{
                width: 28,
                height: 28,
                borderRadius: 6,
                backgroundColor: color,
                border: isActive
                  ? '2px solid var(--fo-text)'
                  : '2px solid transparent',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'border-color 120ms ease, transform 120ms ease',
              }}
            >
              {isActive && <Check size={14} color="#fff" strokeWidth={3} />}
            </button>
          );
        })}
      </div>

      {/* Custom hex toggle */}
      <div className="fo-row" style={{ gap: 6 }}>
        <button
          type="button"
          className="text-xs text-[var(--fo-muted)] hover:text-[var(--fo-text)]"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          onClick={() => setCustomOpen(prev => !prev)}
        >
          {customOpen ? 'Weniger' : 'Eigene Farbe'}
        </button>

        {customOpen && (
          <div className="fo-row" style={{ gap: 6 }}>
            {value && (
              <span
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 4,
                  backgroundColor: value,
                  border: '1px solid var(--fo-border)',
                  flexShrink: 0,
                }}
              />
            )}
            <input
              type="text"
              className="fo-input"
              style={{ width: 100, padding: '4px 8px', fontSize: 12 }}
              placeholder="#3b82f6"
              value={value ?? ''}
              onChange={e => {
                const v = e.target.value;
                if (/^#[0-9a-fA-F]{0,6}$/.test(v)) {
                  onChange(v);
                }
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

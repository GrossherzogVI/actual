// @ts-strict-ignore
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Input } from '@actual-app/components/input';
import { theme } from '@actual-app/components/theme';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';

import type { Category, FrecencyEntry } from './types';

type CategorySelectProps = {
  value: string; // category name display string
  onChange: (categoryId: string, categoryName: string) => void;
  categories: Category[];
  frecency?: FrecencyEntry[];
};

// 6.9: Color map for German L1 category groups (by group name keyword)
// Maps a lowercase keyword found in the group name to a color dot
const GROUP_COLORS: Array<{ keywords: string[]; color: string }> = [
  { keywords: ['wohnen', 'miete', 'haus'], color: '#6366f1' },       // indigo — Housing
  { keywords: ['essen', 'lebensmittel', 'restaurant', 'food'], color: '#f59e0b' }, // amber — Food
  { keywords: ['transport', 'auto', 'fahrt', 'verkehr'], color: '#3b82f6' }, // blue — Transport
  { keywords: ['gesundheit', 'arzt', 'medizin'], color: '#10b981' },  // emerald — Health
  { keywords: ['freizeit', 'hobby', 'sport', 'unterhaltung'], color: '#ec4899' }, // pink — Leisure
  { keywords: ['kleidung', 'mode', 'bekleidung'], color: '#8b5cf6' }, // violet — Clothing
  { keywords: ['bildung', 'schule', 'kurs'], color: '#0ea5e9' },      // sky — Education
  { keywords: ['versicherung', 'vorsorge'], color: '#f97316' },       // orange — Insurance
  { keywords: ['einkommen', 'gehalt', 'lohn', 'einnahmen'], color: '#22c55e' }, // green — Income
  { keywords: ['sparen', 'investition', 'anlage'], color: '#14b8a6' }, // teal — Savings
  { keywords: ['haustier', 'tier'], color: '#a78bfa' },               // light violet — Pets
  { keywords: ['kind', 'kinder', 'familie'], color: '#fb7185' },      // rose — Family
];

const DEFAULT_COLOR = '#94a3b8'; // slate — fallback

export function getCategoryColor(groupName?: string): string {
  if (!groupName) return DEFAULT_COLOR;
  const lower = groupName.toLowerCase();
  for (const entry of GROUP_COLORS) {
    if (entry.keywords.some(kw => lower.includes(kw))) {
      return entry.color;
    }
  }
  return DEFAULT_COLOR;
}

function ColorDot({ color }: { color: string }) {
  return (
    <View
      style={{
        width: 8,
        height: 8,
        borderRadius: '50%',
        backgroundColor: color,
        flexShrink: 0,
        marginRight: 6,
      }}
    />
  );
}

function scoreCategory(cat: Category, frecency: FrecencyEntry[]): number {
  const entry = frecency.find(f => f.categoryId === cat.id);
  return entry ? entry.score : 0;
}

function fuzzyMatch(text: string, query: string): boolean {
  if (!query) return true;
  const t = text.toLowerCase();
  const q = query.toLowerCase();
  let ti = 0;
  for (let qi = 0; qi < q.length; qi++) {
    while (ti < t.length && t[ti] !== q[qi]) ti++;
    if (ti >= t.length) return false;
    ti++;
  }
  return true;
}

export function CategorySelect({ value, onChange, categories, frecency = [] }: CategorySelectProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const matches = categories.filter(cat => fuzzyMatch(cat.name, query));
    return matches.sort(
      (a, b) => scoreCategory(b, frecency) - scoreCategory(a, frecency),
    );
  }, [categories, query, frecency]);

  const handleSelect = useCallback(
    (cat: Category) => {
      setQuery(cat.name);
      setOpen(false);
      onChange(cat.id, cat.name);
    },
    [onChange],
  );

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setOpen(true);
  }, []);

  const handleFocus = useCallback(() => setOpen(true), []);

  const handleBlur = useCallback(() => {
    // Slight delay to allow click on item to register first
    setTimeout(() => setOpen(false), 150);
  }, []);

  // Find current category's color dot for the input
  const currentCat = categories.find(c => c.name === query || c.name === value);
  const currentColor = getCategoryColor(currentCat?.group_name);

  return (
    <View ref={containerRef} style={{ position: 'relative', flex: 1 }}>
      <View style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        {/* Color dot for selected category */}
        {currentCat && (
          <View
            style={{
              position: 'absolute',
              left: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 1,
              pointerEvents: 'none',
            }}
          >
            <ColorDot color={currentColor} />
          </View>
        )}
        <Input
          value={query}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={t('Category…')}
          style={{
            width: '100%',
            fontSize: 14,
            padding: currentCat ? '8px 12px 8px 26px' : '8px 12px',
            border: `1px solid ${theme.formInputBorder}`,
            borderRadius: 6,
            backgroundColor: theme.formInputBackground,
            color: theme.formInputText,
          }}
        />
      </View>
      {open && filtered.length > 0 && (
        <View
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 100,
            backgroundColor: theme.menuBackground,
            border: `1px solid ${theme.menuBorder}`,
            borderRadius: 6,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            maxHeight: 200,
            overflowY: 'auto',
          }}
        >
          {filtered.slice(0, 20).map(cat => {
            const color = getCategoryColor(cat.group_name);
            return (
              <View
                key={cat.id}
                role="option"
                onMouseDown={() => handleSelect(cat)}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  borderBottom: `1px solid ${theme.menuBorderHover}`,
                  flexDirection: 'row',
                  alignItems: 'center',
                }}
              >
                <ColorDot color={color} />
                <View style={{ flexDirection: 'column', flex: 1 }}>
                  {cat.group_name && (
                    <Text style={{ fontSize: 10, color: theme.pageTextSubdued, marginBottom: 1 }}>
                      {cat.group_name}
                    </Text>
                  )}
                  <Text style={{ fontSize: 13, color: theme.menuItemText }}>{cat.name}</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

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

  return (
    <View ref={containerRef} style={{ position: 'relative', flex: 1 }}>
      <Input
        value={query}
        onChange={handleInputChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={t('Category…')}
        style={{
          width: '100%',
          fontSize: 14,
          padding: '8px 12px',
          border: `1px solid ${theme.formInputBorder}`,
          borderRadius: 6,
          backgroundColor: theme.formInputBackground,
          color: theme.formInputText,
        }}
      />
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
          {filtered.slice(0, 20).map(cat => (
            <View
              key={cat.id}
              role="option"
              onMouseDown={() => handleSelect(cat)}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                borderBottom: `1px solid ${theme.menuBorderHover}`,
              }}
            >
              {cat.group_name && (
                <Text style={{ fontSize: 10, color: theme.pageTextSubdued, marginBottom: 1 }}>
                  {cat.group_name}
                </Text>
              )}
              <Text style={{ fontSize: 13, color: theme.menuItemText }}>{cat.name}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

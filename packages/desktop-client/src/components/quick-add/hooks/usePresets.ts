// @ts-strict-ignore
import { useMemo } from 'react';

import type { Category, Preset } from '@/components/quick-add/types';

const DEFAULT_PRESETS: Preset[] = [
  {
    id: 'supermarkt',
    label: 'Einkauf',
    icon: '🛒',
    amount: null,
    categoryId: null,
    categoryName: 'Supermarkt',
    payee: null,
    accountId: null,
    sortOrder: 0,
    isAuto: false,
  },
  {
    id: 'kaffee',
    label: 'Kaffee',
    icon: '☕',
    amount: 350,
    categoryId: null,
    categoryName: 'Kaffee',
    payee: null,
    accountId: null,
    sortOrder: 1,
    isAuto: false,
  },
  {
    id: 'oepnv',
    label: 'ÖPNV',
    icon: '🚌',
    amount: null,
    categoryId: null,
    categoryName: 'ÖPNV',
    payee: null,
    accountId: null,
    sortOrder: 2,
    isAuto: false,
  },
  {
    id: 'restaurant',
    label: 'Restaurant',
    icon: '🍽️',
    amount: null,
    categoryId: null,
    categoryName: 'Restaurant',
    payee: null,
    accountId: null,
    sortOrder: 3,
    isAuto: false,
  },
  {
    id: 'tanken',
    label: 'Tanken',
    icon: '⛽',
    amount: null,
    categoryId: null,
    categoryName: 'Tanken',
    payee: null,
    accountId: null,
    sortOrder: 4,
    isAuto: false,
  },
];

type UsePresetsReturn = {
  presets: Preset[];
};

export function usePresets(categories: Category[]): UsePresetsReturn {
  const presets = useMemo(() => {
    return DEFAULT_PRESETS.map(preset => {
      if (preset.categoryId || !preset.categoryName) return preset;

      // Resolve categoryId by matching categoryName against user's categories
      const match = categories.find(
        c => c.name.toLowerCase() === preset.categoryName!.toLowerCase(),
      );
      if (match) {
        return { ...preset, categoryId: match.id };
      }
      return preset;
    });
  }, [categories]);

  return { presets };
}

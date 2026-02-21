// @ts-strict-ignore
import { useCallback, useEffect, useState } from 'react';

import { send } from 'loot-core/platform/client/connection';

import type { Preset } from '../types';

const DEFAULT_PRESETS: Preset[] = [
  {
    id: 'groceries',
    label: 'Groceries',
    icon: '🛒',
    amount: null,
    categoryId: null,
    payee: null,
    accountId: null,
    sortOrder: 0,
    isAuto: false,
  },
  {
    id: 'coffee',
    label: 'Coffee',
    icon: '☕',
    amount: 350,
    categoryId: null,
    payee: null,
    accountId: null,
    sortOrder: 1,
    isAuto: false,
  },
  {
    id: 'transport',
    label: 'Transport',
    icon: '🚌',
    amount: null,
    categoryId: null,
    payee: null,
    accountId: null,
    sortOrder: 2,
    isAuto: false,
  },
];

type UsePresetsReturn = {
  presets: Preset[];
  loading: boolean;
  reload: () => Promise<void>;
};

export function usePresets(): UsePresetsReturn {
  const [presets, setPresets] = useState<Preset[]>(DEFAULT_PRESETS);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const result = await (send as Function)('quick-add-presets-list', {});
      if (result && !('error' in result) && Array.isArray(result) && result.length > 0) {
        setPresets(result as Preset[]);
      }
    } catch {
      // Handler not available — keep hardcoded defaults
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { presets, loading, reload };
}

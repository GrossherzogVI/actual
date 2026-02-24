// @ts-strict-ignore
import { useCallback, useEffect, useState } from 'react';

import { send } from 'loot-core/platform/client/connection';

import type { FrecencyEntry } from '@/components/quick-add/types';

type UseFrecencyReturn = {
  frecency: FrecencyEntry[];
  loading: boolean;
  reload: () => Promise<void>;
};

export function useFrecency(): UseFrecencyReturn {
  const [frecency, setFrecency] = useState<FrecencyEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const result = await send('quick-add-frecency-list');
      if (result && !('error' in result) && Array.isArray(result)) {
        // TODO: align loot-core/desktop-client FrecencyEntry types
        setFrecency(result as unknown as FrecencyEntry[]);
      }
    } catch {
      // Handler not available yet — fall back to empty list
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { frecency, loading, reload };
}

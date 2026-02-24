import { useCallback, useEffect, useRef, useState } from 'react';

type AsyncDataState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
};

/**
 * Generic hook for async data fetching with abort-on-unmount,
 * stale-while-revalidate, and error normalization.
 *
 * Replaces ad-hoc useState+useEffect+useCallback patterns across hooks.
 *
 * Usage:
 *   const { data, loading, error, reload } = useAsyncData(
 *     () => send('contract-list', { status: 'active' }),
 *     [status],
 *   );
 */
export function useAsyncData<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
): AsyncDataState<T> & { reload: () => void } {
  const [state, setState] = useState<AsyncDataState<T>>({
    data: null,
    loading: true,
    error: null,
  });

  const mountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(() => {
    // Cancel any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState(prev => ({ ...prev, loading: true, error: null }));

    fetcher(controller.signal)
      .then(data => {
        if (mountedRef.current && !controller.signal.aborted) {
          setState({ data, loading: false, error: null });
        }
      })
      .catch(err => {
        if (mountedRef.current && !controller.signal.aborted) {
          const message =
            err instanceof Error ? err.message : String(err ?? 'unknown-error');
          setState(prev => ({ ...prev, loading: false, error: message }));
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    mountedRef.current = true;
    load();
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, [load]);

  return { ...state, reload: load };
}

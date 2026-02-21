// @ts-strict-ignore
import { useCallback, useEffect, useState } from 'react';

import { send } from 'loot-core/platform/client/connection';

import type {
  ReviewCount,
  ReviewItem,
  TypeFilter,
  PriorityFilter,
} from '../types';

const PAGE_SIZE = 50;

type UseReviewQueueOptions = {
  typeFilter?: TypeFilter;
  priorityFilter?: PriorityFilter;
  autoLoad?: boolean;
};

type UseReviewQueueReturn = {
  items: ReviewItem[];
  counts: ReviewCount;
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  reload: () => Promise<void>;
  loadMore: () => Promise<void>;
};

const EMPTY_COUNTS: ReviewCount = {
  pending: 0,
  urgent: 0,
  review: 0,
  suggestion: 0,
};

export function useReviewQueue({
  typeFilter = 'all',
  priorityFilter = 'all',
  autoLoad = true,
}: UseReviewQueueOptions = {}): UseReviewQueueReturn {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [counts, setCounts] = useState<ReviewCount>(EMPTY_COUNTS);
  const [loading, setLoading] = useState(autoLoad);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const fetchCounts = useCallback(async () => {
    const result = await (send as Function)('review-count', {});
    if (result && !('error' in result)) {
      setCounts(result as ReviewCount);
    }
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    setOffset(0);

    const args: Record<string, unknown> = {
      limit: PAGE_SIZE,
      offset: 0,
    };
    if (typeFilter !== 'all') args.type = typeFilter;
    if (priorityFilter !== 'all') args.priority = priorityFilter;

    const [listResult] = await Promise.all([
      (send as Function)('review-list', args),
      fetchCounts(),
    ]);

    if (listResult && 'error' in listResult) {
      setError(listResult.error as string);
      setItems([]);
    } else {
      const fetched = (listResult as ReviewItem[]) ?? [];
      setItems(fetched);
      setHasMore(fetched.length === PAGE_SIZE);
      setOffset(fetched.length);
    }

    setLoading(false);
  }, [typeFilter, priorityFilter, fetchCounts]);

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);

    const args: Record<string, unknown> = {
      limit: PAGE_SIZE,
      offset,
    };
    if (typeFilter !== 'all') args.type = typeFilter;
    if (priorityFilter !== 'all') args.priority = priorityFilter;

    const result = await (send as Function)('review-list', args);

    if (result && !('error' in result)) {
      const fetched = (result as ReviewItem[]) ?? [];
      setItems(prev => [...prev, ...fetched]);
      setHasMore(fetched.length === PAGE_SIZE);
      setOffset(prev => prev + fetched.length);
    }

    setLoading(false);
  }, [loading, hasMore, offset, typeFilter, priorityFilter]);

  useEffect(() => {
    if (autoLoad) {
      void reload();
    }
  }, [autoLoad, reload]);

  return {
    items,
    counts,
    loading,
    error,
    hasMore,
    reload,
    loadMore,
  };
}

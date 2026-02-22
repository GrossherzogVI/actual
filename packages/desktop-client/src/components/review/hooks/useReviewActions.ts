// @ts-strict-ignore
import { useCallback, useState } from 'react';

import { send } from 'loot-core/platform/client/connection';

import type { ReviewItem, ReviewItemStatus } from '../types';

type UseReviewActionsOptions = {
  onSuccess?: () => void;
};

type UseReviewActionsReturn = {
  processing: Set<string>;
  accept: (id: string) => Promise<boolean>;
  reject: (id: string) => Promise<boolean>;
  snooze: (id: string) => Promise<boolean>;
  dismiss: (id: string) => Promise<boolean>;
  acceptHighConfidence: (items: ReviewItem[], threshold?: number) => Promise<number>;
  dismissAllSuggestions: (items: ReviewItem[]) => Promise<number>;
};

async function updateItem(id: string, status: ReviewItemStatus): Promise<boolean> {
  const result = await (send as Function)('review-update', { id, status });
  return result && !('error' in result);
}

export function useReviewActions({
  onSuccess,
}: UseReviewActionsOptions = {}): UseReviewActionsReturn {
  const [processing, setProcessing] = useState<Set<string>>(new Set());

  const withProcessing = useCallback(
    async (id: string, fn: () => Promise<boolean>): Promise<boolean> => {
      setProcessing(prev => new Set(prev).add(id));
      try {
        const ok = await fn();
        if (ok) onSuccess?.();
        return ok;
      } finally {
        setProcessing(prev => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [onSuccess],
  );

  const accept = useCallback(
    (id: string) =>
      withProcessing(id, async () => {
        const result = await (send as Function)('review-accept', { id });
        return result && !('error' in result);
      }),
    [withProcessing],
  );

  const reject = useCallback(
    (id: string, correctCategoryId?: string) =>
      withProcessing(id, async () => {
        const result = await (send as Function)('review-reject', {
          id,
          correct_category_id: correctCategoryId,
        });
        return result && !('error' in result);
      }),
    [withProcessing],
  );

  const snooze = useCallback(
    (id: string, days?: number) =>
      withProcessing(id, async () => {
        const result = await (send as Function)('review-snooze', {
          id,
          days: days ?? 7,
        });
        return result && !('error' in result);
      }),
    [withProcessing],
  );

  const dismiss = useCallback(
    (id: string) =>
      withProcessing(id, async () => {
        const result = await (send as Function)('review-dismiss', { id });
        return result && !('error' in result);
      }),
    [withProcessing],
  );

  const acceptHighConfidence = useCallback(
    async (_items: ReviewItem[], threshold = 0.9): Promise<number> => {
      const result = await (send as Function)('review-batch-accept', {
        minConfidence: threshold,
      });
      if (result && !('error' in result)) {
        onSuccess?.();
        return (result as { accepted: number }).accepted;
      }
      return 0;
    },
    [onSuccess],
  );

  const dismissAllSuggestions = useCallback(
    async (items: ReviewItem[]): Promise<number> => {
      const eligible = items.filter(
        item =>
          item.status === 'pending' && item.type === 'budget_suggestion',
      );
      if (eligible.length === 0) return 0;

      const ids = eligible.map(i => i.id);
      const result = await (send as Function)('review-batch', {
        ids,
        status: 'dismissed',
      });
      if (result && !('error' in result)) {
        onSuccess?.();
        return ids.length;
      }
      return 0;
    },
    [onSuccess],
  );

  return {
    processing,
    accept,
    reject,
    snooze,
    dismiss,
    acceptHighConfidence,
    dismissAllSuggestions,
  };
}

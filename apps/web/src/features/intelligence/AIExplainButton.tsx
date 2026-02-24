import { useState } from 'react';

import { useMutation } from '@tanstack/react-query';
import { Loader2, Sparkles } from 'lucide-react';

import { requestExplanation } from '../../core/api/finance-api';

export function AIExplainButton({
  reviewItemId,
  existingExplanation,
}: {
  reviewItemId: string;
  existingExplanation?: string;
}) {
  const [explanation, setExplanation] = useState<string | undefined>(
    existingExplanation,
  );

  const explainMutation = useMutation({
    mutationFn: () => requestExplanation(reviewItemId),
    onSuccess: (data) => {
      setExplanation(data.explanation);
    },
  });

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {!explanation && (
        <button
          type="button"
          className="fo-row rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
          style={{
            gap: 4,
            color: 'var(--fo-accent)',
            backgroundColor: 'rgba(139,92,246,0.08)',
            border: '1px solid rgba(139,92,246,0.15)',
          }}
          onClick={() => explainMutation.mutate()}
          disabled={explainMutation.isPending}
        >
          {explainMutation.isPending ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Sparkles size={12} />
          )}
          {explainMutation.isPending ? 'Wird erklaert...' : 'Warum?'}
        </button>
      )}

      {explanation && (
        <div
          className="rounded-md px-3 py-2 text-xs"
          style={{
            backgroundColor: 'rgba(139,92,246,0.06)',
            border: '1px solid rgba(139,92,246,0.12)',
            color: 'var(--fo-text)',
            lineHeight: 1.5,
          }}
        >
          <div
            className="fo-row text-[10px] font-medium mb-1"
            style={{ gap: 4, color: 'var(--fo-accent)' }}
          >
            <Sparkles size={10} />
            <span>KI-Erklaerung</span>
          </div>
          {explanation}
        </div>
      )}
    </div>
  );
}

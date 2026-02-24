import { useState } from 'react';

import { AlertTriangle, TrendingUp } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import { AnomalyCard } from './AnomalyCard';
import { SpendingPatternCard } from './SpendingPatternCard';
import { useAnomalies, useResolveAnomaly } from './useAnomalies';
import { useDismissPattern, useSpendingPatterns } from './useSpendingPatterns';

export function IntelligenceInsights({
  compact,
  maxItems = 3,
}: {
  compact?: boolean;
  maxItems?: number;
}) {
  const { data: anomalies = [], isLoading: anomaliesLoading } =
    useAnomalies(false);
  const { data: patterns = [], isLoading: patternsLoading } =
    useSpendingPatterns(false);

  const resolveMutation = useResolveAnomaly();
  const dismissMutation = useDismissPattern();

  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [dismissingId, setDismissingId] = useState<string | null>(null);

  function handleResolve(id: string) {
    setResolvingId(id);
    resolveMutation.mutate(id, {
      onSettled: () => setResolvingId(null),
    });
  }

  function handleDismiss(id: string) {
    setDismissingId(id);
    dismissMutation.mutate(id, {
      onSettled: () => setDismissingId(null),
    });
  }

  const isLoading = anomaliesLoading || patternsLoading;

  const displayedAnomalies = anomalies.slice(0, maxItems);
  const displayedPatterns = patterns.slice(0, maxItems);
  const hasMore =
    anomalies.length > maxItems || patterns.length > maxItems;

  if (isLoading) {
    return (
      <div className="fo-panel">
        <header className="fo-panel-header">
          <h2>Intelligenz</h2>
        </header>
        <div className="fo-stack">
          {Array.from({ length: 3 }, (_, i) => (
            <div
              key={i}
              className="h-20 rounded-md bg-[var(--fo-bg)] animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  const totalCount = anomalies.length + patterns.length;

  if (totalCount === 0) {
    return (
      <div className="fo-panel">
        <header className="fo-panel-header">
          <h2>Intelligenz</h2>
        </header>
        <div
          className="fo-card text-center"
          style={{ padding: compact ? '20px 16px' : '32px 16px' }}
        >
          <p className="text-sm text-[var(--fo-muted)]">
            Keine Auffaelligkeiten oder Muster erkannt.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fo-panel" style={{ display: 'grid', gap: compact ? 12 : 16 }}>
      {/* Header with counts */}
      <header className="fo-panel-header">
        <div className="fo-space-between">
          <h2>Intelligenz</h2>
          <span className="text-xs text-[var(--fo-muted)]">
            {anomalies.length > 0 &&
              `${anomalies.length} Auffaelligkeiten`}
            {anomalies.length > 0 && patterns.length > 0 && ', '}
            {patterns.length > 0 && `${patterns.length} Muster`}
          </span>
        </div>
      </header>

      {/* Anomalies section */}
      {displayedAnomalies.length > 0 && (
        <section style={{ display: 'grid', gap: compact ? 8 : 10 }}>
          <div
            className="fo-row text-xs font-medium"
            style={{ gap: 6, color: 'var(--fo-danger)' }}
          >
            <AlertTriangle size={13} />
            <span>Auffaelligkeiten</span>
          </div>
          <div className="fo-stack" style={{ gap: compact ? 6 : 8 }}>
            <AnimatePresence mode="popLayout">
              {displayedAnomalies.map((anomaly, i) => (
                <motion.div
                  key={anomaly.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8, height: 0 }}
                  transition={{ duration: 0.15, delay: i * 0.03 }}
                >
                  <AnomalyCard
                    anomaly={anomaly}
                    onResolve={handleResolve}
                    isResolving={resolvingId === anomaly.id}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          {anomalies.length > maxItems && (
            <button
              type="button"
              className="text-xs font-medium text-[var(--fo-accent)] hover:underline text-left"
              style={{ background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Alle {anomalies.length} anzeigen
            </button>
          )}
        </section>
      )}

      {/* Divider between sections */}
      {displayedAnomalies.length > 0 && displayedPatterns.length > 0 && (
        <div className="fo-muted-line" />
      )}

      {/* Patterns section */}
      {displayedPatterns.length > 0 && (
        <section style={{ display: 'grid', gap: compact ? 8 : 10 }}>
          <div
            className="fo-row text-xs font-medium"
            style={{ gap: 6, color: 'var(--fo-info)' }}
          >
            <TrendingUp size={13} />
            <span>Erkannte Muster</span>
          </div>
          <div className="fo-stack" style={{ gap: compact ? 6 : 8 }}>
            <AnimatePresence mode="popLayout">
              {displayedPatterns.map((pattern, i) => (
                <motion.div
                  key={pattern.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8, height: 0 }}
                  transition={{ duration: 0.15, delay: i * 0.03 }}
                >
                  <SpendingPatternCard
                    pattern={pattern}
                    onDismiss={handleDismiss}
                    isDismissing={dismissingId === pattern.id}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          {patterns.length > maxItems && (
            <button
              type="button"
              className="text-xs font-medium text-[var(--fo-accent)] hover:underline text-left"
              style={{ background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Alle {patterns.length} anzeigen
            </button>
          )}
        </section>
      )}
    </div>
  );
}

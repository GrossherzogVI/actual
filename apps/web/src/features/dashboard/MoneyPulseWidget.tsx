import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import { useMoneyPulse } from './useMoneyPulse';

export function MoneyPulseWidget() {
  const { lines, isDismissed, dismiss, isLoading, isError } = useMoneyPulse();

  if (isLoading) {
    return (
      <div className="h-12 rounded-md bg-[var(--fo-bg)] animate-pulse" />
    );
  }

  if (isError) {
    return null; // Connection banner handles global DB errors
  }

  return (
    <AnimatePresence>
      {!isDismissed && (
        <motion.div
          key="money-pulse-banner"
          className="fo-panel"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8, height: 0, marginBottom: 0 }}
          transition={{ duration: 0.25 }}
          style={{
            borderTop: '2px solid var(--fo-accent)',
          }}
        >
          <div className="fo-space-between">
            <div className="fo-row flex-wrap gap-y-1">
              {lines.map((line, i) => (
                <span key={i} className="text-sm text-[var(--fo-text)]">
                  {i > 0 && (
                    <span className="mx-3 text-[var(--fo-border)]" aria-hidden>
                      ·
                    </span>
                  )}
                  {line}
                </span>
              ))}
            </div>
            <button
              onClick={() => dismiss()}
              className="shrink-0 text-[var(--fo-muted)] hover:text-[var(--fo-text)] transition-colors p-1 rounded ml-4"
              aria-label="Tagesbrief schließen"
            >
              <X size={14} />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

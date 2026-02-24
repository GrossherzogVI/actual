import { useState } from 'react';

import { AlertTriangle, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import type { BudgetEnvelopeData } from '../../core/types/finance';

type BudgetAlertBannerProps = {
  envelopes: BudgetEnvelopeData[];
};

export function BudgetAlertBanner({ envelopes }: BudgetAlertBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  const overBudget = envelopes.filter(e => e.percentage >= 100);
  const nearLimit = envelopes.filter(
    e => e.percentage >= 85 && e.percentage < 100,
  );

  const hasAlerts = overBudget.length > 0 || nearLimit.length > 0;

  return (
    <AnimatePresence>
      {hasAlerts && !dismissed && (
        <motion.div
          initial={{ opacity: 0, y: -8, height: 0 }}
          animate={{ opacity: 1, y: 0, height: 'auto' }}
          exit={{ opacity: 0, y: -8, height: 0 }}
          transition={{ duration: 0.2 }}
          style={{ overflow: 'hidden' }}
        >
          <div style={{ display: 'grid', gap: 6 }}>
            {overBudget.length > 0 && (
              <AlertRow
                icon={<AlertTriangle size={14} />}
                message={
                  overBudget.length === 1
                    ? `"${overBudget[0].category_name}" ist überschritten!`
                    : `${overBudget.length} Budgets sind überschritten!`
                }
                color="#f87171"
                bg="rgba(239, 68, 68, 0.10)"
                border="rgba(239, 68, 68, 0.25)"
                onDismiss={() => setDismissed(true)}
              />
            )}
            {nearLimit.length > 0 && (
              <AlertRow
                icon={<AlertTriangle size={14} />}
                message={
                  nearLimit.length === 1
                    ? `"${nearLimit[0].category_name}" ist fast aufgebraucht`
                    : `${nearLimit.length} Budgets sind fast aufgebraucht`
                }
                color="#f97316"
                bg="rgba(249, 115, 22, 0.10)"
                border="rgba(249, 115, 22, 0.25)"
                onDismiss={overBudget.length === 0 ? () => setDismissed(true) : undefined}
              />
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function AlertRow({
  icon,
  message,
  color,
  bg,
  border,
  onDismiss,
}: {
  icon: React.ReactNode;
  message: string;
  color: string;
  bg: string;
  border: string;
  onDismiss?: () => void;
}) {
  return (
    <div
      className="fo-row fo-space-between"
      style={{
        padding: '10px 14px',
        borderRadius: 8,
        background: bg,
        border: `1px solid ${border}`,
        color,
        gap: 8,
      }}
    >
      <div className="fo-row" style={{ gap: 8 }}>
        {icon}
        <span className="text-sm font-medium">{message}</span>
      </div>
      {onDismiss && (
        <button
          type="button"
          aria-label="Hinweis schliessen"
          onClick={onDismiss}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color,
            opacity: 0.7,
            padding: 2,
            flexShrink: 0,
          }}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

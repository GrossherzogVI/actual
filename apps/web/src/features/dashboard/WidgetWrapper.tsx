import { X } from 'lucide-react';
import { motion } from 'motion/react';
import { type ReactNode } from 'react';

type WidgetWrapperProps = {
  title: string;
  subtitle?: string;
  isLoading?: boolean;
  onRemove?: () => void;
  children: ReactNode;
};

export function WidgetWrapper({
  title,
  subtitle,
  isLoading = false,
  onRemove,
  children,
}: WidgetWrapperProps) {
  return (
    <motion.section
      className="fo-panel"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <header className="fo-panel-header">
        <div className="fo-space-between">
          <div>
            <h2>{title}</h2>
            {subtitle && (
              <small className="text-[var(--fo-muted)]">{subtitle}</small>
            )}
          </div>
          {onRemove && (
            <button
              onClick={onRemove}
              className="text-[var(--fo-muted)] hover:text-[var(--fo-text)] transition-colors p-1 rounded"
              aria-label="Widget entfernen"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </header>

      {isLoading ? (
        <div className="fo-stack">
          <div className="h-8 rounded-md bg-[var(--fo-bg)] animate-pulse" />
          <div className="h-16 rounded-md bg-[var(--fo-bg)] animate-pulse" />
          <div className="h-8 rounded-md bg-[var(--fo-bg)] animate-pulse" />
        </div>
      ) : (
        children
      )}
    </motion.section>
  );
}

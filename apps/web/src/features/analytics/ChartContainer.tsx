import { type ReactNode } from 'react';

import { motion } from 'motion/react';

type ChartContainerProps = {
  title: string;
  isLoading: boolean;
  error?: Error | null;
  height?: number;
  children: ReactNode;
};

export function ChartContainer({
  title,
  isLoading,
  error,
  height = 400,
  children,
}: ChartContainerProps) {
  return (
    <motion.section
      className="fo-panel"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <header className="fo-panel-header">
        <h2>{title}</h2>
      </header>

      {isLoading ? (
        <div
          className="rounded-md bg-[var(--fo-bg)] animate-pulse"
          style={{ height }}
        />
      ) : error ? (
        <div
          className="flex items-center justify-center rounded-md"
          style={{
            height,
            backgroundColor: 'rgba(239,68,68,0.05)',
            border: '1px solid rgba(239,68,68,0.15)',
          }}
        >
          <p className="text-sm text-[var(--fo-danger)]">
            Fehler beim Laden: {error.message}
          </p>
        </div>
      ) : (
        children
      )}
    </motion.section>
  );
}

import { AlertCircle, Inbox, RefreshCw } from 'lucide-react';

type WidgetErrorProps = {
  message: string;
  onRetry?: () => void;
};

export function WidgetError({ message, onRetry }: WidgetErrorProps) {
  return (
    <div className="fo-card flex flex-col items-center gap-2 py-6 text-center">
      {onRetry ? (
        <AlertCircle size={20} className="text-red-400" />
      ) : (
        <Inbox size={20} className="text-[var(--fo-muted)]" />
      )}
      <p className="text-sm text-[var(--fo-muted)] m-0">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="fo-row gap-1.5 text-xs font-medium text-[var(--fo-accent)] hover:underline"
          style={{ background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <RefreshCw size={12} />
          Erneut versuchen
        </button>
      )}
    </div>
  );
}

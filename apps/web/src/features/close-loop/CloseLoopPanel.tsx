import { useMutation } from '@tanstack/react-query';

import { apiClient } from '../../core/api/client';

type CloseLoopPanelProps = {
  onStatus: (status: string) => void;
};

export function CloseLoopPanel({ onStatus }: CloseLoopPanelProps) {
  const weekly = useMutation({
    mutationFn: () => apiClient.runCloseRoutine('weekly'),
    onSuccess: result => onStatus(`Weekly close completed (${result.exceptionCount} exceptions).`),
  });

  const monthly = useMutation({
    mutationFn: () => apiClient.runCloseRoutine('monthly'),
    onSuccess: result => onStatus(`Monthly close completed (${result.exceptionCount} exceptions).`),
  });

  return (
    <section className="fo-panel">
      <header className="fo-panel-header">
        <h2>Close Loop</h2>
        <small>Exception-first weekly and monthly close routines.</small>
      </header>

      <div className="fo-row">
        <button className="fo-btn" onClick={() => weekly.mutate()} disabled={weekly.isPending}>
          Run weekly close
        </button>
        <button className="fo-btn-secondary" onClick={() => monthly.mutate()} disabled={monthly.isPending}>
          Run monthly close
        </button>
      </div>
    </section>
  );
}

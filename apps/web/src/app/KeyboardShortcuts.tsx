import { useEffect } from 'react';

type Loop = { id: string; route: string };

type Props = {
  loops: Loop[];
  onTogglePalette: () => void;
  onClosePalette: () => void;
  onRoute: (route: string) => void;
  onRunCommand: (commandId: string) => void;
};

export function KeyboardShortcuts({
  loops,
  onTogglePalette,
  onClosePalette,
  onRoute,
  onRunCommand,
}: Props) {
  // Cmd/Ctrl+K palette + Alt+[1-6] loop navigation + Escape
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        onTogglePalette();
        return;
      }
      if (event.altKey && /^[1-6]$/.test(event.key)) {
        const loop = loops[Number(event.key) - 1];
        if (loop) {
          event.preventDefault();
          onRoute(loop.route);
        }
        return;
      }
      if (event.key === 'Escape') {
        onClosePalette();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [loops, onTogglePalette, onClosePalette, onRoute]);

  // Alt+Shift+[B/F/R] anomaly shortcuts
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.altKey && event.shiftKey)) return;
      const key = event.key.toLowerCase();
      const commandId =
        key === 'b' ? 'open-latest-blocked-run'
        : key === 'f' ? 'open-latest-failed-run'
        : key === 'r' ? 'open-latest-rollback-eligible-run'
        : null;
      if (!commandId) return;
      event.preventDefault();
      onRunCommand(commandId);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onRunCommand]);

  return null;
}

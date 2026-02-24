import { useEffect } from 'react';

type Props = {
  onTogglePalette: () => void;
  onClosePalette: () => void;
  onToggleQuickAdd?: () => void;
};

export function KeyboardShortcuts({
  onTogglePalette,
  onClosePalette,
  onToggleQuickAdd,
}: Props) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        onTogglePalette();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        onToggleQuickAdd?.();
        return;
      }
      if (event.key === 'Escape') {
        onClosePalette();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onTogglePalette, onClosePalette, onToggleQuickAdd]);

  return null;
}

import { commandCenterTokens, CommandPaletteAdvanced } from '@finance-os/design-system';
import { AnimatePresence, motion } from 'motion/react';

type Entry = { id: string; label: string; hint?: string };

type Props = {
  open: boolean;
  entries: Entry[];
  onClose: () => void;
  onSelect: (entry: Entry) => void;
};

export function CommandPalette({ open, entries, onClose, onSelect }: Props) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fo-palette-overlay"
          role="presentation"
          aria-hidden="true"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
        >
          <motion.div
            className="fo-palette"
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            initial={{ scale: 0.95, opacity: 0, y: -20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: -20 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            style={{ borderColor: commandCenterTokens.color.border }}
            onClick={event => event.stopPropagation()}
          >
            <CommandPaletteAdvanced entries={entries} onSelect={onSelect} />
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

import { motion } from 'motion/react';

type Props = {
  current: number;
  total: number;
  duplicates: number;
};

export function ImportProgressBar({ current, total, duplicates }: Props) {
  const percentage = total > 0 ? Math.min(1, current / total) : 0;
  const imported = current - duplicates;

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {/* Bar */}
      <div
        style={{
          position: 'relative',
          height: 8,
          borderRadius: 999,
          backgroundColor: 'var(--fo-bg)',
          overflow: 'hidden',
        }}
      >
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percentage * 100}%` }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 999,
            backgroundColor: 'var(--fo-accent)',
          }}
        />
      </div>

      {/* Labels */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 12,
        }}
      >
        <span style={{ color: 'var(--fo-text)' }}>
          <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{current}</strong>
          {' von '}
          <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{total}</strong>
          {' Transaktionen verarbeitet'}
        </span>

        {duplicates > 0 && (
          <span style={{ color: 'var(--fo-muted)', fontSize: 11 }}>
            {duplicates} Duplikat{duplicates !== 1 ? 'e' : ''} übersprungen
          </span>
        )}
      </div>

      {/* Sub-stats */}
      <div
        className="fo-row"
        style={{ gap: 16, fontSize: 11, color: 'var(--fo-muted)' }}
      >
        <span>
          <span style={{ color: 'var(--fo-ok)', fontWeight: 600 }}>{imported}</span> importiert
        </span>
        <span>
          <span style={{ color: 'var(--fo-muted)', fontWeight: 600 }}>{duplicates}</span>{' '}
          übersprungen
        </span>
        <span>
          <span style={{ fontWeight: 600 }}>{Math.round(percentage * 100)}</span> %
        </span>
      </div>
    </div>
  );
}

import { CheckCircle, RefreshCw, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';

type Props = {
  created: number;
  duplicates: number;
  onReset: () => void;
};

export function ImportSummaryCard({ created, duplicates, onReset }: Props) {
  // AI categorisation count: all newly created transactions go to the review queue
  const aiCount = created;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, type: 'spring', stiffness: 200, damping: 20 }}
      className="fo-card"
      style={{ padding: '28px 24px', display: 'grid', gap: 20, textAlign: 'center' }}
    >
      {/* Success icon */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.15, duration: 0.4, type: 'spring', stiffness: 260, damping: 20 }}
        style={{ display: 'flex', justifyContent: 'center' }}
      >
        <CheckCircle size={40} style={{ color: 'var(--fo-ok)' }} />
      </motion.div>

      {/* Title */}
      <div>
        <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--fo-text)', margin: 0 }}>
          Import abgeschlossen
        </h3>
        <p style={{ fontSize: 13, color: 'var(--fo-muted)', marginTop: 4 }}>
          Deine Transaktionen wurden erfolgreich importiert.
        </p>
      </div>

      {/* Stats */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 12,
        }}
      >
        <StatCell
          value={created}
          label="Importiert"
          color="var(--fo-ok)"
          delay={0.2}
        />
        <StatCell
          value={duplicates}
          label="Übersprungen"
          color="var(--fo-muted)"
          delay={0.25}
        />
        <StatCell
          value={aiCount}
          label="KI-Analyse"
          color="var(--fo-accent)"
          delay={0.3}
          icon={<Sparkles size={12} />}
        />
      </div>

      {/* AI note */}
      {aiCount > 0 && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.2 }}
          style={{
            fontSize: 12,
            color: 'var(--fo-muted)',
            padding: '8px 12px',
            borderRadius: 6,
            backgroundColor: 'rgba(99,102,241,0.06)',
            border: '1px solid rgba(99,102,241,0.15)',
          }}
        >
          {aiCount} Transaktion{aiCount !== 1 ? 'en werden' : ' wird'} von der KI kategorisiert
          und in der Prüfwarteschlange angezeigt.
        </motion.p>
      )}

      {/* Reset button */}
      <button
        type="button"
        className="fo-btn fo-row"
        onClick={onReset}
        style={{
          justifyContent: 'center',
          gap: 6,
          padding: '8px 16px',
          fontSize: 13,
        }}
      >
        <RefreshCw size={14} />
        Erneut importieren
      </button>
    </motion.div>
  );
}

function StatCell({
  value,
  label,
  color,
  delay,
  icon,
}: {
  value: number;
  label: string;
  color: string;
  delay: number;
  icon?: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.2 }}
      style={{
        display: 'grid',
        gap: 4,
        padding: '12px 8px',
        borderRadius: 8,
        backgroundColor: 'var(--fo-bg)',
      }}
    >
      <span
        style={{
          fontSize: 22,
          fontWeight: 700,
          color,
          fontVariantNumeric: 'tabular-nums',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
        }}
      >
        {icon}
        {value}
      </span>
      <span style={{ fontSize: 11, color: 'var(--fo-muted)' }}>{label}</span>
    </motion.div>
  );
}

function getConfig(confidence: number): {
  label: string;
  color: string;
  bg: string;
} {
  if (confidence >= 0.85) {
    return { label: 'Hoch', color: '#34d399', bg: 'rgba(52,211,153,0.12)' };
  }
  if (confidence >= 0.6) {
    return { label: 'Mittel', color: '#eab308', bg: 'rgba(234,179,8,0.12)' };
  }
  return { label: 'Niedrig', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' };
}

export function ConfidenceBadge({
  confidence,
  showPercentage,
}: {
  confidence: number;
  showPercentage?: boolean;
}) {
  const { label, color, bg } = getConfig(confidence);
  const pct = Math.round(confidence * 100);

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
      style={{ color, backgroundColor: bg }}
    >
      {label}
      {showPercentage && ` ${pct}%`}
    </span>
  );
}

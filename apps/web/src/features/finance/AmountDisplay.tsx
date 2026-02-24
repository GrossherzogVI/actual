type AmountDisplayProps = {
  amount: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

const sizeClasses = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-lg font-semibold',
} as const;

export function AmountDisplay({
  amount,
  size = 'md',
  className = '',
}: AmountDisplayProps) {
  const formatted = new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(amount);

  const color = amount < 0 ? 'text-red-400' : amount > 0 ? 'text-emerald-400' : 'text-[var(--fo-muted)]';

  return (
    <span
      className={`tabular-nums ${sizeClasses[size]} ${color} ${className}`}
      style={{ fontVariantNumeric: 'tabular-nums' }}
    >
      {formatted}
    </span>
  );
}

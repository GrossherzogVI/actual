import { getProgressColor } from './budget-utils';

type BudgetProgressRingProps = {
  percentage: number;
  size?: number;
};

// SVG ring with viewBox="0 0 36 36", circle r=15.915
// Circumference = 2 * π * 15.915 ≈ 100
const RADIUS = 15.915;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS; // ~100

export function BudgetProgressRing({
  percentage,
  size = 60,
}: BudgetProgressRingProps) {
  const clamped = Math.min(percentage, 100);
  const dashOffset = CIRCUMFERENCE - (clamped / 100) * CIRCUMFERENCE;
  const color = getProgressColor(percentage);
  const displayText =
    percentage >= 1000
      ? '>999%'
      : percentage >= 100
        ? `${Math.round(percentage)}%`
        : `${Math.round(percentage)}%`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      aria-label={`${Math.round(percentage)}% verwendet`}
    >
      {/* Track */}
      <circle
        cx="18"
        cy="18"
        r={RADIUS}
        fill="none"
        stroke="rgba(255,255,255,0.06)"
        strokeWidth="2.5"
      />
      {/* Progress arc */}
      <circle
        cx="18"
        cy="18"
        r={RADIUS}
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        transform="rotate(-90 18 18)"
        style={{
          transition: 'stroke-dashoffset 0.5s ease, stroke 0.3s ease',
        }}
      />
      {/* Centre label */}
      <text
        x="18"
        y="18"
        dominantBaseline="middle"
        textAnchor="middle"
        fill={color}
        fontSize={percentage >= 100 ? '5' : '6'}
        fontWeight="600"
        fontFamily="inherit"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {displayText}
      </text>
    </svg>
  );
}

import type { CSSProperties, ReactNode } from 'react';

import { commandCenterTokens } from '../tokens/command-center';
import { semanticTokens, type StatusTone } from '../tokens/semantic';
import { typographyTokens } from '../tokens/typography';

type Size = 'xs' | 'sm' | 'md' | 'lg';
type Density = 'compact' | 'comfortable';

type TimelineItemProps = {
  title: ReactNode;
  timestamp?: string;
  description?: ReactNode;
  tone?: StatusTone;
  size?: Size;
  density?: Density;
  isLast?: boolean;
  className?: string;
  style?: CSSProperties;
};

const dotSizeBySize: Record<Size, number> = { xs: 6, sm: 8, md: 10, lg: 12 };
const gapByDensity: Record<Density, number> = { compact: 8, comfortable: 12 };

export function TimelineItem({
  title,
  timestamp,
  description,
  tone = 'neutral',
  size = 'sm',
  density = 'comfortable',
  isLast = false,
  className,
  style,
}: TimelineItemProps) {
  const dotSize = dotSizeBySize[size];
  const gap = gapByDensity[density];
  const colors = semanticTokens.status[tone];

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        gap,
        ...style,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            width: dotSize,
            height: dotSize,
            borderRadius: '50%',
            background: colors.text,
            flexShrink: 0,
          }}
        />
        {!isLast ? (
          <span
            style={{
              flex: 1,
              width: 1,
              background: commandCenterTokens.color.border,
              marginTop: 4,
            }}
          />
        ) : null}
      </div>
      <div
        style={{
          flex: 1,
          paddingBottom: isLast ? 0 : gap,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            gap: 8,
          }}
        >
          <span
            style={{
              fontSize: typographyTokens.size.base,
              fontFamily: typographyTokens.family.ui,
              color: commandCenterTokens.color.text,
              fontWeight: typographyTokens.weight.medium,
            }}
          >
            {title}
          </span>
          {timestamp ? (
            <span
              style={{
                fontSize: typographyTokens.size.xs,
                fontFamily: typographyTokens.family.mono,
                color: commandCenterTokens.color.textMuted,
                flexShrink: 0,
              }}
            >
              {timestamp}
            </span>
          ) : null}
        </div>
        {description ? (
          <span
            style={{
              fontSize: typographyTokens.size.sm,
              fontFamily: typographyTokens.family.dense,
              color: commandCenterTokens.color.textMuted,
            }}
          >
            {description}
          </span>
        ) : null}
      </div>
    </div>
  );
}

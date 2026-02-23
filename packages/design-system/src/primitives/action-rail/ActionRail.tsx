import type { ReactNode } from 'react';

import { commandCenterTokens } from '../../tokens/command-center';

type ActionRailProps = {
  title: string;
  subtitle?: string;
  actions: ReactNode;
};

export function ActionRail({ title, subtitle, actions }: ActionRailProps) {
  return (
    <section
      style={{
        border: `1px solid ${commandCenterTokens.color.border}`,
        borderRadius: commandCenterTokens.radius.md,
        background: commandCenterTokens.color.panel,
        color: commandCenterTokens.color.text,
        padding: commandCenterTokens.space.md,
        display: 'grid',
        gap: commandCenterTokens.space.sm,
      }}
    >
      <header style={{ display: 'grid', gap: 4 }}>
        <h3
          style={{
            margin: 0,
            fontFamily: commandCenterTokens.font.ui,
            fontSize: 15,
            fontWeight: 650,
          }}
        >
          {title}
        </h3>
        {subtitle ? (
          <p
            style={{
              margin: 0,
              fontFamily: commandCenterTokens.font.dense,
              fontSize: 12,
              color: commandCenterTokens.color.textMuted,
            }}
          >
            {subtitle}
          </p>
        ) : null}
      </header>
      <div style={{ display: 'grid', gap: commandCenterTokens.space.xs }}>
        {actions}
      </div>
    </section>
  );
}

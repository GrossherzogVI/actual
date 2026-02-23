import type { ReactNode } from 'react';

import { commandCenterTokens } from '../../tokens/command-center';

type TriageLaneItem = {
  id: string;
  title: string;
  meta: string;
  severity: 'low' | 'medium' | 'high';
  action: ReactNode;
};

type TriageLaneProps = {
  title: string;
  items: TriageLaneItem[];
};

function severityColor(severity: TriageLaneItem['severity']): string {
  switch (severity) {
    case 'high':
      return commandCenterTokens.color.urgency;
    case 'medium':
      return commandCenterTokens.color.accent;
    default:
      return commandCenterTokens.color.confidence;
  }
}

export function TriageLane({ title, items }: TriageLaneProps) {
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
      <div style={{ display: 'grid', gap: commandCenterTokens.space.xs }}>
        {items.map(item => (
          <article
            key={item.id}
            style={{
              display: 'grid',
              gap: 6,
              padding: commandCenterTokens.space.sm,
              borderRadius: commandCenterTokens.radius.sm,
              border: `1px solid ${commandCenterTokens.color.border}`,
              background: commandCenterTokens.color.panelElevated,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: severityColor(item.severity),
                  flexShrink: 0,
                }}
              />
              <strong style={{ fontFamily: commandCenterTokens.font.dense, fontSize: 13 }}>
                {item.title}
              </strong>
            </div>
            <span
              style={{
                fontFamily: commandCenterTokens.font.mono,
                fontSize: 11,
                color: commandCenterTokens.color.textMuted,
              }}
            >
              {item.meta}
            </span>
            <div>{item.action}</div>
          </article>
        ))}
      </div>
    </section>
  );
}

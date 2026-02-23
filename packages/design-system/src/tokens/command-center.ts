export const commandCenterTokens = {
  font: {
    ui: '"Public Sans", "Inter", sans-serif',
    dense: '"IBM Plex Sans", "Inter", sans-serif',
    mono: '"JetBrains Mono", "SFMono-Regular", Menlo, monospace',
  },
  color: {
    canvas: '#0f1722',
    panel: '#152131',
    panelElevated: '#1b2d44',
    border: '#284261',
    text: '#d6e2f0',
    textMuted: '#8ea6c2',
    urgency: '#ef4444',
    opportunity: '#10b981',
    confidence: '#60a5fa',
    accent: '#f59e0b',
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
  },
  space: {
    xs: 6,
    sm: 10,
    md: 14,
    lg: 18,
    xl: 24,
  },
} as const;

export type CommandCenterTokens = typeof commandCenterTokens;

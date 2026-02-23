export const commandCenterTokens = {
  font: {
    ui: '"Inter", "Geist", "Public Sans", sans-serif',
    dense: '"IBM Plex Sans", "Inter", sans-serif',
    mono: '"JetBrains Mono", "SFMono-Regular", Menlo, monospace',
  },
  color: {
    canvas: '#030508',
    panel: 'rgba(18, 25, 38, 0.4)',
    panelElevated: 'rgba(25, 36, 54, 0.65)',
    border: 'rgba(255, 255, 255, 0.08)',
    text: '#F8FAFC',
    textMuted: '#94A3B8',
    urgency: '#EF4444',
    opportunity: '#10B981',
    confidence: '#3B82F6',
    accent: '#FBBF24',
  },
  radius: {
    sm: 6,
    md: 10,
    lg: 14,
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

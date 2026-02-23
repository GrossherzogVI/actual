export const semanticTokens = {
  urgency: {
    base: '#EF4444',
    muted: 'rgba(239, 68, 68, 0.15)',
    border: 'rgba(239, 68, 68, 0.4)',
    text: '#FCA5A5',
  },
  opportunity: {
    base: '#10B981',
    muted: 'rgba(16, 185, 129, 0.15)',
    border: 'rgba(16, 185, 129, 0.4)',
    text: '#6EE7B7',
  },
  confidence: {
    base: '#3B82F6',
    muted: 'rgba(59, 130, 246, 0.15)',
    border: 'rgba(59, 130, 246, 0.4)',
    text: '#93C5FD',
  },
  status: {
    neutral: {
      bg: 'rgba(148, 163, 184, 0.12)',
      text: '#94A3B8',
      border: 'rgba(148, 163, 184, 0.3)',
    },
    info: {
      bg: 'rgba(59, 130, 246, 0.12)',
      text: '#93C5FD',
      border: 'rgba(59, 130, 246, 0.3)',
    },
    warn: {
      bg: 'rgba(251, 191, 36, 0.12)',
      text: '#FDE68A',
      border: 'rgba(251, 191, 36, 0.3)',
    },
    danger: {
      bg: 'rgba(239, 68, 68, 0.12)',
      text: '#FCA5A5',
      border: 'rgba(239, 68, 68, 0.3)',
    },
    success: {
      bg: 'rgba(16, 185, 129, 0.12)',
      text: '#6EE7B7',
      border: 'rgba(16, 185, 129, 0.3)',
    },
  },
} as const;

export type SemanticTokens = typeof semanticTokens;
export type StatusTone = keyof typeof semanticTokens.status;

export const typographyTokens = {
  family: {
    ui: '"Inter", "Public Sans", sans-serif',
    dense: '"IBM Plex Sans", "Inter", sans-serif',
    mono: '"JetBrains Mono", "SFMono-Regular", Menlo, monospace',
  },
  size: {
    xs: 11,
    sm: 12,
    base: 14,
    lg: 16,
    xl: 20,
    '2xl': 24,
  },
  lineHeight: {
    xs: 16,
    sm: 18,
    base: 20,
    lg: 24,
    xl: 28,
    '2xl': 32,
  },
  weight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  letterSpacing: {
    tight: '-0.02em',
    normal: '0em',
    wide: '0.04em',
    wider: '0.08em',
  },
} as const;

export type TypographyTokens = typeof typographyTokens;
export type TypeSize = keyof typeof typographyTokens.size;
export type TypeFamily = keyof typeof typographyTokens.family;

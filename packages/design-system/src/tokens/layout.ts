export const layoutTokens = {
  zone: {
    left: 300,
    center: 'flex' as const,
    right: 360,
  },
  spacing: {
    1: 4,
    2: 8,
    3: 12,
    4: 16,
    6: 24,
    8: 32,
    12: 48,
    16: 64,
  },
  panel: {
    headerHeight: 48,
    footerHeight: 40,
    sidebarCollapsedWidth: 48,
    contentPaddingX: 16,
    contentPaddingY: 12,
  },
  grid: {
    columns: 12,
    gutter: 16,
    margin: 24,
  },
} as const;

export type LayoutTokens = typeof layoutTokens;
export type SpacingKey = keyof typeof layoutTokens.spacing;

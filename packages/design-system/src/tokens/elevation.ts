export const elevationTokens = {
  zIndex: {
    base: 0,
    panel: 10,
    overlay: 20,
    commandPalette: 30,
    modal: 40,
    toast: 50,
  },
  shadow: {
    base: 'none',
    panel: '0 2px 8px rgba(0, 0, 0, 0.4)',
    overlay: '0 8px 24px rgba(0, 0, 0, 0.6)',
    commandPalette: '0 16px 48px rgba(0, 0, 0, 0.8)',
    modal: '0 24px 64px rgba(0, 0, 0, 0.9)',
    toast: '0 4px 16px rgba(0, 0, 0, 0.5)',
  },
  surface: {
    base: '#030508',
    raised: 'rgba(12, 18, 28, 0.95)',
    floating: 'rgba(18, 25, 38, 0.98)',
    overlay: '#161E2E',
  },
} as const;

export type ElevationTokens = typeof elevationTokens;
export type ElevationLevel = keyof typeof elevationTokens.zIndex;

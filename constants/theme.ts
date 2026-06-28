// PathWise Design System — Single source of truth for all colors and typography.
// NEVER hardcode hex values in components. Always import from here.

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceHigh: string;
  border: string;
  primary: string;
  accent: string;
  gradient: readonly [string, string];
  text: string;
  textMuted: string;
  textDim: string;
  success: string;
  warning: string;
  error: string;
  xpGold: string;
}

export const Themes: Record<"black" | "white" | "cream", ThemeColors> = {
  black: {
    background: '#050505',
    surface: '#0f0f0f',
    surfaceHigh: '#1a1a1a',
    border: '#ffffff14',
    primary: '#3b82f6',
    accent: '#8b5cf6',
    gradient: ['#3b82f6', '#8b5cf6'] as const,
    text: '#f0f0f0',
    textMuted: '#6b7280',
    textDim: '#374151',
    success: '#22c55e',
    warning: '#f59e0b',
    error: '#ef4444',
    xpGold: '#fbbf24',
  },
  white: {
    background: '#ffffff',
    surface: '#f3f4f6',
    surfaceHigh: '#e5e7eb',
    border: '#00000014',
    primary: '#2563eb',
    accent: '#7c3aed',
    gradient: ['#2563eb', '#7c3aed'] as const,
    text: '#111827',
    textMuted: '#4b5563',
    textDim: '#9ca3af',
    success: '#16a34a',
    warning: '#d97706',
    error: '#dc2626',
    xpGold: '#d97706',
  },
  cream: {
    background: '#fcfbf8',
    surface: '#f3f0e6',
    surfaceHigh: '#eaddcc',
    border: '#d1c4b2',
    primary: '#b45309',
    accent: '#9d174d',
    gradient: ['#b45309', '#9d174d'] as const,
    text: '#431407',
    textMuted: '#78350f',
    textDim: '#b45309',
    success: '#166534',
    warning: '#b45309',
    error: '#9f1239',
    xpGold: '#b45309',
  }
};

// Legacy export defaulting to black for unmigrated components
export const Colors = Themes.black;

export const Typography = {
  h1:    { fontFamily: 'SpaceGrotesk_700Bold',    fontSize: 32, letterSpacing: -0.5 },
  h2:    { fontFamily: 'SpaceGrotesk_600SemiBold', fontSize: 24 },
  h3:    { fontFamily: 'SpaceGrotesk_500Medium',  fontSize: 18 },
  body:  { fontFamily: 'Inter_400Regular',        fontSize: 15, lineHeight: 24 },
  small: { fontFamily: 'Inter_400Regular',        fontSize: 13 },
  label: { fontFamily: 'Inter_500Medium',         fontSize: 12, letterSpacing: 0.5 },
  mono:  { fontFamily: 'JetBrainsMono_400Regular', fontSize: 13 },
} as const;

export const Spacing = {
  xs:  4,
  sm:  8,
  md:  16,
  lg:  24,
  xl:  32,
  xxl: 48,
} as const;

export const Radius = {
  sm:  8,
  md:  12,
  lg:  16,
  xl:  24,
  full: 999,
} as const;

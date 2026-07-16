/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

// Mirrors the web app's design tokens 1:1 (src/app/globals.css) so the mobile
// app reads as the same product. No dark-mode design exists on web yet either
// (globals.css is a single warm off-white theme) - dark just reuses petrol-dark
// surfaces instead of invert-guessing a real dark palette.
export const Petrol = '#123338';
export const PetrolLight = '#2a4a4f';
export const PetrolDark = '#0c2226';
export const Gold = '#fed65b';
export const GoldLight = '#e9c349';
export const GoldDim = 'rgba(254,214,91,0.16)';
export const TextGold = '#735c00';

export const Colors = {
  light: {
    text: '#1A1C1C',
    textSecondary: '#414849',
    background: '#FAF9F9',
    backgroundElement: '#f4f3f3',
    backgroundSelected: '#eeeeed',
  },
  dark: {
    text: '#FAF9F9',
    textSecondary: '#B9C0C1',
    background: PetrolDark,
    backgroundElement: PetrolLight,
    backgroundSelected: Petrol,
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Radius = { sm: 8, md: 12, lg: 16, xl: 24, full: 9999 } as const;

// Gold used as a FLAT full-bleed fill (big circles, big buttons) reads cheap -
// on web it only ever appears as a shadowed pill button or a tiny accent bar
// (globals.css .btn-gold / .card-label::before). Mobile skipped the shadow +
// gradient depth that makes it read premium instead of "traffic cone" - these
// gradient pairs + shadow tokens below fix that, same brand, real execution.
export const Gradients = {
  gold: [Gold, '#f4c23c'] as const,
  petrol: [PetrolLight, Petrol, PetrolDark] as const,
  petrolHero: [PetrolDark, Petrol] as const,
} as const;

// iOS-style soft elevation. `elevation` is the Android analogue (Material) -
// both are always set together so the same token works on both platforms.
export const Shadows = {
  sm: { shadowColor: '#0C2226', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 2 },
  md: { shadowColor: '#0C2226', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 6 },
  lg: { shadowColor: '#0C2226', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.16, shadowRadius: 28, elevation: 12 },
  gold: { shadowColor: '#8a6d00', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 8 },
} as const;

// Glassmorphism surface (pairs with expo-blur's <BlurView intensity={GlassIntensity.medium}>).
export const GlassIntensity = { light: 30, medium: 55, heavy: 80 } as const;

// Score bands for the Feed: the card's halo tells fit quality at a glance.
// Semantic color (good/warn/bad), deliberately separate from the gold accent.
export const ScoreBands = {
  high: { color: '#2f9e63', glow: 'rgba(47,158,99,0.55)', tint: 'rgba(47,158,99,0.12)' },
  mid: { color: '#d9a514', glow: 'rgba(217,165,20,0.55)', tint: 'rgba(217,165,20,0.12)' },
  low: { color: '#d4553f', glow: 'rgba(212,85,63,0.55)', tint: 'rgba(212,85,63,0.12)' },
} as const;

export function scoreBand(score: number | null | undefined) {
  if (score == null) return ScoreBands.mid;
  if (score >= 70) return ScoreBands.high;
  if (score >= 50) return ScoreBands.mid;
  return ScoreBands.low;
}

// Apple's damping/response model (see apple-design skill): 1.0 = critically
// damped (no bounce, default for UI state changes); lower = bouncier, only
// for momentum-driven gestures (swipe release, celebration pops).
export const Motion = {
  springSettle: { damping: 20, stiffness: 220, mass: 0.9 },
  springBouncy: { damping: 12, stiffness: 180, mass: 0.9 },
  durationFast: 160,
  durationBase: 240,
  durationSlow: 400,
} as const;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;

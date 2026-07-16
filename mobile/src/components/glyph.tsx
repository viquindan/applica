import { SymbolView, type AndroidSymbol } from 'expo-symbols';
import type { SFSymbol } from 'sf-symbols-typescript';
import type { ColorValue } from 'react-native';

export type GlyphName = { ios: SFSymbol; android: AndroidSymbol };

// Real vector icons (SF Symbols on iOS, Material Symbols on Android/web via
// expo-symbols - already a dependency, already used in collapsible.tsx) in
// place of decorative emoji. Emoji render inconsistently across devices/OSes
// and read as "generic AI slop" rather than a considered icon system.
const GLYPHS = {
  rocket: { ios: 'paperplane.fill', android: 'send' },
  search: { ios: 'magnifyingglass', android: 'search' },
  target: { ios: 'checkmark.circle', android: 'task_alt' },
  check: { ios: 'checkmark.circle.fill', android: 'check_circle' },
  flame: { ios: 'flame.fill', android: 'local_fire_department' },
  briefcase: { ios: 'briefcase.fill', android: 'work' },
  document: { ios: 'doc.text.fill', android: 'description' },
} satisfies Record<string, GlyphName>;

export type GlyphKey = keyof typeof GLYPHS;

export function Glyph({ name, size = 24, color }: { name: GlyphKey; size?: number; color?: ColorValue }) {
  const g = GLYPHS[name];
  return (
    <SymbolView
      name={{ ios: g.ios as SFSymbol, android: g.android, web: g.android }}
      size={size}
      tintColor={color}
      weight="medium"
    />
  );
}

import { BlurView } from 'expo-blur';
import { type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { GlassIntensity, Radius, Shadows } from '@/constants/theme';

type Props = { children: ReactNode; style?: StyleProp<ViewStyle>; intensity?: keyof typeof GlassIntensity };

// Real glass (apple-design skill §12: translucent material as a floating
// layer, not a flat opaque card) - BlurView + a light tint on top so text
// stays legible (vibrancy), instead of the flat #FFFFFF fills used before.
export function GlassCard({ children, style, intensity = 'medium' }: Props) {
  return (
    <View style={[styles.shadowWrap, style]}>
      <BlurView intensity={GlassIntensity[intensity]} tint="light" style={styles.blur}>
        <View style={styles.tint}>{children}</View>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  shadowWrap: { borderRadius: Radius.lg, ...Shadows.md },
  blur: { borderRadius: Radius.lg, overflow: 'hidden' },
  tint: { backgroundColor: 'rgba(255,255,255,0.55)' },
});

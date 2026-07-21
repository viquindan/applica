import { LinearGradient } from 'expo-linear-gradient';
import { ActivityIndicator, StyleSheet } from 'react-native';

import { AnimatedPressable } from '@/components/animated-pressable';
import { ThemedText } from '@/components/themed-text';
import { Gradients, Petrol, Radius, Shadows, Spacing, TextGold } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  label: string;
  onPress?: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
};

// The reusable CTA - real gradient + shadow instead of the flat single-color
// fill that read as a cheap traffic-cone yellow. `secondary` is a quiet
// outline for less-important actions so gold stays reserved for THE one
// primary action per screen (apple-design skill: one primary CTA per screen).
export function GradientButton({ label, onPress, loading, disabled, variant = 'primary' }: Props) {
  const theme = useTheme();
  if (variant === 'secondary') {
    return (
      <AnimatedPressable
        onPress={onPress}
        disabled={disabled || loading}
        style={[styles.secondary, { backgroundColor: theme.backgroundElement, borderColor: theme.backgroundSelected }]}
        haptic="light">
        {loading ? <ActivityIndicator color={theme.text} /> : <ThemedText style={[styles.secondaryText, { color: theme.text }]}>{label}</ThemedText>}
      </AnimatedPressable>
    );
  }

  return (
    <AnimatedPressable onPress={onPress} disabled={disabled || loading} style={styles.shadowWrap} haptic="medium">
      <LinearGradient colors={Gradients.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.primary}>
        {loading ? <ActivityIndicator color={TextGold} /> : <ThemedText style={styles.primaryText}>{label}</ThemedText>}
      </LinearGradient>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  shadowWrap: { borderRadius: Radius.full, ...Shadows.gold },
  primary: {
    borderRadius: Radius.full,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: TextGold, fontWeight: '800', fontSize: 15, letterSpacing: 0.2 },
  secondary: {
    borderRadius: Radius.full,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(18,51,56,0.18)',
  },
  secondaryText: { fontWeight: '700', fontSize: 15 },
});

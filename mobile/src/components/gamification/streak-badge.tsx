import { useRouter } from 'expo-router';
import { StyleSheet } from 'react-native';

import { AnimatedPressable } from '@/components/animated-pressable';
import { Glyph } from '@/components/glyph';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, TextGold } from '@/constants/theme';

// Tappable: the flame alone didn't explain what a streak IS or why it
// matters - tapping it now opens /streak-progress, a gamified path (dots +
// mascot) that ties streak days and application count to visible progress
// toward "your dream job" instead of just showing a bare number.
export function StreakBadge({ streak }: { streak: number | null }) {
  const router = useRouter();
  if (!streak || streak < 1) return null;
  return (
    <AnimatedPressable
      haptic="light"
      onPress={() => router.push('/streak-progress')}
      accessibilityLabel={`Racha de ${streak} dias. Toca para ver tu progreso`}
      style={styles.badge}>
      <Glyph name="flame" size={13} color={TextGold} />
      <ThemedText style={styles.count}>{streak}</ThemedText>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(254,214,91,0.18)',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(254,214,91,0.4)',
  },
  count: { color: TextGold, fontWeight: '800', fontSize: 13 },
});

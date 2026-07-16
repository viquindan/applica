import { StyleSheet, View } from 'react-native';

import { Glyph } from '@/components/glyph';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, TextGold } from '@/constants/theme';

export function StreakBadge({ streak }: { streak: number | null }) {
  if (!streak || streak < 1) return null;
  return (
    <View style={styles.badge} accessibilityLabel={`Racha de ${streak} dias`}>
      <Glyph name="flame" size={13} color={TextGold} />
      <ThemedText style={styles.count}>{streak}</ThemedText>
    </View>
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

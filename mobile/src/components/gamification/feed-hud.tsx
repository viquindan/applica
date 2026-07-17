import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { AnimatedPressable } from '@/components/animated-pressable';
import { GoalProgress } from '@/components/gamification/goal-progress';
import { StreakBadge } from '@/components/gamification/streak-badge';
import { ThemedText } from '@/components/themed-text';
import { Gradients, GoldDim, Petrol, Radius, Shadows, Spacing, TextGold } from '@/constants/theme';

type Props = {
  queueCount: number;
  submittedCount: number;
  todayCount: number;
  dailyGoal: number;
  streak: number | null;
  searching: boolean;
  statusText: string | null;
  onRefresh: () => void;
};

function StatChip({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.chip}>
      <ThemedText style={styles.chipValue}>{value}</ThemedText>
      <ThemedText style={styles.chipLabel}>{label}</ThemedText>
    </View>
  );
}

// A real ring spinner (border trick, no extra deps) reads as "working" more
// convincingly than a spinning glyph character.
function RingSpinner() {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 800, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return <Animated.View style={[styles.spinnerRing, { transform: [{ rotate }] }]} />;
}

/**
 * Game-HUD header for the Feed: run stats up top like a score screen, plus the
 * refresh button that queues a REAL backend search (the core supply loop).
 * Petrol is used only as text/accent here - the screen's own background
 * matches the rest of the app (see index.tsx), not a full petrol wash.
 */
export function FeedHud({ queueCount, submittedCount, todayCount, dailyGoal, streak, searching, statusText, onRefresh }: Props) {
  return (
    <View style={styles.wrap}>
      {/* No page title here on purpose - the tab bar below already reads
          "Feed", and every pixel of vertical space here is one less pixel
          to show the vacancy itself (TikTok-style: chrome stays minimal so
          the content fills the screen). Streak now rides inline with the
          stat chips instead of its own title row. */}
      <View style={styles.hudRow}>
        <StreakBadge streak={streak} />
        <StatChip value={queueCount} label="en cola" />
        <StatChip value={todayCount} label="hoy" />
        <StatChip value={submittedCount} label="enviadas" />
        <AnimatedPressable
          haptic="medium"
          onPress={onRefresh}
          disabled={searching}
          accessibilityLabel={searching ? 'Buscando vacantes nuevas' : 'Buscar vacantes nuevas ahora'}
          style={styles.refreshWrap}>
          <LinearGradient colors={Gradients.gold} style={styles.refreshButton}>
            {searching ? <RingSpinner /> : <ThemedText style={styles.refreshIcon}>{'↻'}</ThemedText>}
            <ThemedText style={styles.refreshLabel}>{searching ? 'Buscando' : 'Actualizar'}</ThemedText>
          </LinearGradient>
        </AnimatedPressable>
      </View>

      <GoalProgress current={todayCount} goal={dailyGoal} />
      {statusText ? <ThemedText style={styles.status}>{statusText}</ThemedText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Tighter than before on purpose - no title row above this anymore, and
  // every bit of vertical space saved here is handed straight to the
  // vacancy card below (see index.tsx: the deck is flex:1, so shrinking the
  // HUD directly grows the card).
  wrap: { alignSelf: 'stretch', paddingHorizontal: Spacing.four, paddingTop: Spacing.one, gap: Spacing.one },
  hudRow: { flexDirection: 'row', alignItems: 'stretch', gap: Spacing.two },
  chip: {
    flex: 1,
    backgroundColor: GoldDim,
    borderRadius: Radius.md,
    paddingVertical: 6,
    alignItems: 'center',
  },
  chipValue: { color: Petrol, fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  chipLabel: { color: '#5c6366', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6 },
  refreshWrap: { flex: 1.2, ...Shadows.gold },
  refreshButton: {
    flex: 1,
    flexDirection: 'row',
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 6,
  },
  spinnerRing: {
    width: 12, height: 12, borderRadius: 6,
    borderWidth: 2, borderColor: 'rgba(115,92,0,0.3)', borderTopColor: TextGold,
  },
  refreshIcon: { color: TextGold, fontSize: 15, fontWeight: '800', lineHeight: 16 },
  refreshLabel: { color: TextGold, fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  status: { color: '#5c6366', fontSize: 12, textAlign: 'center' },
});

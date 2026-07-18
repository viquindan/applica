import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { AnimatedPressable } from '@/components/animated-pressable';
import { GoalRing } from '@/components/gamification/goal-ring';
import { StreakBadge } from '@/components/gamification/streak-badge';
import { ThemedText } from '@/components/themed-text';
import { Gradients, GoldDim, Radius, Shadows, Spacing, TextGold } from '@/constants/theme';

type Props = {
  queueCount: number;
  foundTodayCount: number;
  submittedTotal: number;
  appliedTodayCount: number;
  dailyGoal: number;
  streak: number | null;
  searching: boolean;
  statusText: string | null;
  onRefresh: () => void;
};

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
 * Game-HUD header for the Feed. Two tiers on purpose (found the confusion
 * in production: "HOY" used to mean vacancies the engine prepared today,
 * shown right next to a daily-goal bar meant to track applications YOU sent
 * - the same number was doing two jobs). Secondary/historical counts
 * (found today, lifetime submitted) sit small up top; what you actually act
 * on (today's goal, the decide queue, streak, refresh) is the real HUD row.
 */
export function FeedHud({
  queueCount,
  foundTodayCount,
  submittedTotal,
  appliedTodayCount,
  dailyGoal,
  streak,
  searching,
  statusText,
  onRefresh,
}: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.secondaryRow}>
        <ThemedText themeColor="textSecondary" style={styles.secondaryText}>
          {foundTodayCount} encontradas hoy · {submittedTotal} enviadas en total
        </ThemedText>
      </View>

      <View style={styles.hudRow}>
        <GoalRing current={appliedTodayCount} goal={dailyGoal || 1} size={48} strokeWidth={5} />
        <View style={styles.queuePill}>
          <ThemedText themeColor="text" style={styles.queueValue}>{queueCount}</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.queueLabel}>para decidir</ThemedText>
        </View>
        <StreakBadge streak={streak} />
        {/* Fixed-size circle, not a flex-stretched label button - can't
            overflow its own container regardless of sibling count. */}
        <AnimatedPressable
          haptic="medium"
          onPress={onRefresh}
          disabled={searching}
          accessibilityLabel={searching ? 'Buscando vacantes nuevas' : 'Buscar vacantes nuevas ahora'}
          style={styles.refreshWrap}>
          <LinearGradient colors={Gradients.gold} style={styles.refreshButton}>
            {searching ? <RingSpinner /> : <ThemedText style={styles.refreshIcon}>{'↻'}</ThemedText>}
          </LinearGradient>
        </AnimatedPressable>
      </View>

      {statusText ? <ThemedText themeColor="textSecondary" style={styles.status}>{statusText}</ThemedText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch', paddingHorizontal: Spacing.four, paddingTop: Spacing.one, gap: Spacing.one },
  secondaryRow: { flexDirection: 'row', justifyContent: 'center' },
  secondaryText: { fontSize: 11, fontWeight: '600' },
  hudRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  queuePill: {
    flex: 1,
    backgroundColor: GoldDim,
    borderRadius: Radius.full,
    paddingVertical: 8,
    paddingHorizontal: Spacing.three,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 6,
  },
  queueValue: { fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'] },
  queueLabel: { fontSize: 11, fontWeight: '700' },
  refreshWrap: { width: 40, height: 40, ...Shadows.gold },
  refreshButton: {
    flex: 1,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinnerRing: {
    width: 16, height: 16, borderRadius: 8,
    borderWidth: 2, borderColor: 'rgba(115,92,0,0.3)', borderTopColor: TextGold,
  },
  refreshIcon: { color: TextGold, fontSize: 20, fontWeight: '800', lineHeight: 22 },
  status: { fontSize: 12, textAlign: 'center' },
});

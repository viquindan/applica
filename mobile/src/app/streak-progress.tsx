import { useEffect } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Glyph } from '@/components/glyph';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Gold, GoldDim, Motion, Petrol, Radius, Spacing, TextGold } from '@/constants/theme';
import { useApplicationsData } from '@/hooks/use-applications';
import { useStreak } from '@/hooks/use-streak';
import { computeLevel, computeXp } from '@/utils/level';

// Milestones the path renders, closest-to-today first (the path itself is
// drawn furthest-away-first so the mascot ends up at the bottom, "today").
const MILESTONES = [1, 3, 7, 14, 30, 60, 100];

function milestoneLabel(days: number): string {
  if (days === 1) return 'Primer dia';
  return `${days} dias seguidos`;
}

function LevelCard({ xp }: { xp: number }) {
  const level = computeLevel(xp);
  const ratio = level.xpToNext ? Math.min(level.xpInLevel / level.xpToNext, 1) : 1;
  const pct = useSharedValue(0);

  useEffect(() => {
    pct.value = withTiming(ratio, { duration: Motion.durationSlow });
  }, [ratio]);

  const barStyle = useAnimatedStyle(() => ({ width: `${pct.value * 100}%` }));

  return (
    <Animated.View entering={FadeInDown.duration(400).delay(180)} style={styles.levelCard}>
      <View style={styles.levelHeaderRow}>
        <View style={styles.levelChip}>
          <Glyph name="check" size={13} color={TextGold} />
          <ThemedText style={styles.levelChipText}>Nivel {level.level} · {level.title}</ThemedText>
        </View>
        <ThemedText themeColor="textSecondary" style={styles.xpCaption}>
          {level.isMax ? `${level.xp} XP` : `${level.xpInLevel}/${level.xpToNext} XP`}
        </ThemedText>
      </View>
      <View style={styles.xpTrack}>
        <Animated.View style={[styles.xpFill, barStyle]} />
      </View>
      {!level.isMax ? (
        <ThemedText themeColor="textSecondary" style={styles.xpNote}>
          Sigue aplicando y mantén la racha para subir de nivel.
        </ThemedText>
      ) : null}
    </Animated.View>
  );
}

export default function StreakProgressScreen() {
  const streak = useStreak();
  const { stats } = useApplicationsData();
  const applications = stats?.submitted ?? 0;
  const days = streak ?? 0;
  const xp = computeXp(days, applications);

  const nextMilestone = MILESTONES.find((m) => m > days) ?? null;
  const reversed = [...MILESTONES].reverse();

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Animated.View entering={FadeInDown.duration(400)}>
          <ThemedText type="subtitle" style={styles.title}>Tu camino</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.subtitle}>
            Cada dia de racha y cada aplicacion te acercan a tu trabajo sonado.
          </ThemedText>
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(400).delay(100)} style={styles.statsRow}>
          <View style={styles.statCard}>
            <Glyph name="flame" size={22} color={TextGold} />
            <ThemedText style={styles.statValue}>{days}</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.statLabel}>dias de racha</ThemedText>
          </View>
          <View style={styles.statCard}>
            <Glyph name="briefcase" size={22} color={Petrol} />
            <ThemedText style={styles.statValue}>{applications}</ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.statLabel}>aplicaciones</ThemedText>
          </View>
        </Animated.View>

        <LevelCard xp={xp} />

        <View style={styles.path}>
          {reversed.map((milestone, i) => {
            const reached = days >= milestone;
            const isCurrent = milestone === nextMilestone && !reached;
            return (
              <Animated.View
                key={milestone}
                entering={FadeInDown.duration(350).delay(150 + i * 60)}
                style={styles.pathRow}>
                <View style={styles.dotColumn}>
                  <View
                    style={[
                      styles.dot,
                      reached && styles.dotReached,
                      isCurrent && styles.dotCurrent,
                    ]}>
                    {reached ? (
                      <Glyph name="check" size={16} color={Petrol} />
                    ) : isCurrent ? (
                      <Glyph name="rocket" size={14} color={TextGold} />
                    ) : null}
                  </View>
                  {i < reversed.length - 1 ? (
                    <View style={[styles.connector, reached && styles.connectorReached]} />
                  ) : null}
                </View>
                <ThemedText
                  themeColor={reached ? 'text' : 'textSecondary'}
                  style={[styles.milestoneLabel, isCurrent && styles.milestoneLabelCurrent]}>
                  {milestoneLabel(milestone)}
                </ThemedText>
              </Animated.View>
            );
          })}

          {/* "Today" anchors the bottom of the path - the mascot's real
              current position when no milestone is actively next (streak
              already past the last one, or just starting). */}
          <View style={styles.pathRow}>
            <View style={styles.dotColumn}>
              <View style={[styles.dot, styles.dotToday]}>
                <Glyph name="rocket" size={14} color={TextGold} />
              </View>
            </View>
            <ThemedText style={styles.milestoneLabelCurrent}>Hoy</ThemedText>
          </View>
        </View>

        <ThemedText themeColor="textSecondary" style={styles.footer}>
          {nextMilestone
            ? `Sigue aplicando: a ${nextMilestone - days} dia${nextMilestone - days === 1 ? '' : 's'} de tu proxima meta.`
            : 'Llevas la racha mas larga del camino. Sigue asi.'}
        </ThemedText>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.four, paddingBottom: Spacing.six },
  title: { marginBottom: Spacing.one },
  subtitle: { fontSize: 14, lineHeight: 20 },
  statsRow: { flexDirection: 'row', gap: Spacing.three, marginTop: Spacing.four },
  statCard: {
    flex: 1,
    backgroundColor: GoldDim,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    gap: 4,
  },
  statValue: { fontSize: 24, fontWeight: '800' },
  statLabel: { fontSize: 12 },
  levelCard: { marginTop: Spacing.four, gap: 8 },
  levelHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  levelChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(254,214,91,0.18)', borderRadius: Radius.full,
    paddingHorizontal: Spacing.three, paddingVertical: 5,
  },
  levelChipText: { color: TextGold, fontWeight: '800', fontSize: 12.5 },
  xpCaption: { fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'] },
  xpTrack: { height: 8, borderRadius: Radius.full, backgroundColor: GoldDim, overflow: 'hidden' },
  xpFill: { height: '100%', borderRadius: Radius.full, backgroundColor: Gold },
  xpNote: { fontSize: 11.5 },
  path: { marginTop: Spacing.five },
  pathRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.three },
  dotColumn: { alignItems: 'center', width: 32 },
  dot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'rgba(18,51,56,0.15)',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotReached: { backgroundColor: Gold, borderColor: Gold },
  dotCurrent: { borderColor: Gold, borderStyle: 'dashed' },
  dotToday: { backgroundColor: Gold, borderColor: Gold },
  connector: { width: 2, flex: 1, minHeight: 24, backgroundColor: 'rgba(18,51,56,0.15)', marginVertical: 4 },
  connectorReached: { backgroundColor: Gold },
  milestoneLabel: { fontSize: 15, fontWeight: '600', paddingTop: 6 },
  milestoneLabelCurrent: { fontSize: 15, fontWeight: '800', paddingTop: 6 },
  footer: { marginTop: Spacing.four, fontSize: 13, textAlign: 'center' },
});

import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/animated-pressable';
import { EmptyState, StatPill } from '@/components/empty-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Petrol, Radius, Shadows, Spacing } from '@/constants/theme';
import { useApplicationsData } from '@/hooks/use-applications';
import { useStreak } from '@/hooks/use-streak';
import type { AppRow, AppStatus } from '@/types';

const STATUS_LABEL: Record<AppStatus, string> = {
  draft: 'Preparando',
  generating: 'Preparando',
  pending_review: 'Por revisar',
  approved: 'Enviando',
  submitted: 'Enviada',
  skipped: 'Descartada por ti',
  archived: 'Archivada',
  failed: 'Falló',
  new: 'Nueva',
  scoring: 'Evaluando',
  scored: 'Evaluada',
  filtered: 'No calzó con tu perfil',
  applying: 'Enviando',
  applied: 'Enviada',
};

// Only these two statuses mean a real application actually went out. Everything
// else in historyApps (filtered by score, skipped/archived by you, failed, or
// still mid-flight) lives in "Descartadas" so it stops competing visually with
// the applications that actually succeeded.
const SUCCESS_STATUSES = new Set<AppStatus>(['submitted', 'applied']);

const TABS = [
  { key: 'sent', label: 'Aplicaciones' },
  { key: 'discarded', label: 'Descartadas' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

export default function AppsScreen() {
  const router = useRouter();
  const { historyApps, stats } = useApplicationsData();
  const streak = useStreak();
  const [tab, setTab] = useState<TabKey>('sent');

  const { sent, discarded } = useMemo(() => ({
    sent: historyApps.filter((a) => SUCCESS_STATUSES.has(a.status)),
    discarded: historyApps.filter((a) => !SUCCESS_STATUSES.has(a.status)),
  }), [historyApps]);

  const data = tab === 'sent' ? sent : discarded;

  return (
    <ThemedView style={styles.container}>
      {/* No 'bottom' edge: NativeTabs already reserves its own safe-area
          inset below - see index.tsx for the full explanation. */}
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        {/* No page title - the tab bar already reads "Apps" (see Feed for the
            same change and why). The stats line below still earns its space. */}
        {stats ? (
          <ThemedText style={styles.stats}>
            {stats.total} aplicaciones · {stats.submitted} enviadas · {stats.pendingReview} por revisar
          </ThemedText>
        ) : null}

        <View style={styles.tabBar}>
          {TABS.map((t) => {
            const count = t.key === 'sent' ? sent.length : discarded.length;
            return (
              <AnimatedPressable key={t.key} haptic="light" onPress={() => setTab(t.key)} style={[styles.tabButton, tab === t.key && styles.tabButtonActive]}>
                <ThemedText style={[styles.tabButtonText, tab === t.key && styles.tabButtonTextActive]}>
                  {t.label} {count > 0 ? `(${count})` : ''}
                </ThemedText>
              </AnimatedPressable>
            );
          })}
        </View>

        <FlatList
          data={data}
          keyExtractor={(a) => a.id}
          contentContainerStyle={[styles.list, !data.length && styles.listEmpty]}
          ListEmptyComponent={
            tab === 'sent' ? (
              <EmptyState
                icon="rocket"
                title="Tu historial empieza en el Feed"
                subtitle="Desliza a la derecha en una vacante para aplicar - aqui vas a ver cada postulacion y su estado.">
                {streak && streak > 0 ? (
                  <View style={styles.streakRow}>
                    <StatPill icon="flame" value={streak} label="racha de dias" />
                  </View>
                ) : null}
              </EmptyState>
            ) : (
              <EmptyState icon="search" title="Nada descartado" subtitle="Aquí verás las vacantes que el buscador encontró pero no calzaron con tu perfil, o que descartaste tú." />
            )
          }
          renderItem={({ item, index }) => <Row app={item} index={index} onPress={() => router.push(`/application/${item.id}`)} />}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

function Row({ app, index, onPress }: { app: AppRow; index: number; onPress: () => void }) {
  const isDiscarded = !SUCCESS_STATUSES.has(app.status);
  return (
    <Animated.View entering={FadeInDown.duration(300).delay(Math.min(index, 8) * 35)}>
      <AnimatedPressable haptic="light" onPress={onPress} style={[styles.row, isDiscarded && styles.rowDiscarded]}>
        <View style={styles.rowMain}>
          <ThemedText style={styles.rowTitle} numberOfLines={1}>{app.vacancy?.title}</ThemedText>
          <ThemedText style={styles.rowCompany} numberOfLines={1}>{app.vacancy?.company}</ThemedText>
        </View>
        <View style={styles.rowMeta}>
          {isDiscarded && app.vacancy?.score != null ? (
            <ThemedText style={styles.rowScore}>{app.vacancy.score}%</ThemedText>
          ) : null}
          <ThemedText style={styles.rowStatus}>{STATUS_LABEL[app.status] ?? app.status}</ThemedText>
        </View>
      </AnimatedPressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four, paddingTop: Spacing.two },
  stats: { color: '#5c6366', fontSize: 12, marginBottom: Spacing.three },
  tabBar: { flexDirection: 'row', gap: 6, marginBottom: Spacing.three },
  tabButton: { flex: 1, minHeight: 44, justifyContent: 'center', paddingVertical: 9, borderRadius: Radius.full, alignItems: 'center', backgroundColor: '#f4f3f3' },
  tabButtonActive: { backgroundColor: Petrol },
  tabButtonText: { fontSize: 12.5, fontWeight: '700', color: '#5c6366' },
  tabButtonTextActive: { color: '#FAF9F9' },
  list: { gap: Spacing.two, paddingBottom: Spacing.six },
  listEmpty: { flexGrow: 1 },
  streakRow: { marginTop: Spacing.one },
  row: {
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.md,
    padding: Spacing.three,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.two,
    ...Shadows.sm,
  },
  rowDiscarded: { opacity: 0.7 },
  rowMain: { flexShrink: 1 },
  rowTitle: { color: Petrol, fontWeight: '700', fontSize: 14 },
  rowCompany: { color: '#5c6366', fontSize: 12 },
  rowMeta: { alignItems: 'flex-end', gap: 2 },
  rowScore: { color: '#5c6366', fontSize: 11, fontWeight: '600' },
  rowStatus: { color: '#414849', fontSize: 12, fontWeight: '600' },
});

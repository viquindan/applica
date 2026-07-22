import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedPressable } from '@/components/animated-pressable';
import { EmptyState, StatPill } from '@/components/empty-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { UnansweredSheet } from '@/components/unanswered-sheet';
import { Gold, Petrol, Radius, Shadows, Spacing, TextGold } from '@/constants/theme';
import { blockerQuestion, needsInfoFor, unresolvedBlockers, useApplicationActions, useApplicationsData } from '@/hooks/use-applications';
import type { AppRow } from '@/types';

export default function PendingScreen() {
  const router = useRouter();
  const { pendingApps, stats } = useApplicationsData();
  const { markApplied, cancelAssisted, answerBlockers } = useApplicationActions();
  const [fillingApp, setFillingApp] = useState<AppRow | null>(null);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* No page title - the tab bar already reads "Pendientes" (see Feed
            for the same change and why). */}
        <FlatList
          data={pendingApps}
          keyExtractor={(a) => a.id}
          contentContainerStyle={[styles.list, !pendingApps.length && styles.listEmpty]}
          ListEmptyComponent={
            <EmptyState
              icon="check"
              title="Nada pendiente"
              subtitle="Vas al dia: no hay envios en curso ni datos por completar. Vuelve al Feed para seguir aplicando.">
              {stats ? <StatPill value={stats.submitted} label="enviadas en total" /> : null}
            </EmptyState>
          }
          renderItem={({ item, index }) => (
            <Row
              app={item}
              index={index}
              onPress={() => router.push(`/application/${item.id}`)}
              onMarkApplied={() => markApplied.mutate(item)}
              onCancel={() => cancelAssisted.mutate(item)}
              onFillInfo={() => setFillingApp(item)}
              onHelpLive={() => router.push(`/assisted-view/${item.id}`)}
            />
          )}
        />
      </SafeAreaView>

      {fillingApp ? (
        <UnansweredSheet
          fields={unresolvedBlockers(fillingApp).map(blockerQuestion)}
          onDismiss={() => setFillingApp(null)}
          onSubmit={(answers) => {
            answerBlockers.mutate({ app: fillingApp, answers });
            setFillingApp(null);
          }}
        />
      ) : null}
    </ThemedView>
  );
}

function Row({ app, index, onPress, onMarkApplied, onCancel, onFillInfo, onHelpLive }: {
  app: AppRow; index: number; onPress: () => void; onMarkApplied: () => void; onCancel: () => void; onFillInfo: () => void; onHelpLive: () => void;
}) {
  const sending = app.status === 'approved';
  const missingInfo = needsInfoFor(app);
  return (
    <Animated.View entering={FadeInDown.duration(350).delay(Math.min(index, 6) * 45)} style={styles.row}>
      <ThemedText onPress={onPress} style={styles.rowTitle}>{app.vacancy?.title}</ThemedText>
      <ThemedText style={styles.rowCompany}>{app.vacancy?.company}</ThemedText>
      <ThemedText style={styles.rowStatus}>
        {sending ? 'Applica está aplicando por ti...' : 'Faltan algunos datos para poder aplicar'}
      </ThemedText>
      {sending && (
        <View style={styles.rowActions}>
          <AnimatedPressable haptic="medium" onPress={onHelpLive} style={styles.pillLive}>
            <ThemedText style={styles.pillLiveText}>Ayudar ahora (en vivo)</ThemedText>
          </AnimatedPressable>
          <AnimatedPressable haptic="medium" onPress={onMarkApplied} style={styles.pillPrimary}>
            <ThemedText style={styles.pillPrimaryText}>Ya envié</ThemedText>
          </AnimatedPressable>
          <AnimatedPressable haptic="light" onPress={onCancel} style={styles.pillSecondary}>
            <ThemedText style={styles.pillSecondaryText}>No se envió</ThemedText>
          </AnimatedPressable>
        </View>
      )}
      {missingInfo && (
        <View style={styles.rowActions}>
          <AnimatedPressable haptic="light" onPress={onFillInfo} style={styles.pillPrimary}>
            <ThemedText style={styles.pillPrimaryText}>Completar datos</ThemedText>
          </AnimatedPressable>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four, paddingTop: Spacing.two },
  list: { gap: Spacing.three, paddingBottom: Spacing.six },
  listEmpty: { flexGrow: 1 },
  row: { backgroundColor: '#FFFFFF', borderRadius: Radius.lg, padding: Spacing.three, gap: 4, ...Shadows.sm },
  rowTitle: { color: Petrol, fontSize: 16, fontWeight: '700' },
  rowCompany: { color: '#414849', fontSize: 14 },
  rowStatus: { color: '#5c6366', fontSize: 12, marginTop: 4 },
  rowActions: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two },
  pillPrimary: { backgroundColor: Gold, paddingHorizontal: Spacing.three, paddingVertical: 6, borderRadius: Radius.full },
  pillPrimaryText: { color: TextGold, fontWeight: '700', fontSize: 12 },
  pillSecondary: { backgroundColor: '#f4f3f3', paddingHorizontal: Spacing.three, paddingVertical: 6, borderRadius: Radius.full },
  pillSecondaryText: { color: '#414849', fontSize: 12 },
  pillLive: { backgroundColor: Petrol, paddingHorizontal: Spacing.three, paddingVertical: 6, borderRadius: Radius.full },
  pillLiveText: { color: '#FFFFFF', fontWeight: '700', fontSize: 12 },
});

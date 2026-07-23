import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated as RNAnimated, Easing, FlatList, StyleSheet, View } from 'react-native';
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

const LIVE = '#2f9e6e';

// Compact status banner (design reviewed as "Opción A" with the user,
// 2026-07-22): the list used to drop straight into the first card with zero
// context on how many sends are actually in flight. Same pulse-dot language
// SwipeCard already uses for "this needs a decision now" (UrgencyPulse),
// reused here for "this is happening right now".
function PulseDot() {
  const pulse = useRef(new RNAnimated.Value(0)).current;
  useEffect(() => {
    const loop = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        RNAnimated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  const haloScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] });
  const haloOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] });
  return (
    <View style={styles.pulseWrap}>
      <RNAnimated.View style={[styles.pulseHalo, { transform: [{ scale: haloScale }], opacity: haloOpacity }]} />
      <View style={styles.pulseDot} />
    </View>
  );
}

function SendingBanner({ count }: { count: number }) {
  return (
    <View style={styles.banner}>
      <PulseDot />
      <View style={styles.bannerText}>
        <ThemedText style={styles.bannerTitle}>
          {count === 1 ? '1 aplicación en curso' : `${count} aplicaciones en curso`}
        </ThemedText>
        <ThemedText style={styles.bannerSubtitle}>Applica está aplicando por ti - ayuda si hace falta</ThemedText>
      </View>
    </View>
  );
}

export default function PendingScreen() {
  const router = useRouter();
  const { pendingApps, stats } = useApplicationsData();
  const { markApplied, cancelAssisted, answerBlockers } = useApplicationActions();
  const [fillingApp, setFillingApp] = useState<AppRow | null>(null);
  const sendingCount = useMemo(() => pendingApps.filter((a) => a.status === 'approved').length, [pendingApps]);

  return (
    <ThemedView style={styles.container}>
      {/* No 'bottom' edge: NativeTabs already reserves its own safe-area
          inset below - see index.tsx for the full explanation. */}
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        {/* No page title - the tab bar already reads "Pendientes" (see Feed
            for the same change and why). */}
        {sendingCount > 0 ? <SendingBanner count={sendingCount} /> : null}
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
        <ThemedText style={styles.rowHint}>
          Te avisamos si necesitamos tu ayuda - no hace falta que te quedes mirando.
        </ThemedText>
      )}
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
  rowHint: { color: '#8d9694', fontSize: 11, marginTop: 2, fontStyle: 'italic' },
  rowActions: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two },
  pillPrimary: { backgroundColor: Gold, paddingHorizontal: Spacing.three, paddingVertical: 6, borderRadius: Radius.full },
  pillPrimaryText: { color: TextGold, fontWeight: '700', fontSize: 12 },
  pillSecondary: { backgroundColor: '#f4f3f3', paddingHorizontal: Spacing.three, paddingVertical: 6, borderRadius: Radius.full },
  pillSecondaryText: { color: '#414849', fontSize: 12 },
  pillLive: { backgroundColor: Petrol, paddingHorizontal: Spacing.three, paddingVertical: 6, borderRadius: Radius.full },
  pillLiveText: { color: '#FFFFFF', fontWeight: '700', fontSize: 12 },
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.two,
    backgroundColor: Petrol, borderRadius: Radius.lg,
    paddingVertical: Spacing.three, paddingHorizontal: Spacing.three,
    marginBottom: Spacing.three,
  },
  bannerText: { flex: 1 },
  bannerTitle: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  bannerSubtitle: { color: 'rgba(255,255,255,0.72)', fontSize: 12, marginTop: 2 },
  pulseWrap: { width: 14, height: 14, alignItems: 'center', justifyContent: 'center' },
  pulseHalo: { position: 'absolute', width: 14, height: 14, borderRadius: 7, backgroundColor: LIVE },
  pulseDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: LIVE },
});

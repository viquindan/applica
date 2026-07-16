import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import type { SearchStatus } from '@/api/search';
import { Gold, Petrol, Radius, Spacing } from '@/constants/theme';

const PHRASES = [
  'Escaneando bolsas de empleo…',
  'Revisando LinkedIn…',
  'Comparando con tu perfil…',
  'Filtrando por tus preferencias…',
  'Calculando compatibilidad…',
  'Preparando candidatos…',
];

function RadarRing({ delay }: { delay: number }) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(progress, { toValue: 1, duration: 1800, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [progress, delay]);

  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] });
  const opacity = progress.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.5, 0] });

  return <Animated.View style={[styles.ring, { transform: [{ scale }], opacity }]} />;
}

/**
 * Fills the deck while a real backend search is running: honest, ever-moving
 * feedback (radar sweep + rotating phrases) so an empty Feed never reads as
 * "broken" - the same job the web funnel table does, sized for a phone.
 * Prefers real counts from /api/search/status once they arrive.
 */
export function SearchingPanel({ status }: { status?: SearchStatus }) {
  const [phraseIndex, setPhraseIndex] = useState(0);
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const interval = setInterval(() => {
      Animated.sequence([
        Animated.timing(fade, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(fade, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
      setPhraseIndex((i) => (i + 1) % PHRASES.length);
    }, 1900);
    return () => clearInterval(interval);
  }, [fade]);

  const sources = status?.lastSearchSourceCount ?? 0;
  const filtered = status?.lastSearchFilteredCount ?? 0;
  const prepared = status?.lastSearchPreparedCount ?? 0;
  const hasProgress = sources > 0 || filtered > 0 || prepared > 0;

  return (
    <View style={styles.wrap}>
      <View style={styles.radarBox}>
        <RadarRing delay={0} />
        <RadarRing delay={600} />
        <RadarRing delay={1200} />
        <View style={styles.radarCore} />
      </View>
      <Animated.View style={{ opacity: fade }}>
        <ThemedText style={styles.phrase}>{PHRASES[phraseIndex]}</ThemedText>
      </Animated.View>
      {hasProgress ? (
        <View style={styles.statsRow}>
          <StatBit value={sources} label="fuentes" />
          <StatBit value={filtered} label="descartadas" />
          <StatBit value={prepared} label="listas" />
        </View>
      ) : null}
      <ThemedText style={styles.hint}>Applica esta trabajando en segundo plano - puedes seguir usando la app.</ThemedText>
    </View>
  );
}

function StatBit({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.statBit}>
      <ThemedText style={styles.statValue}>{value}</ThemedText>
      <ThemedText style={styles.statLabel}>{label}</ThemedText>
    </View>
  );
}

const RING_SIZE = 120;

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three, padding: Spacing.four },
  radarBox: { width: RING_SIZE, height: RING_SIZE, alignItems: 'center', justifyContent: 'center' },
  ring: {
    position: 'absolute',
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: 2,
    borderColor: Gold,
  },
  radarCore: { width: 16, height: 16, borderRadius: 8, backgroundColor: Gold },
  phrase: { color: Petrol, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  statsRow: { flexDirection: 'row', gap: Spacing.four, marginTop: Spacing.one },
  statBit: { alignItems: 'center' },
  statValue: { color: Petrol, fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  statLabel: { color: '#5c6366', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  hint: { color: '#5c6366', fontSize: 11, textAlign: 'center', maxWidth: 240 },
  container: { borderRadius: Radius.lg },
});

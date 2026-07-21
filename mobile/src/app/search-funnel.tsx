import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, useAnimatedProps, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { getSearchStatus } from '@/api/search';
import { EmptyState } from '@/components/empty-state';
import { Glyph } from '@/components/glyph';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Gold, GoldDim, Motion, Radius, ScoreBands, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const AnimatedPath = Animated.createAnimatedComponent(Path);

// Real bug fixed here (2026-07-18 build): the first version of this funnel
// put stage labels directly ON TOP of the colored ribbons - grey text on a
// dark ribbon fill had no contrast, and two thin final-stage ribbons close
// together made their label text collide. Structural fix: labels live in
// their OWN flex column, in EQUAL-height rows, completely separate from the
// SVG shape - contrast is guaranteed (always ink-on-panel, never ink-on-
// ribbon) and rows can never overlap regardless of how thin a ribbon gets.
const STAGE_META = [
  { key: 'universe' as const, label: 'Vacantes en nuestra base', color: 'pool' as const },
  { key: 'expertiseMatch' as const, label: 'Coinciden con tu experiencia', color: 'expertise' as const },
  { key: 'regionMatch' as const, label: 'Tu región y modalidad de trabajo', color: 'region' as const },
  { key: 'eligible' as const, label: 'Cumplen tus requisitos', color: 'region' as const },
];

const CANVAS_W = 92;
const MIN_W = 14;
const MAX_W = 92;
const ROW_H = 84;

function widthFor(value: number, maxValue: number) {
  if (maxValue <= 0) return MIN_W;
  const t = Math.sqrt(Math.max(value, 0) / maxValue);
  return MIN_W + (MAX_W - MIN_W) * t;
}

function ribbonPath(y1: number, w1: number, y2: number, w2: number) {
  const midY = (y1 + y2) / 2;
  const cx = CANVAS_W / 2;
  const lA = cx - w1 / 2, rA = cx + w1 / 2;
  const lB = cx - w2 / 2, rB = cx + w2 / 2;
  return `M ${lA},${y1}
          C ${lA},${midY} ${lB},${midY} ${lB},${y2}
          L ${rB},${y2}
          C ${rB},${midY} ${rA},${midY} ${rA},${y1}
          Z`;
}

function FunnelRibbon({ d, color, delay }: { d: string; color: string; delay: number }) {
  const opacity = useSharedValue(0);
  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: Motion.durationSlow }));
  }, []);
  const animatedProps = useAnimatedProps(() => ({ opacity: opacity.value }));
  return <AnimatedPath d={d} fill={color} animatedProps={animatedProps} />;
}

export default function SearchFunnelScreen() {
  const theme = useTheme();
  const { data, isLoading } = useQuery({ queryKey: ['searchFunnel'], queryFn: getSearchStatus });
  const funnel = data?.lastSearchFunnel;

  const colorFor = {
    pool: theme.backgroundSelected,
    expertise: '#3f7a82',
    region: ScoreBands.mid.color,
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        {isLoading ? (
          <ActivityIndicator color={Gold} style={styles.loading} />
        ) : !funnel ? (
          <EmptyState
            icon="search"
            title="Todavía no hay una búsqueda"
            subtitle="En cuanto corra tu primera búsqueda real, aquí vas a ver exactamente cómo el motor llegó a tus oportunidades."
          />
        ) : (
          <ScrollView contentContainerStyle={styles.scroll}>
            <Animated.View entering={FadeInDown.duration(400)}>
              <ThemedText type="subtitle" style={styles.title}>Cómo llegamos a tus oportunidades</ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.subtitle}>
                De todo lo que existe, así de puntual es el filtro hasta lo que de verdad te sirve.
              </ThemedText>
            </Animated.View>

            <Animated.View entering={FadeInDown.duration(400).delay(80)} style={styles.funnelRow}>
              <View style={[styles.svgCol, { height: ROW_H * STAGE_META.length }]}>
                <Svg width={CANVAS_W} height={ROW_H * STAGE_META.length} viewBox={`0 0 ${CANVAS_W} ${ROW_H * STAGE_META.length}`}>
                  {STAGE_META.slice(0, -1).map((stage, i) => {
                    const next = STAGE_META[i + 1];
                    const v1 = funnel[stage.key] ?? 0;
                    const v2 = funnel[next.key] ?? 0;
                    const y1 = ROW_H * i + ROW_H / 2;
                    const y2 = ROW_H * (i + 1) + ROW_H / 2;
                    return (
                      <FunnelRibbon
                        key={stage.key}
                        d={ribbonPath(y1, widthFor(v1, funnel.universe), y2, widthFor(v2, funnel.universe))}
                        color={colorFor[stage.color]}
                        delay={i * 140}
                      />
                    );
                  })}
                </Svg>
              </View>

              <View style={styles.labelsCol}>
                {STAGE_META.map((stage, i) => (
                  <Animated.View
                    key={stage.key}
                    entering={FadeInDown.duration(350).delay(160 + i * 110)}
                    style={[styles.labelRow, { height: ROW_H }]}>
                    <ThemedText themeColor="text" style={styles.stageValue}>
                      {(funnel[stage.key] ?? 0).toLocaleString('en-US')}
                    </ThemedText>
                    <ThemedText themeColor="textSecondary" style={styles.stageLabel}>{stage.label}</ThemedText>
                  </Animated.View>
                ))}
              </View>
            </Animated.View>

            <Animated.View entering={FadeInDown.duration(400).delay(600)} style={styles.resultSection}>
              <ThemedText themeColor="textSecondary" style={styles.resultEyebrow}>Resultado: listas en tu Feed</ThemedText>
              <View style={styles.resultRow}>
                <View style={[styles.resultCard, { backgroundColor: ScoreBands.high.tint, borderColor: ScoreBands.high.color }]}>
                  <Glyph name="check" size={18} color={ScoreBands.high.color} />
                  <ThemedText themeColor="text" style={styles.resultValue}>{funnel.highConfidence}</ThemedText>
                  <ThemedText themeColor="textSecondary" style={styles.resultLabel}>Alta confianza{'\n'}score ≥ 70</ThemedText>
                </View>
                <View style={[styles.resultCard, { backgroundColor: GoldDim, borderColor: Gold }]}>
                  <Glyph name="target" size={18} color={ScoreBands.mid.color} />
                  <ThemedText themeColor="text" style={styles.resultValue}>{funnel.goodMatch}</ThemedText>
                  <ThemedText themeColor="textSecondary" style={styles.resultLabel}>Buen match{'\n'}score 60–69</ThemedText>
                </View>
              </View>
            </Animated.View>

            <Animated.View entering={FadeInDown.duration(400).delay(720)}>
              <ThemedText themeColor="textSecondary" style={styles.footnote}>
                Además de esta base, buscamos en tiempo real en fuentes adicionales según tu plan
                (incluye búsqueda en LinkedIn si tienes Pro) - esas se suman aparte a tu Feed.
              </ThemedText>
            </Animated.View>
          </ScrollView>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  loading: { marginTop: Spacing.six },
  scroll: { padding: Spacing.four, paddingBottom: Spacing.six, gap: Spacing.five },
  title: { fontSize: 20 },
  subtitle: { fontSize: 13, lineHeight: 19, marginTop: 4 },
  funnelRow: { flexDirection: 'row', alignItems: 'flex-start' },
  svgCol: { width: CANVAS_W },
  labelsCol: { flex: 1, paddingLeft: Spacing.three },
  labelRow: { justifyContent: 'center', gap: 2 },
  stageValue: { fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'] },
  stageLabel: { fontSize: 12.5, lineHeight: 16 },
  resultSection: { gap: Spacing.two },
  resultEyebrow: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  resultRow: { flexDirection: 'row', gap: Spacing.three },
  resultCard: {
    flex: 1, borderRadius: Radius.lg, borderWidth: 1.5,
    paddingVertical: Spacing.three, paddingHorizontal: Spacing.two,
    alignItems: 'center', gap: 6,
  },
  resultValue: { fontSize: 26, fontWeight: '800', fontVariant: ['tabular-nums'] },
  resultLabel: { fontSize: 11.5, textAlign: 'center', lineHeight: 15 },
  footnote: { fontSize: 11.5, lineHeight: 16, textAlign: 'center' },
});

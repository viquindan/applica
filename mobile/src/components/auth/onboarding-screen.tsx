import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Dimensions, ScrollView, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useRef } from 'react';

import { OnboardingIllustration } from '@/components/auth/onboarding-illustration';
import { GradientButton } from '@/components/gradient-button';
import type { GlyphKey } from '@/components/glyph';
import { ThemedText } from '@/components/themed-text';
import { Gradients, Motion, Radius, Spacing } from '@/constants/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const STEPS: Array<{ icon: GlyphKey; title: string; body: string }> = [
  {
    icon: 'briefcase',
    title: 'Bienvenido a Applica',
    body: 'La forma más rápida de encontrar tu próximo trabajo. Simplemente desliza para aplicar.',
  },
  {
    icon: 'document',
    title: 'CV y carta listos',
    body: 'Antes de que decidas, ya preparamos un CV a medida y una carta de presentación para cada vacante.',
  },
  {
    icon: 'check',
    title: 'Tú tienes el control',
    body: 'Applica llena y avanza los formularios por ti. Si un sitio pide verificación, te avisa y esperas tu turno.',
  },
];

type Props = { onDone: () => void };

export function OnboardingScreen({ onDone }: Props) {
  const [index, setIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const i = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    if (i !== index) {
      setIndex(i);
      Haptics.selectionAsync();
    }
  }

  const isLast = index === STEPS.length - 1;

  return (
    <View style={styles.container}>
      <LinearGradient colors={Gradients.petrolHero} style={StyleSheet.absoluteFill} />
      <View style={styles.progressRow}>
        {STEPS.map((s, i) => (
          <ProgressDot key={s.title} active={i <= index} />
        ))}
      </View>

      <ThemedText onPress={onDone} style={styles.skip}>Saltar intro</ThemedText>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        style={styles.scroll}>
        {STEPS.map((step, i) => (
          <StepSlide key={step.title} step={step} active={i === index} />
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <GradientButton
          label={isLast ? 'Comenzar' : 'Siguiente'}
          onPress={() => {
            if (isLast) { onDone(); return; }
            scrollRef.current?.scrollTo({ x: SCREEN_WIDTH * (index + 1), animated: true });
          }}
        />
      </View>
    </View>
  );
}

function ProgressDot({ active }: { active: boolean }) {
  const width = useSharedValue(active ? 32 : 20);
  useEffect(() => {
    width.value = withTiming(active ? 32 : 20, { duration: Motion.durationBase });
  }, [active]);
  const style = useAnimatedStyle(() => ({ width: width.value }));
  return <Animated.View style={[styles.dot, active && styles.dotActive, style]} />;
}

function StepSlide({ step, active }: { step: (typeof STEPS)[number]; active: boolean }) {
  return (
    <View style={styles.slide}>
      {active && (
        <Animated.View entering={FadeInDown.duration(500).delay(80)}>
          <OnboardingIllustration icon={step.icon} showSwipeHints={step === STEPS[0]} />
        </Animated.View>
      )}
      {active && (
        <Animated.View entering={FadeInDown.duration(450).delay(220)} style={styles.copy}>
          <ThemedText type="subtitle" style={styles.title}>{step.title}</ThemedText>
          <ThemedText style={styles.body}>{step.body}</ThemedText>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 60 },
  progressRow: { flexDirection: 'row', gap: 6, alignSelf: 'center', marginBottom: Spacing.two },
  dot: { height: 5, borderRadius: Radius.full, backgroundColor: 'rgba(255,255,255,0.2)' },
  dotActive: { backgroundColor: '#FAF9F9' },
  skip: { alignSelf: 'flex-end', color: '#B9C0C1', fontSize: 13, paddingHorizontal: Spacing.four, marginBottom: Spacing.two },
  scroll: { flex: 1 },
  slide: { width: SCREEN_WIDTH, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.five, gap: Spacing.four },
  copy: { alignItems: 'center', gap: Spacing.three },
  title: { color: '#FAF9F9', fontSize: 22, textAlign: 'center' },
  body: { color: '#B9C0C1', fontSize: 15, textAlign: 'center', lineHeight: 22 },
  footer: { paddingHorizontal: Spacing.five, paddingBottom: Spacing.five, paddingTop: Spacing.three },
});

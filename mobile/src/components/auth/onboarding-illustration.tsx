import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { Glyph, type GlyphKey } from '@/components/glyph';
import { ThemedText } from '@/components/themed-text';
import { Gold, Gradients, Petrol, Radius, Shadows, TextGold } from '@/constants/theme';

type Props = { icon: GlyphKey; showSwipeHints?: boolean };

/**
 * Port (not a copy-paste - re-implemented as native animation primitives) of
 * the swipe-hint card mockup from the Stitch prototype
 * (stitch_job_swipe_matcher/applica_bienvenida_1_3_m_vil/code.html): a
 * stacked-card illustration that wiggles left/right on a loop to teach the
 * swipe gesture before the user ever sees the real Feed, plus a shimmer
 * sweep across the header for a premium sheen. CSS keyframes -> Reanimated
 * withRepeat/withSequence; Tailwind depth stack -> two static offset Views.
 */
export function OnboardingIllustration({ icon, showSwipeHints = true }: Props) {
  const wiggleX = useSharedValue(0);
  const wiggleRotate = useSharedValue(0);
  const shimmer = useSharedValue(-1);

  useEffect(() => {
    wiggleX.value = withRepeat(
      withSequence(
        withTiming(22, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        withTiming(-22, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
    );
    wiggleRotate.value = withRepeat(
      withSequence(
        withTiming(5, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        withTiming(-5, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
    );
    shimmer.value = withRepeat(withTiming(1, { duration: 2200, easing: Easing.linear }), -1, false);
  }, []);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: wiggleX.value }, { rotate: `${wiggleRotate.value}deg` }],
  }));
  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shimmer.value * 140 }],
  }));

  return (
    <View style={styles.stage}>
      {/* Depth stack behind the animated card */}
      <View style={[styles.card, styles.depthFar]} />
      <View style={[styles.card, styles.depthNear]} />

      <Animated.View style={[styles.card, styles.topCard, cardStyle]}>
        <LinearGradient colors={Gradients.petrol} style={styles.cardHeader}>
          <Animated.View style={[styles.shimmer, shimmerStyle]} />
          <Glyph name={icon} size={40} color="rgba(255,255,255,0.9)" />
          <View style={styles.premiumBadge}>
            <ThemedText style={styles.premiumText}>PREMIUM</ThemedText>
          </View>
        </LinearGradient>
        <View style={styles.cardBody}>
          <View style={styles.skeletonLine} />
          <View style={[styles.skeletonLine, styles.skeletonLineShort]} />
          <View style={styles.cardFooterRow}>
            <View style={styles.avatarDot} />
            <ThemedText style={styles.checkIcon}>✓</ThemedText>
          </View>
        </View>
      </Animated.View>

      {showSwipeHints && (
        <>
          <View style={[styles.hint, styles.hintRight]}>
            <View style={[styles.hintCircle, styles.hintCircleYes]}>
              <ThemedText style={styles.hintIconYes}>→</ThemedText>
            </View>
            <ThemedText style={styles.hintLabelYes}>SI</ThemedText>
          </View>
          <View style={[styles.hint, styles.hintLeft]}>
            <View style={[styles.hintCircle, styles.hintCircleNo]}>
              <ThemedText style={styles.hintIconNo}>✕</ThemedText>
            </View>
            <ThemedText style={styles.hintLabelNo}>NO</ThemedText>
          </View>
        </>
      )}
    </View>
  );
}

const CARD_W = 200;
const CARD_H = 260;

const STAGE_W = CARD_W + 96;

const styles = StyleSheet.create({
  stage: { width: STAGE_W, height: 300, alignSelf: 'center', alignItems: 'center', justifyContent: 'center' },
  card: {
    position: 'absolute',
    width: CARD_W,
    height: CARD_H,
    borderRadius: Radius.xl,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  depthFar: { backgroundColor: 'rgba(255,255,255,0.35)', transform: [{ translateY: 18 }, { scale: 0.88 }] },
  depthNear: { backgroundColor: 'rgba(255,255,255,0.6)', transform: [{ translateY: 9 }, { scale: 0.94 }] },
  topCard: { ...Shadows.lg },
  cardHeader: { height: CARD_H * 0.38, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  shimmer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 60,
    backgroundColor: 'rgba(254,214,91,0.25)',
  },
  premiumBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: Gold,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  premiumText: { color: TextGold, fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  cardBody: { flex: 1, padding: 16, gap: 8 },
  skeletonLine: { height: 8, borderRadius: 4, backgroundColor: '#E3E2E2', width: '75%' },
  skeletonLineShort: { width: '45%', opacity: 0.6 },
  cardFooterRow: { marginTop: 'auto', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  avatarDot: { width: 22, height: 22, borderRadius: 11, backgroundColor: Gold },
  checkIcon: { color: '#10B981', fontSize: 18, fontWeight: '800' },
  hint: { position: 'absolute', top: '50%', marginTop: -24, alignItems: 'center', opacity: 0.55 },
  hintRight: { right: 0 },
  hintLeft: { left: 0 },
  hintCircle: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  hintCircleYes: { borderColor: Petrol },
  hintCircleNo: { borderColor: '#BA1A1A' },
  hintIconYes: { color: Petrol, fontSize: 18, fontWeight: '700' },
  hintIconNo: { color: '#BA1A1A', fontSize: 16, fontWeight: '700' },
  hintLabelYes: { color: Petrol, fontSize: 10, fontWeight: '800', marginTop: 4, letterSpacing: 0.5 },
  hintLabelNo: { color: '#BA1A1A', fontSize: 10, fontWeight: '800', marginTop: 4, letterSpacing: 0.5 },
});

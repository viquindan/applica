import * as Haptics from 'expo-haptics';
import { useEffect, useRef } from 'react';
import { Animated, Dimensions, Easing, PanResponder, StyleSheet, View } from 'react-native';

import { CompanyLogo } from '@/components/company-logo';
import { ThemedText } from '@/components/themed-text';
import { Gold, Radius, scoreBand, Spacing, TextGold } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { AppRow } from '@/types';
import { stripHtml } from '@/utils/html';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.28;

type Props = {
  app: AppRow;
  onSwipeRight: () => void;
  onSwipeLeft: () => void;
  onTap: () => void;
};

// Honest urgency: a heartbeat on the "decide" affordance. It pressures the
// DECISION (swipe or scroll on), it does not fabricate scarcity claims.
function UrgencyPulse({ color }: { color: string }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 700, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.delay(600),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const dotScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] });
  const haloScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] });
  const haloOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });

  return (
    <View style={styles.pulseRow}>
      <View style={styles.pulseDotWrap}>
        <Animated.View style={[styles.pulseHalo, { backgroundColor: color, transform: [{ scale: haloScale }], opacity: haloOpacity }]} />
        <Animated.View style={[styles.pulseDot, { backgroundColor: color, transform: [{ scale: dotScale }] }]} />
      </View>
      <ThemedText themeColor="text" style={styles.pulseText}>Vacante activa - decide ahora: desliza o sigue</ThemedText>
    </View>
  );
}

export function SwipeCard({ app, onSwipeRight, onSwipeLeft, onTap }: Props) {
  const pan = useRef(new Animated.ValueXY()).current;
  const lift = useRef(new Animated.Value(0)).current; // 0 = resting, 1 = lifted while dragging
  const startedAsTap = useRef(true);
  const crossedThreshold = useRef<'none' | 'left' | 'right'>('none');

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      // The Feed no longer has a competing vertical scroll (removed per user
      // feedback: it fought this gesture and made swiping feel sluggish) -
      // only one card renders at a time, so any deliberate horizontal drag
      // can claim the gesture immediately without a directional bias check.
      onMoveShouldSetPanResponder: (_evt, gesture) => Math.abs(gesture.dx) > 8,
      onPanResponderGrant: () => {
        startedAsTap.current = true;
        crossedThreshold.current = 'none';
        // The whole card runs on the JS driver, deliberately: the drag itself
        // is pan.setValue (JS by nature), and mixing it with native-driven
        // release springs on the same transform throws "Attempting to run JS
        // driven animation on animated node that has been moved to native" on
        // the SECOND gesture over a card. One driver everywhere = no conflict;
        // these are 220ms flings on a single card, JS keeps up fine.
        Animated.spring(lift, { toValue: 1, useNativeDriver: false, speed: 20, bounciness: 4 }).start();
      },
      onPanResponderMove: (_evt, gesture) => {
        if (Math.abs(gesture.dx) > 6) startedAsTap.current = false;
        pan.setValue({ x: gesture.dx, y: gesture.dy * 0.2 });

        const side = gesture.dx > SWIPE_THRESHOLD ? 'right' : gesture.dx < -SWIPE_THRESHOLD ? 'left' : 'none';
        if (side !== 'none' && crossedThreshold.current !== side) {
          crossedThreshold.current = side;
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        } else if (side === 'none') {
          crossedThreshold.current = 'none';
        }
      },
      onPanResponderRelease: (_evt, gesture) => {
        Animated.spring(lift, { toValue: 0, useNativeDriver: false, speed: 20, bounciness: 4 }).start();
        if (startedAsTap.current && Math.abs(gesture.dx) < 6 && Math.abs(gesture.dy) < 6) {
          onTap();
          Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
          return;
        }
        // After the fling callback, snap the position back to center. When the
        // action consumes the card the parent remounts a new one (keyed by app
        // id) and this is invisible; when it does NOT (LinkedIn just navigates
        // to the WebView and the same app stays first in queue), the card must
        // be back in place when the user returns.
        if (gesture.dx > SWIPE_THRESHOLD) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Animated.timing(pan, { toValue: { x: SCREEN_WIDTH + 100, y: gesture.dy }, duration: 220, useNativeDriver: false })
            .start(() => { onSwipeRight(); pan.setValue({ x: 0, y: 0 }); });
          return;
        }
        if (gesture.dx < -SWIPE_THRESHOLD) {
          Animated.timing(pan, { toValue: { x: -SCREEN_WIDTH - 100, y: gesture.dy }, duration: 220, useNativeDriver: false })
            .start(() => { onSwipeLeft(); pan.setValue({ x: 0, y: 0 }); });
          return;
        }
        Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
      },
    }),
  ).current;

  const rotate = pan.x.interpolate({ inputRange: [-SCREEN_WIDTH, 0, SCREEN_WIDTH], outputRange: ['-12deg', '0deg', '12deg'] });
  const nopeOpacity = pan.x.interpolate({ inputRange: [-SWIPE_THRESHOLD, 0], outputRange: [1, 0], extrapolate: 'clamp' });
  const likeOpacity = pan.x.interpolate({ inputRange: [0, SWIPE_THRESHOLD], outputRange: [0, 1], extrapolate: 'clamp' });
  const scale = lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] });

  const band = scoreBand(app.vacancy?.score);
  const theme = useTheme();

  return (
    <Animated.View
      {...panResponder.panHandlers}
      // The card's ONLY decision affordance is a swipe gesture (no ✕/✓
      // buttons) - accessibilityActions gives VoiceOver/TalkBack users an
      // equivalent way to apply/discard without performing the drag
      // themselves (gesture-alternative, WCAG 2.5.1).
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={`${app.vacancy?.title ?? 'Vacante'} en ${app.vacancy?.company ?? 'empresa'}${app.vacancy?.score != null ? `, ${Math.min(app.vacancy.score, 100)} por ciento de coincidencia` : ''}`}
      accessibilityHint="Desliza a la derecha para aplicar, a la izquierda para descartar, o activa dos veces para ver el detalle."
      accessibilityActions={[
        { name: 'activate', label: 'Ver detalle' },
        { name: 'apply', label: 'Aplicar' },
        { name: 'discard', label: 'Descartar' },
      ]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'apply') onSwipeRight();
        else if (event.nativeEvent.actionName === 'discard') onSwipeLeft();
        else if (event.nativeEvent.actionName === 'activate') onTap();
      }}
      style={[
        styles.card,
        // Themed, not hardcoded white: on a dark-themed device this used to
        // stay a stark white card with dark ink text (unreadable seam
        // against the rest of a dark-themed app). backgroundElement is the
        // same "elevated surface" token every other themed card in the app
        // already uses.
        { backgroundColor: theme.backgroundElement },
        // Score halo: green >=70, amber 50-69, red <50 (boxShadow needs the
        // new architecture, which this Expo SDK uses on both platforms).
        { borderColor: band.color, boxShadow: `0 10px 30px ${band.glow}` },
        { transform: [{ translateX: pan.x }, { translateY: pan.y }, { rotate }, { scale }] },
      ]}>
      <Animated.View style={[styles.stamp, styles.stampLike, { opacity: likeOpacity }]}>
        <ThemedText style={styles.stampText}>APLICAR</ThemedText>
      </Animated.View>
      <Animated.View style={[styles.stamp, styles.stampNope, { opacity: nopeOpacity }]}>
        <ThemedText style={[styles.stampText, styles.stampTextNope]}>NOPE</ThemedText>
      </Animated.View>

      <View style={styles.badgeRow}>
        {app.vacancy?.score != null && (
          <View style={[styles.scoreBadge, { backgroundColor: band.tint }]}>
            <ThemedText style={[styles.scoreBadgeText, { color: band.color }]}>
              {Math.min(app.vacancy.score, 100)}% de coincidencia
            </ThemedText>
          </View>
        )}
      </View>
      <View style={styles.headerRow}>
        <CompanyLogo companyName={app.vacancy?.company} />
        <View style={styles.headerText}>
          <ThemedText type="subtitle" style={styles.title}>{app.vacancy?.title ?? 'Vacante'}</ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.company}>{app.vacancy?.company}</ThemedText>
        </View>
      </View>
      {app.vacancy?.location ? <ThemedText themeColor="textSecondary" style={styles.meta}>{app.vacancy.location}</ThemedText> : null}
      {/* Shrinking the HUD above (feed-hud.tsx) frees real vertical room here -
          the whole point is showing more of the vacancy itself, so this grew
          from 12 to 16 lines to actually use that space instead of leaving it
          blank under a truncated description. */}
      <ThemedText themeColor="textSecondary" style={styles.description} numberOfLines={16}>
        {stripHtml(app.vacancy?.description ?? '')}
      </ThemedText>
      <View style={styles.footer}>
        <UrgencyPulse color={band.color} />
        <ThemedText themeColor="textSecondary" style={styles.hint}>Toca para ver el detalle</ThemedText>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.xl,
    borderWidth: 2,
    padding: Spacing.four,
    width: SCREEN_WIDTH - Spacing.four * 2,
    // Fills the space the ✕/✓ row used to take (removed - swipe is the only
    // decision gesture now) instead of floating centered with dead space
    // above/below. Resolves against `deck` (index.tsx), which is flex:1
    // between the HUD and the tab bar - near-100% so the card reaches down
    // close to the nav bar instead of leaving a visible gap.
    height: '99%',
    // Real bug (2026-07-20): a long description (up to 16 lines) plus a
    // long title could add up to more height than the card's fixed 99% -
    // without this, that overflow text rendered straight through the
    // rounded border instead of being clipped by it.
    overflow: 'hidden',
  },
  badgeRow: { flexDirection: 'row', marginBottom: Spacing.two },
  scoreBadge: { borderRadius: Radius.sm, paddingHorizontal: Spacing.two, paddingVertical: 4 },
  scoreBadgeText: { fontWeight: '700', fontSize: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  headerText: { flex: 1, minWidth: 0 },
  title: { fontSize: 22, marginBottom: 2 },
  company: { fontSize: 16, fontWeight: '600' },
  meta: { fontSize: 13, marginTop: 2 },
  description: { marginTop: Spacing.three, fontSize: 14, lineHeight: 20 },
  footer: { marginTop: 'auto', paddingTop: Spacing.three, gap: 6 },
  pulseRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pulseDotWrap: { width: 14, height: 14, alignItems: 'center', justifyContent: 'center' },
  pulseHalo: { position: 'absolute', width: 14, height: 14, borderRadius: 7 },
  pulseDot: { width: 8, height: 8, borderRadius: 4 },
  pulseText: { fontSize: 12, fontWeight: '600', flexShrink: 1 },
  hint: { fontSize: 11, textAlign: 'center' },
  stamp: {
    position: 'absolute',
    top: 24,
    borderWidth: 3,
    borderRadius: Radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 4,
    zIndex: 10,
  },
  stampLike: { right: 20, borderColor: Gold, transform: [{ rotate: '-12deg' }] },
  stampNope: { left: 20, borderColor: '#b91c1c', transform: [{ rotate: '12deg' }] },
  stampText: { fontSize: 22, fontWeight: '800', color: TextGold },
  stampTextNope: { color: '#b91c1c' },
});

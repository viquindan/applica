import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { Gold, GoldLight, Radius, Spacing } from '@/constants/theme';

const CONFETTI_COUNT = 26;
const COLORS = [Gold, GoldLight, '#fff2c9', '#2f9e63'];
const AUTO_DISMISS_MS = 2400;

function ConfettiPiece({ index }: { index: number }) {
  const fall = useSharedValue(0);
  const left = (index * 37) % 100;
  const delay = (index % 8) * 70;
  const duration = 1600 + (index % 5) * 180;
  const rotateDeg = 180 + (index % 6) * 60;

  useEffect(() => {
    fall.value = withDelay(delay, withTiming(1, { duration, easing: Easing.linear }));
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: 1 - fall.value * 0.85,
    transform: [
      { translateY: fall.value * 420 },
      { rotate: `${fall.value * rotateDeg}deg` },
    ],
  }));

  return (
    <Animated.View
      style={[
        styles.confetti,
        { left: `${left}%`, backgroundColor: COLORS[index % COLORS.length] },
        style,
      ]}
    />
  );
}

type Props = {
  visible: boolean;
  title: string;
  subtitle: string;
  onDone: () => void;
};

/**
 * Full-screen moment, not a corner burst - reserved for the two REAL
 * milestones this app has (closing today's goal, hitting a streak
 * milestone), never per-swipe (that would cheapen it into noise, the
 * opposite of "rare + positive = delight" from the animation-decision
 * framework already used for CelebrationBurst).
 */
export function MilestoneCelebration({ visible, title, subtitle, onDone }: Props) {
  useEffect(() => {
    if (!visible) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    AccessibilityInfo.announceForAccessibility(`${title}. ${subtitle}`);
    const t = setTimeout(onDone, AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [visible]);

  if (!visible) return null;

  return (
    <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(200)} style={styles.overlay}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onDone} accessibilityRole="button" accessibilityLabel="Cerrar">
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {Array.from({ length: CONFETTI_COUNT }, (_, i) => <ConfettiPiece key={i} index={i} />)}
        </View>
        <View style={styles.center}>
          <Animated.View entering={FadeIn.duration(360).delay(80)} style={styles.card}>
            <ThemedText style={styles.title}>{title}</ThemedText>
            <ThemedText style={styles.subtitle}>{subtitle}</ThemedText>
          </Animated.View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 50,
    backgroundColor: 'rgba(12,34,38,0.92)',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.five },
  card: {
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: Spacing.five,
    paddingVertical: Spacing.four,
    borderRadius: Radius.xl,
    backgroundColor: 'rgba(254,214,91,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(254,214,91,0.25)',
  },
  title: { color: '#FAF9F9', fontSize: 22, fontWeight: '800', textAlign: 'center' },
  subtitle: { color: '#d7dcdc', fontSize: 14, textAlign: 'center', marginTop: 2 },
  confetti: { position: 'absolute', top: -20, width: 8, height: 12, borderRadius: 2 },
});

import { forwardRef, useImperativeHandle } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Gold, GoldLight } from '@/constants/theme';

const PARTICLE_COUNT = 10;
const COLORS = [Gold, GoldLight, '#fff2c9'];

export type CelebrationBurstHandle = { fire: () => void };

// Each particle is its own component (not a custom hook called in a loop -
// that produced a real "Invalid hook call" crash: React requires every hook
// call to belong to a single component's own top-level render, and a loop
// inside ONE component calling useSharedValue N times breaks that; N
// sibling components each calling it once is fine).
function Particle({ index, trigger }: { index: number; trigger: ReturnType<typeof useSharedValue<number>> }) {
  const progress = useSharedValue(0);
  const started = useSharedValue(0);
  const angle = (index / PARTICLE_COUNT) * Math.PI * 2;
  const distance = 60 + (index % 3) * 18;

  useAnimatedReaction(
    () => trigger.value,
    (value, prev) => {
      if (value === prev || value === 0) return;
      started.value = 1;
      progress.value = 0;
      progress.value = withTiming(1, { duration: 650, easing: Easing.out(Easing.cubic) });
    },
  );

  const style = useAnimatedStyle(() => {
    const tx = Math.cos(angle) * distance * progress.value;
    const ty = Math.sin(angle) * distance * progress.value;
    return {
      opacity: started.value * (1 - progress.value),
      transform: [
        { translateX: tx },
        { translateY: ty },
        { scale: 1 - progress.value * 0.6 },
      ],
    };
  });

  return <Animated.View style={[styles.particle, { backgroundColor: COLORS[index % COLORS.length] }, style]} />;
}

/**
 * A "you did it" burst - fired on a genuinely rare, positive event (a
 * successful apply), not on every swipe. Per the animation-decision framework
 * (emil-design-eng skill): rare + positive = delight is earned here.
 */
export const CelebrationBurst = forwardRef<CelebrationBurstHandle>((_props, ref) => {
  const trigger = useSharedValue(0);

  useImperativeHandle(ref, () => ({
    fire: () => {
      trigger.value = Date.now();
    },
  }));

  return (
    <View pointerEvents="none" style={styles.container}>
      {Array.from({ length: PARTICLE_COUNT }, (_, i) => (
        <Particle key={i} index={i} trigger={trigger} />
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  particle: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});

import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useEffect } from 'react';

import { ThemedText } from '@/components/themed-text';
import { Gradients, GoldDim, Motion, Petrol, Radius } from '@/constants/theme';

type Props = { current: number; goal: number };

export function GoalProgress({ current, goal }: Props) {
  const pct = useSharedValue(0);
  const ratio = goal > 0 ? Math.min(current / goal, 1) : 0;

  useEffect(() => {
    pct.value = withTiming(ratio, { duration: Motion.durationSlow });
  }, [ratio]);

  const barStyle = useAnimatedStyle(() => ({ width: `${pct.value * 100}%` }));

  if (!goal) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.labelRow}>
        <ThemedText style={styles.label}>Meta de hoy</ThemedText>
        <ThemedText style={styles.count}>{current}/{goal}</ThemedText>
      </View>
      <View style={styles.track}>
        <Animated.View style={[styles.fillWrap, barStyle]}>
          <LinearGradient colors={Gradients.gold} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.fill} />
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { color: '#5c6366', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '700' },
  count: { color: Petrol, fontSize: 11, fontWeight: '700' },
  track: { height: 6, borderRadius: Radius.full, backgroundColor: GoldDim, overflow: 'hidden' },
  fillWrap: { height: '100%' },
  fill: { flex: 1, borderRadius: Radius.full },
});

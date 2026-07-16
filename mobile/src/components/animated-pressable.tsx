import * as Haptics from 'expo-haptics';
import { type ReactNode } from 'react';
import { Pressable, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { Motion } from '@/constants/theme';

const AnimatedView = Animated.createAnimatedComponent(Pressable);

type Props = {
  children: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  haptic?: 'light' | 'medium' | 'none';
  style?: StyleProp<ViewStyle>;
  /** Required for icon-only / non-obvious controls - read aloud by VoiceOver/TalkBack. */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  hitSlop?: number | { top?: number; bottom?: number; left?: number; right?: number };
};

/**
 * Every tappable surface in the app should go through this instead of raw
 * onTouchEnd (which gives zero feedback - the flat, "dead" feel that was the
 * core complaint). Responds on press-IN, not release (apple-design skill:
 * "respond on pointer-down, not on release"), settles with a critically-
 * damped spring (no bounce - reserved for momentum gestures elsewhere).
 */
export function AnimatedPressable({ children, onPress, disabled, haptic = 'light', style, accessibilityLabel, accessibilityHint, hitSlop }: Props) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedView
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={hitSlop}
      onPressIn={() => {
        scale.value = withSpring(0.96, Motion.springSettle);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, Motion.springSettle);
      }}
      onPress={() => {
        if (haptic !== 'none') {
          Haptics.impactAsync(haptic === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
        }
        onPress?.();
      }}
      style={[animatedStyle, disabled && { opacity: 0.6 }, style]}>
      {children}
    </AnimatedView>
  );
}

import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { GradientButton } from '@/components/gradient-button';
import { Glyph, type GlyphKey } from '@/components/glyph';
import { ThemedText } from '@/components/themed-text';
import { GoldDim, Petrol, Radius, Spacing, TextGold } from '@/constants/theme';

type Props = {
  icon: GlyphKey;
  title: string;
  subtitle: string;
  actionLabel?: string;
  onAction?: () => void;
  children?: ReactNode;
};

/**
 * Shared empty-state layout: a filled container instead of blank space, so an
 * empty Pendientes/Apps reads as "you're caught up" (a positive game state),
 * not "something's missing". `children` lets a screen slot in its own stat
 * card (streak, goal) below the copy.
 */
export function EmptyState({ icon, title, subtitle, actionLabel, onAction, children }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.glyphCircle}>
        <Glyph name={icon} size={32} color={TextGold} />
      </View>
      <ThemedText style={styles.title}>{title}</ThemedText>
      <ThemedText style={styles.subtitle}>{subtitle}</ThemedText>
      {children}
      {actionLabel && onAction ? (
        <View style={styles.actionWrap}>
          <GradientButton label={actionLabel} onPress={onAction} variant="secondary" />
        </View>
      ) : null}
    </View>
  );
}

export function StatPill({ value, label, icon }: { value: string | number; label: string; icon?: GlyphKey }) {
  return (
    <View style={styles.pill}>
      {icon ? <Glyph name={icon} size={13} color={TextGold} /> : null}
      <ThemedText style={styles.pillValue}>{value}</ThemedText>
      <ThemedText style={styles.pillLabel}>{label}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two, padding: Spacing.five },
  glyphCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: GoldDim,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing.one,
  },
  title: { color: Petrol, fontSize: 17, fontWeight: '800', textAlign: 'center' },
  subtitle: { color: '#5c6366', fontSize: 13.5, textAlign: 'center', maxWidth: 260, lineHeight: 19 },
  actionWrap: { marginTop: Spacing.three, minWidth: 180 },
  pill: {
    flexDirection: 'row', alignItems: 'baseline', gap: 6,
    backgroundColor: '#FFFFFF', borderRadius: Radius.full,
    paddingHorizontal: Spacing.three, paddingVertical: 8,
    borderWidth: 1, borderColor: '#eeeeed',
  },
  pillValue: { color: TextGold, fontWeight: '800', fontSize: 15 },
  pillLabel: { color: '#5c6366', fontSize: 12 },
});

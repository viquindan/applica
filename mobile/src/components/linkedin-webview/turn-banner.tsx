import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Gold, Radius, Spacing, TextGold } from '@/constants/theme';

// Native overlay equivalent of the web app's in-page __applica_bar banner
// (docs/APPLY-ENGINE.md: "banner evalúa el captcha PRIMERO... Tu turno") -
// simpler here since RN can render real UI on top of the WebView instead of
// injecting a DOM banner into the page itself.
export function TurnBanner({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <View style={styles.banner}>
      <ThemedText style={styles.title}>Tu turno</ThemedText>
      <ThemedText style={styles.body}>
        LinkedIn pide una verificación de seguridad. Resuélvela aquí abajo y Applica retoma solo.
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: Gold,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderBottomLeftRadius: Radius.md,
    borderBottomRightRadius: Radius.md,
    zIndex: 20,
  },
  title: { color: TextGold, fontWeight: '800', fontSize: 14 },
  body: { color: TextGold, fontSize: 12, marginTop: 2 },
});

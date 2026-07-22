import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { getLiveSession } from '@/api/liveSession';
import { BASE_URL } from '@/api/client';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Petrol, Spacing } from '@/constants/theme';

// Live view/control of an assisted-apply browser stuck on a captcha, over
// noVNC (docs/APPLY-ENGINE.md §4/§5 + live-session plan, 2026-07-22). The URL
// itself is short-lived (signed, 5 min TTL) and scoped to exactly this
// application's pool slot - minted fresh here rather than passed in as a
// param, so navigating back and re-entering always gets a valid one.
export default function AssistedViewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [state, setState] = useState<'loading' | 'live' | 'gone'>('loading');
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getLiveSession(id)
      .then((data) => {
        if (cancelled) return;
        if (data.live && data.url) {
          setUri(`${BASE_URL}${data.url}`);
          setState('live');
        } else {
          setState('gone');
        }
      })
      .catch(() => !cancelled && setState('gone'));
    return () => { cancelled = true; };
  }, [id]);

  if (state === 'loading') {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ActivityIndicator color={Petrol} />
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (state === 'gone' || !uri) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ThemedText type="subtitle" style={styles.title}>Sesión no disponible</ThemedText>
          <ThemedText style={styles.body}>
            Esta sesión ya terminó o venció (dura hasta 15 minutos). Vuelve a Pendientes - si sigue esperando, Applica reintentará más tarde.
          </ThemedText>
          <ThemedText onPress={() => router.back()} accessibilityRole="button" style={styles.back}>Volver</ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <WebView source={{ uri }} style={styles.webview} />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four },
  webview: { flex: 1 },
  title: { color: Petrol, marginTop: Spacing.six },
  body: { color: '#414849', marginTop: Spacing.two, lineHeight: 20 },
  back: { color: Petrol, fontWeight: '700', marginTop: Spacing.four },
});

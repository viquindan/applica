import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getLinkedInMaterials } from '@/api/linkedin-materials';
import { LinkedInWebView } from '@/components/linkedin-webview';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Petrol, Spacing } from '@/constants/theme';
import { useApplicationActions, useApplicationsData } from '@/hooks/use-applications';

export default function LinkedInApplyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { apps } = useApplicationsData();
  const { markApplied } = useApplicationActions();
  const app = apps.find((a) => a.id === id);
  const [done, setDone] = useState<'submitted' | 'no_easy_apply' | null>(null);

  const { data: materials, isLoading } = useQuery({
    queryKey: ['linkedin-materials', app?.vacancy?.url],
    queryFn: () => getLinkedInMaterials(app!.vacancy!.url),
    enabled: !!app?.vacancy?.url,
  });

  if (!app?.vacancy?.url) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ThemedText>No se encontró la vacante.</ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (isLoading || !materials) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ActivityIndicator color={Petrol} />
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (done === 'submitted') {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ThemedText type="subtitle" style={styles.title}>Aplicación enviada</ThemedText>
          <ThemedText style={styles.body}>Applica completó y envió tu Easy Apply en LinkedIn.</ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (done === 'no_easy_apply') {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ThemedText type="subtitle" style={styles.title}>Sin Easy Apply</ThemedText>
          <ThemedText style={styles.body}>
            Esta vacante no usa Easy Apply. Puedes seguir en la página para aplicar manualmente.
          </ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  const answers = {
    ...(materials.answers ?? {}),
    ...(materials.profile?.phone ? { phone: materials.profile.phone } : {}),
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <LinkedInWebView
          jobUrl={app.vacancy.url}
          initialAnswers={answers}
          onSubmitted={() => {
            setDone('submitted');
            markApplied.mutate(app);
            setTimeout(() => router.back(), 1500);
          }}
          onNoEasyApply={() => setDone('no_easy_apply')}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four },
  title: { color: Petrol, marginTop: Spacing.six },
  body: { color: '#414849', marginTop: Spacing.two },
});

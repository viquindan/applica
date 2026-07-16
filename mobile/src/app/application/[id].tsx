import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Gold, Petrol, Radius, Spacing, TextGold } from '@/constants/theme';
import { isLinkedIn, useApplicationActions, useApplicationsData } from '@/hooks/use-applications';

export default function ApplicationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { apps } = useApplicationsData();
  const { applyApp, applyAnyway } = useApplicationActions();
  const [preparing, setPreparing] = useState(false);
  const app = apps.find((a) => a.id === id);

  if (!app) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ThemedText>No se encontró la aplicación.</ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  // No application row was ever created (score below the auto-generate
  // threshold) - "id"/"vacancyId" are the same vacancy id in that case.
  const vacancyOnly = app.mode === 'none';
  const isDiscarded = !vacancyOnly && app.status !== 'pending_review';

  async function onApplyAnyway() {
    setPreparing(true);
    try {
      const result = await applyAnyway.mutateAsync(app!.vacancyId);
      if (result.applicationId) router.replace(`/application/${result.applicationId}`);
    } finally {
      setPreparing(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scroll}>
          {app.vacancy?.score != null && (
            <View style={styles.scoreBadge}>
              <ThemedText style={styles.scoreBadgeText}>{app.vacancy.score}% de coincidencia</ThemedText>
            </View>
          )}
          <ThemedText type="title" style={styles.title}>{app.vacancy?.title}</ThemedText>
          <ThemedText style={styles.company}>{app.vacancy?.company}</ThemedText>
          {app.vacancy?.location ? <ThemedText style={styles.meta}>{app.vacancy.location}</ThemedText> : null}
          <ThemedText style={styles.meta}>Plataforma: {app.vacancy?.platform}</ThemedText>

          {app.vacancy?.description ? (
            <ThemedText style={styles.description}>{app.vacancy.description}</ThemedText>
          ) : null}

          {app.status === 'pending_review' && (
            <ThemedText
              onPress={() => (isLinkedIn(app) ? router.push(`/linkedin-apply/${app.id}`) : applyApp(app))}
              style={styles.applyButton}>
              Aplicar
            </ThemedText>
          )}

          {vacancyOnly ? (
            <View style={styles.card}>
              <ThemedText style={styles.cardTitle}>Esta vacante quedó por debajo del umbral recomendado</ThemedText>
              <ThemedText style={styles.cardBody}>
                No preparamos CV ni carta automáticamente para vacantes de bajo puntaje. Si te interesa igual,
                aplica de todos modos y preparamos todo para que la envíes como cualquier otra.
              </ThemedText>
              <ThemedText onPress={preparing ? undefined : onApplyAnyway} style={[styles.applyButton, preparing && styles.applyButtonDisabled]}>
                {preparing ? 'Preparando materiales…' : 'Aplicar de todos modos'}
              </ThemedText>
              {app.vacancy?.url ? (
                <ThemedText onPress={() => Linking.openURL(app.vacancy!.url)} style={styles.linkButton}>
                  Ir a la oferta
                </ThemedText>
              ) : null}
            </View>
          ) : isDiscarded && app.vacancy?.url ? (
            <View style={styles.card}>
              <ThemedText style={styles.cardTitle}>Aplica manualmente</ThemedText>
              <ThemedText style={styles.cardBody}>
                Esta aplicación no sigue en el flujo automático. Puedes abrir la oferta y postularte tú mismo en el sitio.
              </ThemedText>
              <ThemedText onPress={() => Linking.openURL(app.vacancy!.url)} style={styles.linkButton}>
                Ir a la oferta
              </ThemedText>
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  scroll: { padding: Spacing.four, gap: Spacing.two },
  scoreBadge: { alignSelf: 'flex-start', backgroundColor: 'rgba(254,214,91,0.2)', borderRadius: Radius.sm, paddingHorizontal: Spacing.two, paddingVertical: 4, marginBottom: Spacing.two },
  scoreBadgeText: { color: '#735c00', fontWeight: '700', fontSize: 12 },
  title: { fontSize: 24, color: Petrol },
  company: { fontSize: 16, color: '#414849', fontWeight: '600' },
  meta: { fontSize: 13, color: '#5c6366' },
  description: { fontSize: 14, color: '#414849', lineHeight: 21, marginTop: Spacing.three },
  applyButton: {
    marginTop: Spacing.five,
    backgroundColor: Gold,
    color: TextGold,
    fontWeight: '700',
    textAlign: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  applyButtonDisabled: { opacity: 0.6 },
  card: { marginTop: Spacing.five, backgroundColor: '#FFFFFF', borderRadius: Radius.md, padding: Spacing.four, gap: Spacing.two },
  cardTitle: { fontSize: 15, fontWeight: '700', color: Petrol },
  cardBody: { fontSize: 13, color: '#5c6366', lineHeight: 19 },
  linkButton: {
    marginTop: Spacing.two,
    color: Petrol,
    fontWeight: '700',
    textAlign: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Petrol,
    overflow: 'hidden',
  },
});

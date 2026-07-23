import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Glyph } from '@/components/glyph';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Gold, Petrol, Radius, Spacing, TextGold } from '@/constants/theme';
import { isLinkedIn, useApplicationActions, useApplicationsData } from '@/hooks/use-applications';
import { useTheme } from '@/hooks/use-theme';
import { stripHtml } from '@/utils/html';

type SendState = 'idle' | 'sending' | 'sent';

export default function ApplicationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { apps } = useApplicationsData();
  const { applyApp, applyAnyway, actionError } = useApplicationActions();
  const [preparing, setPreparing] = useState(false);
  const [sendState, setSendState] = useState<SendState>('idle');
  const theme = useTheme();
  const app = apps.find((a) => a.id === id);

  // The mutation itself already surfaces the real backend error (unresolved
  // blockers, already approved, etc.) via actionError - this is what was
  // missing: nothing displayed it, so a failed "Aplicar" looked identical to
  // a successful one (both did nothing visible).
  useEffect(() => {
    if (actionError) Alert.alert('No se pudo aplicar', actionError);
  }, [actionError]);

  // Same "instant, don't wait" contract as the Feed swipe (index.tsx) - the
  // real send (headless attempt, possible escalation to the assisted real
  // browser) can take a while, and this screen used to sit on "Enviando..."
  // for that whole round trip, unlike the swipe which moves on immediately
  // and lets the result surface later via push notification + Pendientes.
  // applyApp fires the mutation without awaiting it (react-query .mutate,
  // not .mutateAsync) - the spinner->check below is a LOCAL ~1.6s
  // acknowledgment, not a wait on the real result (which still surfaces via
  // Pendientes/push per the user's explicit design decision).
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => { timers.current.forEach(clearTimeout); }, []);

  function onApplyPress() {
    if (!app) return;
    if (isLinkedIn(app)) {
      router.push(`/linkedin-apply/${app.id}`);
      return;
    }
    const reason = applyApp(app);
    if (reason) { Alert.alert('Todavia no se puede aplicar', reason); return; }
    setSendState('sending');
    timers.current.push(setTimeout(() => setSendState('sent'), 900));
    timers.current.push(setTimeout(() => router.back(), 1900));
  }

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
          <ThemedText themeColor="textSecondary" style={styles.company}>{app.vacancy?.company}</ThemedText>
          {app.vacancy?.location ? <ThemedText themeColor="textSecondary" style={styles.meta}>{app.vacancy.location}</ThemedText> : null}
          <ThemedText themeColor="textSecondary" style={styles.meta}>Plataforma: {app.vacancy?.platform}</ThemedText>

          {app.vacancy?.description ? (
            <ThemedText style={[styles.description, { color: theme.text }]}>{stripHtml(app.vacancy.description)}</ThemedText>
          ) : null}

          {app.status === 'pending_review' && (
            <View
              onTouchEnd={sendState === 'idle' ? onApplyPress : undefined}
              style={[styles.applyButtonView, sendState === 'sent' && styles.applyButtonSent]}>
              {sendState === 'sending' ? (
                <ActivityIndicator color={TextGold} size="small" />
              ) : sendState === 'sent' ? (
                <Glyph name="check" size={18} color={Petrol} />
              ) : null}
              <ThemedText style={[styles.applyButtonText, sendState === 'sent' && styles.applyButtonSentText]}>
                {sendState === 'sending' ? 'Enviando' : sendState === 'sent' ? 'Enviado' : 'Aplicar'}
              </ThemedText>
            </View>
          )}

          {vacancyOnly ? (
            <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText style={styles.cardTitle}>Esta vacante quedó por debajo del umbral recomendado</ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.cardBody}>
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
            <View style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
              <ThemedText style={styles.cardTitle}>Aplica manualmente</ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.cardBody}>
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
  title: { fontSize: 24 },
  company: { fontSize: 16, fontWeight: '600' },
  meta: { fontSize: 13 },
  description: { fontSize: 14, lineHeight: 21, marginTop: Spacing.three },
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
  applyButtonView: {
    marginTop: Spacing.five,
    backgroundColor: Gold,
    paddingVertical: Spacing.three,
    borderRadius: Radius.full,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  // A quiet green tint (not Gold) reads as "done", distinct from the
  // action-pending color the button had a second earlier.
  applyButtonSent: { backgroundColor: '#dff3e6' },
  applyButtonText: { color: TextGold, fontWeight: '700', fontSize: 15 },
  applyButtonSentText: { color: Petrol },
  card: { marginTop: Spacing.five, borderRadius: Radius.md, padding: Spacing.four, gap: Spacing.two },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  cardBody: { fontSize: 13, lineHeight: 19 },
  // Gold, not Petrol: an outlined petrol border/text on a dark-themed card
  // was nearly invisible (petrol is close to the dark background color
  // itself). Gold is the app's theme-neutral accent everywhere else.
  linkButton: {
    marginTop: Spacing.two,
    color: TextGold,
    fontWeight: '700',
    textAlign: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Gold,
    overflow: 'hidden',
  },
});

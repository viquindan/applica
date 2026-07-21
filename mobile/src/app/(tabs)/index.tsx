import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { runSearch } from '@/api/applications';
import { postSwipeFeedback, type SwipeDecision } from '@/api/swipeFeedback';
import { EmptyState, StatPill } from '@/components/empty-state';
import { CelebrationBurst, type CelebrationBurstHandle } from '@/components/gamification/celebration-burst';
import { FeedHud } from '@/components/gamification/feed-hud';
import { MilestoneCelebration } from '@/components/gamification/milestone-celebration';
import { SearchingPanel } from '@/components/gamification/searching-panel';
import { SwipeCard } from '@/components/swipe-card';
import { SwipeReasonSheet } from '@/components/swipe-reason-sheet';
import { ThemedView } from '@/components/themed-view';
import { Gold, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { isLinkedIn, useApplicationActions, useApplicationsData } from '@/hooks/use-applications';
import { useSearchStatus } from '@/hooks/use-search-status';
import { useStreak } from '@/hooks/use-streak';
import type { AppRow } from '@/types';

// Same milestones as the streak-progress path screen - kept in lockstep by
// hand since they express the same idea (racha) in two different places.
const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100];

export default function FeedScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const tuningEnabled = !!user?.searchTuningEnabled;
  const { queueApps, isLoading, refetch, isRefetching, stats, settings } = useApplicationsData();
  const { applyApp, discardApp } = useApplicationActions();
  // Deliberate UX decision (2026-07-21, per user): the Feed swipe must stay
  // silent even on failure - no interrupting alert. A failed send should
  // surface in Pendientes instead, not as a popup mid-swipe. The mutations
  // still capture `actionError` (used by application/[id].tsx) - just not
  // read here.
  const streak = useStreak();
  const celebrationRef = useRef<CelebrationBurstHandle>(null);
  const [searchState, setSearchState] = useState<'idle' | 'queuing' | 'queued'>('idle');
  // Motor de afinamiento (docs/SEARCH-ENGINE.md): mientras esto no sea null,
  // el swipe está "en pausa" esperando el motivo obligatorio antes de que
  // applyOrOpenLinkedIn/handleDiscard corran de verdad. Solo se usa cuando
  // tuningEnabled es true - para cualquier otra cuenta el flujo es idéntico
  // al de siempre.
  const [pendingReason, setPendingReason] = useState<{ app: AppRow; decision: SwipeDecision } | null>(null);
  const [submittingReason, setSubmittingReason] = useState(false);
  // No vertical scroll/paging anymore (removed per user feedback: it fought
  // the horizontal swipe gesture and made swiping feel sluggish). Only the
  // top card renders; swiping it away reveals the next one directly. Hiding
  // the just-swiped id locally makes that feel instant - the mutation itself
  // (applyApp/discardApp) settles via a refetch that can take a moment, and
  // without this the deck would show a blank gap or the same card again
  // until that round-trip completes.
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [celebration, setCelebration] = useState<{ title: string; subtitle: string } | null>(null);
  const prevAppliedToday = useRef<number | null>(null);
  const prevStreak = useRef<number | null>(null);

  // Always polled (not just after our own trigger) so the button correctly
  // disables if a search is already running server-side - e.g. a scheduled
  // run, or the user tapping Actualizar from another device. Without this,
  // nothing stops firing a second overlapping search job that then fights
  // the first one for the same Chromium/AI-limiter resources.
  const { data: searchStatus } = useSearchStatus(true);
  const backendSearching = searchStatus?.searchInProgress ?? false;
  const searching = searchState === 'queuing' || isRefetching || backendSearching;

  const dailyGoal = settings?.maxApplicationsPerDay ?? 10;
  const appliedToday = stats?.appliedToday ?? 0;

  // Full-screen celebration reserved for two REAL milestones - closing
  // today's goal, hitting a streak milestone - never per-swipe (that's what
  // CelebrationBurst, the small corner burst, already covers). Refs (not
  // state) track "already celebrated" so a refetch that returns the SAME
  // numbers never re-fires it, only an actual crossing does.
  useEffect(() => {
    if (prevAppliedToday.current !== null && dailyGoal > 0
      && prevAppliedToday.current < dailyGoal && appliedToday >= dailyGoal) {
      setCelebration({ title: 'Meta de hoy cerrada', subtitle: `${appliedToday} de ${dailyGoal} aplicaciones. Sigue asi.` });
    }
    prevAppliedToday.current = appliedToday;
  }, [appliedToday, dailyGoal]);

  useEffect(() => {
    if (streak != null && prevStreak.current != null && streak !== prevStreak.current
      && STREAK_MILESTONES.includes(streak)) {
      setCelebration({ title: `Racha de ${streak} dias`, subtitle: 'Cada dia te acerca mas a tu proximo trabajo.' });
    }
    prevStreak.current = streak;
  }, [streak]);

  // Queues a REAL backend search job (the worker scrapes ATS/LinkedIn), then
  // refetches. A bare refetch() would only re-read what the last search found.
  async function onSearchNow() {
    if (searchState === 'queuing' || backendSearching) return;
    setSearchState('queuing');
    try {
      await runSearch();
      setSearchState('queued');
      setTimeout(() => setSearchState('idle'), 20000);
    } catch {
      setSearchState('idle');
    }
    refetch();
  }

  // LinkedIn has no automated action route (no headless engine on mobile) -
  // it opens the dedicated WebView screen instead of the generic apply call.
  function applyOrOpenLinkedIn(app: AppRow) {
    setHiddenIds((prev) => new Set(prev).add(app.id));
    if (isLinkedIn(app)) {
      router.push(`/linkedin-apply/${app.id}`);
      return;
    }
    celebrationRef.current?.fire();
    applyApp(app);
  }

  function handleDiscard(app: AppRow) {
    setHiddenIds((prev) => new Set(prev).add(app.id));
    discardApp(app);
  }

  async function handleReasonSubmit(reason: string) {
    if (!pendingReason) return;
    const { app, decision } = pendingReason;
    setSubmittingReason(true);
    try {
      await postSwipeFeedback({ vacancyId: app.vacancyId, applicationId: app.id, decision, reason });
    } catch {
      // Best-effort: un fallo al guardar el motivo no debe bloquear el swipe real.
    }
    setSubmittingReason(false);
    setPendingReason(null);
    if (decision === 'positive') applyOrOpenLinkedIn(app);
    else handleDiscard(app);
  }

  function handleReasonCancel() {
    setPendingReason(null);
  }

  const visibleQueue = queueApps.filter((a) => !hiddenIds.has(a.id));
  const current = visibleQueue[0];

  // The "informing" search animation (radar + rotating phrases) fills the deck
  // whenever there's real backend work to show for - not just our own local
  // button state, so it also appears if a scheduled search is already running
  // when the user opens the app.
  const showSearchingPanel = !visibleQueue.length && (searching || backendSearching);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <FeedHud
          queueCount={visibleQueue.length}
          foundTodayCount={stats?.today ?? 0}
          submittedTotal={stats?.submitted ?? 0}
          appliedTodayCount={appliedToday}
          dailyGoal={dailyGoal}
          streak={streak}
          searching={searching}
          statusText={searchState === 'queued' ? 'Busqueda en marcha, los resultados llegan en unos minutos' : null}
          onRefresh={onSearchNow}
        />

        <View style={styles.deck}>
          {isLoading ? (
            <ActivityIndicator color={Gold} size="large" style={styles.centered} />
          ) : current ? (
            <SwipeCard
              // Keyed per application: SwipeCard keeps its fling position in a
              // ref, so a reused instance would render the NEXT card still
              // translated off-screen (found live: queue said 2, deck empty).
              key={current.id}
              app={current}
              onTap={() => router.push(`/application/${current.id}`)}
              onSwipeRight={() => (tuningEnabled ? setPendingReason({ app: current, decision: 'positive' }) : applyOrOpenLinkedIn(current))}
              onSwipeLeft={() => (tuningEnabled ? setPendingReason({ app: current, decision: 'negative' }) : handleDiscard(current))}
            />
          ) : showSearchingPanel ? (
            <SearchingPanel status={searchStatus} />
          ) : (
            <EmptyState
              icon="target"
              title="Vas al dia"
              subtitle="No hay vacantes nuevas por ahora. Actualiza para lanzar otra busqueda o vuelve mas tarde."
              actionLabel="Buscar ahora"
              onAction={onSearchNow}>
              {streak && streak > 0 ? (
                <View style={styles.streakRow}>
                  <StatPill icon="flame" value={streak} label="racha de dias" />
                </View>
              ) : null}
            </EmptyState>
          )}
          <CelebrationBurst ref={celebrationRef} />
        </View>
        <MilestoneCelebration
          visible={!!celebration}
          title={celebration?.title ?? ''}
          subtitle={celebration?.subtitle ?? ''}
          onDone={() => setCelebration(null)}
        />
        <SwipeReasonSheet
          visible={!!pendingReason}
          decision={pendingReason?.decision ?? null}
          submitting={submittingReason}
          onSubmit={handleReasonSubmit}
          onCancel={handleReasonCancel}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  deck: { flex: 1, marginTop: Spacing.one, alignItems: 'center', justifyContent: 'center' },
  centered: { flex: 1, alignSelf: 'center' },
  streakRow: { marginTop: Spacing.one },
});

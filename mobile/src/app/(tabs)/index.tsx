import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { runSearch } from '@/api/applications';
import { EmptyState, StatPill } from '@/components/empty-state';
import { CelebrationBurst, type CelebrationBurstHandle } from '@/components/gamification/celebration-burst';
import { FeedHud } from '@/components/gamification/feed-hud';
import { SearchingPanel } from '@/components/gamification/searching-panel';
import { SwipeCard } from '@/components/swipe-card';
import { ThemedView } from '@/components/themed-view';
import { Gold, Spacing } from '@/constants/theme';
import { isLinkedIn, useApplicationActions, useApplicationsData } from '@/hooks/use-applications';
import { useSearchStatus } from '@/hooks/use-search-status';
import { useStreak } from '@/hooks/use-streak';
import type { AppRow } from '@/types';

export default function FeedScreen() {
  const router = useRouter();
  const { queueApps, isLoading, refetch, isRefetching, stats, settings } = useApplicationsData();
  const { applyApp, discardApp } = useApplicationActions();
  const streak = useStreak();
  const celebrationRef = useRef<CelebrationBurstHandle>(null);
  const [searchState, setSearchState] = useState<'idle' | 'queuing' | 'queued'>('idle');
  // No vertical scroll/paging anymore (removed per user feedback: it fought
  // the horizontal swipe gesture and made swiping feel sluggish). Only the
  // top card renders; swiping it away reveals the next one directly. Hiding
  // the just-swiped id locally makes that feel instant - the mutation itself
  // (applyApp/discardApp) settles via a refetch that can take a moment, and
  // without this the deck would show a blank gap or the same card again
  // until that round-trip completes.
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());

  // Always polled (not just after our own trigger) so the button correctly
  // disables if a search is already running server-side - e.g. a scheduled
  // run, or the user tapping Actualizar from another device. Without this,
  // nothing stops firing a second overlapping search job that then fights
  // the first one for the same Chromium/AI-limiter resources.
  const { data: searchStatus } = useSearchStatus(true);
  const backendSearching = searchStatus?.searchInProgress ?? false;
  const searching = searchState === 'queuing' || isRefetching || backendSearching;

  const dailyGoal = settings?.maxApplicationsPerDay ?? 10;

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
          todayCount={stats?.today ?? 0}
          submittedCount={stats?.submitted ?? 0}
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
              onSwipeRight={() => applyOrOpenLinkedIn(current)}
              onSwipeLeft={() => handleDiscard(current)}
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

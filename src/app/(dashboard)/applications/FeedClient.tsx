'use client';
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import SwipeDeck from '@/components/SwipeDeck';
import SearchingPanel from '@/components/SearchingPanel';
import SearchEnginePanel from '@/components/SearchEnginePanel';
import { useApplicationActions } from './useApplicationActions';
import { useSearchEngine } from './useSearchEngine';
import { useLiveEvents } from './useLiveEvents';
import type { AppRow } from './data';
import type { users, professionalProfiles, userSettings } from '@/db/schema';

export default function FeedClient({
  apps,
  settings,
  stats,
  supply,
  linkedinStatus = 'none',
}: {
  apps: AppRow[];
  user: typeof users.$inferSelect;
  profile: typeof professionalProfiles.$inferSelect;
  settings: typeof userSettings.$inferSelect;
  stats: { pendingReview: number };
  supply: { jobsSeen: number };
  linkedinStatus?: 'none' | 'connected' | 'expired';
}) {
  const {
    queueApps, actioningId, attentionApp, setAttentionApp, attentionReason,
    applyApp, discardApp, markApplied, cancelAssisted, openApp, isAtsApp,
  } = useApplicationActions(apps, linkedinStatus);

  const engine = useSearchEngine(settings);
  const { liveProgress, isSearching, runSearchNow } = engine;

  const router = useRouter();
  useLiveEvents({
    onApplicationsChanged: () => router.refresh(),
    onSearchProgress: engine.applyLiveProgress,
  });

  // First thing a brand-new user should see: the Feed already searching, not
  // a dead "nothing here" screen. A search is only auto-queued 24h after
  // registration server-side (see docs/DECISIONS.md) - if this user has never
  // had one run at all and the deck is empty, kick it off right now instead
  // of waiting on them to notice and click the button themselves.
  const autoStarted = useRef(false);
  const neverSearched = !settings.lastSearchAt;
  useEffect(() => {
    if (autoStarted.current) return;
    if (queueApps.length === 0 && neverSearched && !isSearching) {
      autoStarted.current = true;
      runSearchNow();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueApps.length, neverSearched, isSearching]);

  const related = Math.max(liveProgress.lastSearchResultCount ?? 0, (liveProgress.lastSearchFilteredCount ?? 0) + (liveProgress.lastSearchPreparedCount ?? 0));
  const monitored = Math.max(supply.jobsSeen ?? 0, related);
  const selected = Math.max(liveProgress.lastSearchPreparedCount ?? 0, stats.pendingReview);

  const emptyState = isSearching || (neverSearched && queueApps.length === 0)
    ? <SearchingPanel monitored={monitored} related={related} selected={selected} />
    : (
      <div className="bento-card" style={{ padding: '3.5rem 2rem', textAlign: 'center', borderRadius: 'var(--radius-xl)', maxWidth: 460, margin: '0 auto' }}>
        <div className="ambient-radar" style={{ margin: '0 auto 1.25rem auto' }}>
          <div style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--petrol)', boxShadow: '0 0 10px var(--petrol)' }} />
        </div>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)', marginBottom: '.5rem' }}>Estás al día</h3>
        <p style={{ fontSize: '.85rem', color: 'var(--text-2)', maxWidth: 380, margin: '0 auto', marginBottom: '1.5rem' }}>
          No hay vacantes nuevas para revisar ahora mismo. Te avisamos en cuanto Applica encuentre la próxima.
        </p>
        <button className="btn btn-primary" onClick={runSearchNow}>Buscar ahora</button>
      </div>
    );

  return (
    <div className="feed-shell animate-fadein">
      <SearchEnginePanel engine={engine} stats={stats} supply={supply} />
      <SwipeDeck
        apps={queueApps}
        actioningId={actioningId}
        attentionApp={attentionApp}
        setAttentionApp={setAttentionApp}
        attentionReason={attentionReason}
        applyApp={applyApp}
        discardApp={discardApp}
        markApplied={markApplied}
        cancelAssisted={cancelAssisted}
        openApp={openApp}
        isAtsApp={isAtsApp}
        emptyState={emptyState}
      />
    </div>
  );
}

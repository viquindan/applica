'use client';
import SwipeDeck from '@/components/SwipeDeck';
import { useApplicationActions } from './useApplicationActions';
import { useSearchEngine } from './useSearchEngine';
import type { AppRow } from './data';
import type { users, professionalProfiles, userSettings } from '@/db/schema';

export default function FeedClient({
  apps,
  settings,
  linkedinStatus = 'none',
}: {
  apps: AppRow[];
  user: typeof users.$inferSelect;
  profile: typeof professionalProfiles.$inferSelect;
  settings: typeof userSettings.$inferSelect;
  linkedinStatus?: 'none' | 'connected' | 'expired';
}) {
  const {
    queueApps, actioningId, attentionApp, setAttentionApp, attentionReason,
    applyApp, discardApp, markApplied, cancelAssisted, openApp, isAtsApp,
    linkedinPendingCount,
  } = useApplicationActions(apps, linkedinStatus);
  const { isSearching, runSearchNow } = useSearchEngine(settings);

  return (
    <div className="animate-fadein">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div>
          <div className="page-eyebrow">Feed</div>
          <h1 style={{ fontSize: 'clamp(1.6rem,4vw,2rem)', fontWeight: 800, color: 'var(--text)', margin: 0, letterSpacing: '-0.02em' }}>
            Vacantes para ti
          </h1>
        </div>
        <button
          title="Buscar vacantes nuevas ahora"
          disabled={isSearching}
          onClick={runSearchNow}
          style={{
            width: 46, height: 46, borderRadius: '50%', flexShrink: 0,
            background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: isSearching ? 'wait' : 'pointer',
            color: 'var(--petrol)', transition: 'all var(--transition)',
          }}
        >
          {isSearching ? (
            <span className="spinner" style={{ width: 18, height: 18 }} />
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35" />
            </svg>
          )}
        </button>
      </div>

      {linkedinPendingCount > 0 && (
        <div style={{ marginBottom: '1.5rem', padding: '.85rem 1.15rem', borderRadius: 'var(--radius-lg)', background: 'linear-gradient(90deg, rgba(10,102,194,.07), rgba(18,51,56,.04))', border: '1px solid rgba(10,102,194,.22)', fontSize: '.82rem', color: 'var(--text-2)' }}>
          <strong style={{ color: 'var(--text)' }}>{linkedinPendingCount} {linkedinPendingCount === 1 ? 'oportunidad' : 'oportunidades'} en LinkedIn:</strong> te preparamos CV, carta y respuestas. Dale <strong>Aplicar</strong> y te llevamos a aplicar en tu LinkedIn en segundos.
        </div>
      )}

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
      />
    </div>
  );
}

'use client';
import SwipeDeck from '@/components/SwipeDeck';
import { useApplicationActions } from './useApplicationActions';
import type { AppRow } from './data';
import type { users, professionalProfiles, userSettings } from '@/db/schema';

export default function FeedClient({
  apps,
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
  } = useApplicationActions(apps, linkedinStatus);

  return (
    <div className="feed-shell animate-fadein">
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

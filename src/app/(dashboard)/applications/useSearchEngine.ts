'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { userSettings } from '@/db/schema';

type Settings = typeof userSettings.$inferSelect;

/** The autopilot engine: search cadence/automation config + the "Buscar Ahora" trigger. */
export function useSearchEngine(settings: Settings) {
  const router = useRouter();
  const [startingSearch, setStartingSearch] = useState(false);
  const [liveProgress, setLiveProgress] = useState({
    searchInProgress: settings.searchInProgress,
    lastSearchStatus: settings.lastSearchStatus,
    lastSearchResultCount: settings.lastSearchResultCount ?? 0,
    lastSearchPreparedCount: settings.lastSearchPreparedCount ?? 0,
    lastSearchFilteredCount: settings.lastSearchFilteredCount ?? 0,
    lastSearchSourceCount: settings.lastSearchSourceCount ?? 0,
    lastSearchScannedSourceCount: settings.lastSearchScannedSourceCount ?? 0,
    lastSearchAt: settings.lastSearchAt,
    lastSearchError: settings.lastSearchError,
  });

  const isSearching = liveProgress.searchInProgress || liveProgress.lastSearchStatus === 'running' || liveProgress.lastSearchStatus === 'queued' || startingSearch;

  const [settingsForm, setSettingsForm] = useState({
    maxVacancyAgeDays: settings.maxVacancyAgeDays ?? 14,
    searchCadenceHours: settings.searchCadenceHours ?? 24,
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [savedSettings, setSavedSettings] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const updateSettings = (key: string, value: any) => {
    const next = { ...settingsForm, [key]: value };
    setSettingsForm(next);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(async () => {
      setSavingSettings(true);
      await fetch('/api/home', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next),
      });
      setSavingSettings(false);
      setSavedSettings(true);
      setTimeout(() => setSavedSettings(false), 2000);
      router.refresh();
    }, 800);
  };

  async function runSearchNow() {
    setStartingSearch(true);
    setLiveProgress((prev) => ({
      ...prev, searchInProgress: true, lastSearchStatus: 'queued',
      lastSearchResultCount: 0, lastSearchPreparedCount: 0, lastSearchFilteredCount: 0,
      lastSearchSourceCount: 0, lastSearchScannedSourceCount: 0,
    }));
    const res = await fetch('/api/search/run', { method: 'POST' });
    if (!res.ok) setStartingSearch(false);
  }

  async function pauseSearch() {
    await fetch('/api/search/cancel', { method: 'POST' });
    setStartingSearch(false);
    setLiveProgress((prev) => ({ ...prev, searchInProgress: false, lastSearchStatus: 'cancelled' }));
    router.refresh();
  }

  // Fed by the shared SSE connection (useLiveEvents, wired by whichever page
  // component uses this hook) instead of its own polling loop - see
  // src/app/api/events/route.ts. Falls back to a single fetch if the caller
  // never wires SSE, so this hook still works standalone.
  const applyLiveProgress = (data: Omit<typeof liveProgress, 'lastSearchAt'> & { lastSearchAt: string | Date | null }) => {
    setLiveProgress({ ...data, lastSearchAt: data.lastSearchAt ? new Date(data.lastSearchAt) : null });
    if (!data.searchInProgress && data.lastSearchStatus !== 'running' && data.lastSearchStatus !== 'queued') {
      setStartingSearch(false);
      router.refresh();
    }
  };

  useEffect(() => {
    if (!isSearching) return;
    fetch('/api/search/status').then((res) => res.ok && res.json()).then((data) => data && applyLiveProgress(data)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSearching]);

  const timeAgo = (date: Date) => {
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return 'Hace ' + Math.floor(interval) + ' años';
    interval = seconds / 2592000;
    if (interval > 1) return 'Hace ' + Math.floor(interval) + ' meses';
    interval = seconds / 86400;
    if (interval > 1) return 'Hace ' + Math.floor(interval) + ' días';
    interval = seconds / 3600;
    if (interval > 1) return 'Hace ' + Math.floor(interval) + ' horas';
    interval = seconds / 60;
    if (interval > 1) return 'Hace ' + Math.floor(interval) + ' minutos';
    return 'Hace unos segundos';
  };

  const lastSearchLabel = liveProgress.lastSearchAt ? timeAgo(new Date(liveProgress.lastSearchAt)) : 'Nunca';
  const nextSearchLabel = settings.nextSearchAt ? new Date(settings.nextSearchAt).toLocaleString('es', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' }) : 'Se programa al guardar';

  return {
    liveProgress, isSearching, runSearchNow, pauseSearch, applyLiveProgress,
    settingsForm, updateSettings, savingSettings, savedSettings,
    lastSearchLabel, nextSearchLabel,
  };
}

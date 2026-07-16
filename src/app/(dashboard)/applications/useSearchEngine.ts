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

  useEffect(() => {
    if (!isSearching) return;
    const poll = async () => {
      try {
        const res = await fetch('/api/search/status');
        if (res.ok) {
          const data = await res.json();
          setLiveProgress(data);
          if (!data.searchInProgress && data.lastSearchStatus !== 'running' && data.lastSearchStatus !== 'queued') {
            setStartingSearch(false);
            router.refresh();
          }
        }
      } catch {}
    };
    poll();
    const interval = setInterval(poll, 2000);
    return () => clearInterval(interval);
  }, [isSearching, router]);

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
    liveProgress, isSearching, runSearchNow, pauseSearch,
    settingsForm, updateSettings, savingSettings, savedSettings,
    lastSearchLabel, nextSearchLabel,
  };
}

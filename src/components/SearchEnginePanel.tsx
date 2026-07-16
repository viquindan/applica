'use client';
import { useState, useEffect, useRef } from 'react';
import type { useSearchEngine } from '@/app/(dashboard)/applications/useSearchEngine';

/** Smoothly tweens a displayed number toward `value` whenever it changes. */
function AnimatedCounter({ value }: { value: number }) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    const start = performance.now();
    const dur = 700;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [value]);
  return <>{display.toLocaleString('es')}</>;
}

export default function SearchEnginePanel({
  engine,
  stats,
  supply,
  defaultOpen = false,
}: {
  engine: ReturnType<typeof useSearchEngine>;
  stats: { pendingReview: number };
  supply: { jobsSeen: number };
  defaultOpen?: boolean;
}) {
  const {
    liveProgress, isSearching, runSearchNow, pauseSearch,
    settingsForm, updateSettings, savingSettings, savedSettings,
    lastSearchLabel, nextSearchLabel,
  } = engine;

  const [engineOpen, setEngineOpen] = useState(defaultOpen);

  const related = Math.max(liveProgress.lastSearchResultCount ?? 0, (liveProgress.lastSearchFilteredCount ?? 0) + (liveProgress.lastSearchPreparedCount ?? 0));
  const monitored = Math.max(supply.jobsSeen ?? 0, related);
  const discarded = liveProgress.lastSearchFilteredCount ?? 0;
  const selected = Math.max(liveProgress.lastSearchPreparedCount ?? 0, stats.pendingReview);
  const funnelCards = [
    { label: 'Ofertas monitoreadas', value: monitored, color: 'var(--text)' },
    { label: 'Relacionadas a tu rol', value: related, color: 'var(--petrol)' },
    { label: 'Descartadas por IA', value: discarded, color: 'var(--text-3)' },
    { label: 'Seleccionadas para ti', value: selected, color: 'var(--text-gold)' },
  ];

  return (
    <div className="bento-card" style={{ marginBottom: '2rem', padding: engineOpen ? '1.5rem' : '1rem 1.5rem' }}>
      <button onClick={() => setEngineOpen((v) => !v)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
        <span className="card-label" style={{ margin: 0 }}>Motor de búsqueda {isSearching && <span className="spinner" style={{ width: 12, height: 12, marginLeft: 8 }} />}</span>
        <span style={{ color: 'var(--text-3)', fontSize: '.75rem', fontWeight: 600 }}>{engineOpen ? 'Ocultar ▲' : 'Configurar ▼'}</span>
      </button>

      {engineOpen && (
        <div style={{ marginTop: '1.25rem' }}>
          <div style={{ marginBottom: '1.5rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '.85rem' }}>
            {funnelCards.map((c) => (
              <div key={c.label} style={{ padding: '.85rem 1rem', borderRadius: 'var(--radius-md)', background: 'var(--bg)' }}>
                <div className="metric-number" style={{ fontSize: '1.6rem', color: c.color }}><AnimatedCounter value={c.value} /></div>
                <div className="metric-label" style={{ fontSize: '.68rem' }}>{c.label}</div>
              </div>
            ))}
          </div>

          <div className="grid-2" style={{ gap: '1rem' }}>
            <div className="field-group">
              <label className="field-label">Frecuencia de Búsqueda</label>
              <select className="select" value={settingsForm.searchCadenceHours} onChange={(e) => updateSettings('searchCadenceHours', Number(e.target.value))}>
                <option value={24}>Cada 24 horas</option>
                <option value={12}>Cada 12 horas</option>
                <option value={6}>Cada 6 horas</option>
              </select>
            </div>
            <div className="field-group">
              <label className="field-label">Envío</label>
              <div style={{ padding: '.6rem .85rem', borderRadius: 'var(--radius-sm)', background: 'var(--bg)', fontSize: '.78rem', color: 'var(--text-2)' }}>
                Solo tras tu swipe en el Feed
              </div>
            </div>
          </div>

          <div style={{ padding: '.85rem', borderRadius: 'var(--radius-sm)', background: 'var(--bg)', marginTop: '1rem', textAlign: 'center', fontSize: '.8rem', color: 'var(--text-2)' }}>
            Último escaneo: {lastSearchLabel} · Próximo: {nextSearchLabel}
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', alignItems: 'center' }}>
            {isSearching ? (
              <button className="btn btn-secondary" onClick={pauseSearch} style={{ flex: 1 }}>Pausar búsqueda</button>
            ) : (
              <button className="btn btn-primary" onClick={runSearchNow} style={{ flex: 1 }}>Buscar Ahora</button>
            )}
            {(savingSettings || savedSettings) && (
              <span style={{ fontSize: '0.8rem', color: savedSettings ? 'var(--success)' : 'var(--text-3)' }}>
                {savingSettings ? 'Guardando...' : '¡Guardado!'}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

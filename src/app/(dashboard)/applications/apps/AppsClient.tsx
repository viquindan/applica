'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
import { IconX } from '@tabler/icons-react';
import { CompanyLogo, ScoreRing, STATUS_META, MODE_META } from '@/components/JobCardUI';
import { useApplicationActions } from '../useApplicationActions';
import { useSearchEngine } from '../useSearchEngine';
import type { AppRow } from '../data';
import type { users, userSettings } from '@/db/schema';

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

const FILTERS = [
  { key: 'submitted', label: 'Enviadas' },
  { key: 'filtered', label: 'Descartadas por IA' },
  { key: 'all', label: 'Todas' },
];

const PAGE_SIZE = 25;

export default function AppsClient({
  apps,
  settings,
  stats,
  supply,
  billing,
}: {
  apps: AppRow[];
  user: typeof users.$inferSelect;
  settings: typeof userSettings.$inferSelect;
  stats: { total: number; today: number; pendingReview: number; submitted: number };
  supply: { activeBoards: number; jobsSeen: number };
  billing?: { tier: string; limits: any; currentCount: number };
}) {
  const { historyApps, actioningId, discardApp, openApp, navigatingId } = useApplicationActions(apps);
  const {
    liveProgress, isSearching, runSearchNow, pauseSearch,
    settingsForm, updateSettings, savingSettings, savedSettings,
    lastSearchLabel, nextSearchLabel,
  } = useSearchEngine(settings);

  const [engineOpen, setEngineOpen] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  const maxApps = billing?.limits?.maxMonthlyApplications ?? (billing?.tier === 'pro' ? 150 : 30);
  const currentCount = billing?.currentCount ?? 0;
  const usagePercent = Math.min(100, (currentCount / maxApps) * 100);

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir(key === 'score' || key === 'date' ? 'desc' : 'asc'); }
    setPage(1);
  };

  const filtered = historyApps.filter((a) => {
    if (filter === 'all') return true;
    return a.status === filter;
  }).filter((a) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return a.vacancy?.company?.toLowerCase().includes(q) ||
      a.vacancy?.title?.toLowerCase().includes(q) ||
      a.vacancy?.platform?.toLowerCase().includes(q);
  });

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    const val = (a: AppRow): string | number => {
      switch (sortKey) {
        case 'company': return (a.vacancy?.company ?? '').toLowerCase();
        case 'score': return a.vacancy?.score ?? -1;
        case 'status': return STATUS_META[a.status as string]?.label ?? String(a.status);
        case 'date': return new Date(a.createdAt).getTime();
        default: return 0;
      }
    };
    return [...filtered].sort((a, b) => {
      const va = val(a), vb = val(b);
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  const safePage = Math.min(page, totalPages);
  const paged = useMemo(() => sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE), [sorted, safePage]);

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
    <div className="animate-fadein">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div className="page-eyebrow">Apps</div>
          <h1 className="page-title" style={{ margin: 0 }}>Tus aplicaciones</h1>
        </div>
        <div style={{ background: 'var(--surface)', padding: '1rem', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', width: 260 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginBottom: '0.5rem', fontWeight: 600 }}>
            <span style={{ color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Plan <span style={{ color: billing?.tier === 'pro' ? 'var(--text-gold)' : 'var(--text)', fontWeight: 700 }}>{billing?.tier === 'pro' ? 'PRO' : 'Free'}</span>
            </span>
            <span style={{ color: 'var(--text)', fontWeight: 700 }}>{currentCount} <span style={{ color: 'var(--text-3)', fontWeight: 500 }}>/ {maxApps}</span></span>
          </div>
          <div style={{ height: '4px', background: 'var(--bg-2)', borderRadius: '999px', overflow: 'hidden' }}>
            <div style={{ height: '100%', background: 'var(--petrol)', borderRadius: '999px', width: `${usagePercent}%`, transition: 'width 1s cubic-bezier(0.4, 0, 0.2, 1)' }} />
          </div>
          {billing?.tier === 'free' && (
            <button onClick={() => setShowUpgradeModal(true)} style={{ width: '100%', fontSize: '0.75rem', fontWeight: 700, background: 'none', color: 'var(--text-gold)', border: 'none', padding: '6px 0', cursor: 'pointer', marginTop: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
              Subir a Pro
            </button>
          )}
        </div>
      </div>

      {/* ── Motor de búsqueda: colapsado por defecto, la config vive aquí no en Feed ── */}
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
                <label className="field-label">Nivel de Automatización</label>
                <select className="select" value={settingsForm.applicationMode} onChange={(e) => updateSettings('applicationMode', e.target.value)}>
                  <option value="manual">Revisión Manual (Recomendado)</option>
                  <option value="auto">Totalmente Autónomo</option>
                </select>
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

      {/* Toolbar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '.85rem', marginBottom: '1.5rem' }}>
        <input className="input" placeholder="Buscar empresa, rol, plataforma…"
          value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          style={{ maxWidth: 320 }} />
        <div className="tab-bar" style={{ borderBottom: 'none', marginBottom: 0, overflowX: 'auto' }}>
          {FILTERS.map((f) => (
            <button key={f.key} className={`tab-btn ${filter === f.key ? 'active' : ''}`} onClick={() => { setFilter(f.key); setPage(1); }}>
              {f.label}
              <span style={{ marginLeft: '.35rem', opacity: .6, fontSize: '.65rem' }}>
                ({f.key === 'all' ? historyApps.length : historyApps.filter((a) => a.status === f.key).length})
              </span>
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card" style={{ padding: '4rem 1rem', border: 'none', background: 'transparent', boxShadow: 'none' }}>
          <div className="empty-state">
            <div className="ambient-radar" style={{ margin: '0 auto 1.5rem auto' }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--petrol)', boxShadow: '0 0 10px var(--petrol)' }} />
            </div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text)', marginBottom: '0.75rem' }}>Sin aplicaciones todavía</h3>
            <p style={{ fontSize: '.875rem', maxWidth: 480, color: 'var(--text-2)', lineHeight: 1.6, margin: '0 auto' }}>
              Cuando decidas sobre vacantes en el Feed, su historial y estado aparecerán aquí.
            </p>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
          {/* Sort controls - the table's clickable headers become a small toolbar,
              since a responsive row-list has no column headers to click on. */}
          <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', marginBottom: '.25rem' }}>
            {[{ key: 'date', label: 'Fecha' }, { key: 'score', label: 'Score' }, { key: 'company', label: 'Empresa' }, { key: 'status', label: 'Estado' }].map((s) => (
              <button key={s.key} onClick={() => toggleSort(s.key)}
                style={{
                  fontSize: '.7rem', fontWeight: 700, padding: '.3rem .7rem', borderRadius: 'var(--radius-full)',
                  background: sortKey === s.key ? 'var(--gold-dim)' : 'var(--bg-2)',
                  color: sortKey === s.key ? 'var(--text-gold)' : 'var(--text-3)',
                  border: '1px solid ' + (sortKey === s.key ? 'var(--gold-light)' : 'transparent'),
                }}>
                {s.label} {sortKey === s.key ? (sortDir === 'asc' ? '↑' : '↓') : ''}
              </button>
            ))}
          </div>

          {paged.map((app) => {
            const sm = STATUS_META[app.status as string] || { label: String(app.status), badge: 'badge-ghost' };
            const companyName = app.vacancy?.company ?? 'N/A';
            const isNavigating = navigatingId === app.id;
            const lastWarn = ((app.vacancy?.warnings as string[] | null) ?? []).slice(-1)[0] ?? '';
            const vacancyGone = app.status === 'skipped' && /ya no est[aá] publicada/i.test(lastWarn);
            return (
              <div key={app.id} className="app-row" onClick={() => openApp(app)}
                style={{ opacity: isNavigating ? 0.6 : ((app.status as string) === 'filtered' ? 0.75 : 1) }}>
                <CompanyLogo companyName={companyName} />
                <div style={{ minWidth: 0, flex: '1 1 200px' }}>
                  <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: '.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{companyName}</div>
                  <div style={{ fontSize: '.82rem', color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{app.vacancy?.title ?? '-'}</div>
                  <div style={{ fontSize: '.73rem', color: 'var(--text-3)', textTransform: 'capitalize' }}>
                    {app.vacancy?.platform ?? '-'}{app.vacancy?.location ? ` · ${app.vacancy.location}` : ''}
                  </div>
                </div>
                <div className="app-row-meta" style={{ display: 'flex', alignItems: 'center', gap: '.6rem', flexWrap: 'wrap' }}>
                  <ScoreRing score={app.vacancy?.score} size={32} />
                  <span className={`badge ${sm.badge}`}>{sm.label}</span>
                  {vacancyGone && <span className="badge badge-ghost" title={lastWarn}>Vacante cerrada</span>}
                  {app.responseStatus === 'contacted' && <span className="badge badge-success">Te llamaron</span>}
                  {app.responseStatus === 'rejected' && <span className="badge badge-danger">Rechazada</span>}
                  <span style={{ fontSize: '.75rem', color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
                    {new Date(app.createdAt).toLocaleDateString('es', { day: '2-digit', month: 'short' })}
                  </span>
                </div>
                {app.status !== 'archived' && (
                  <button className="btn btn-ghost btn-sm" disabled={actioningId === app.id}
                    title="No me interesa - quitar de la lista." onClick={(e) => { e.stopPropagation(); discardApp(app); }}
                    style={{ color: 'var(--text-3)', flexShrink: 0 }}>
                    Descartar
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ fontSize: '.73rem', color: 'var(--text-3)' }}>
          {sorted.length === 0 ? 'Sin resultados' : `Mostrando ${(safePage - 1) * PAGE_SIZE + 1}-${Math.min(safePage * PAGE_SIZE, sorted.length)} de ${sorted.length}`}
        </div>
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '.35rem' }}>
            <button className="btn btn-secondary btn-sm" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Anterior</button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 2)
              .reduce<number[]>((acc, p) => { if (acc.length && p - acc[acc.length - 1] > 1) acc.push(-1); acc.push(p); return acc; }, [])
              .map((p, i) => p === -1
                ? <span key={`gap-${i}`} style={{ color: 'var(--text-3)', padding: '0 .25rem' }}>…</span>
                : <button key={p} className={`btn btn-sm ${p === safePage ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setPage(p)} style={{ minWidth: 34 }}>{p}</button>)}
            <button className="btn btn-secondary btn-sm" disabled={safePage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Siguiente</button>
          </div>
        )}
      </div>

      {showUpgradeModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255, 255, 255, 0.4)', backdropFilter: 'blur(8px)' }}>
          <div className="bento-card" style={{ width: '100%', maxWidth: '400px', position: 'relative' }}>
            <button onClick={() => setShowUpgradeModal(false)} style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', color: 'var(--text-3)' }}>
              <IconX size={20} />
            </button>
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text)', marginBottom: '0.5rem' }}>Applica PRO</h2>
              <p style={{ color: 'var(--text-2)', fontSize: '0.9375rem' }}>Desbloquea la automatización completa.</p>
            </div>
            <div style={{ background: 'var(--bg)', padding: '1rem', borderRadius: 'var(--radius-md)', textAlign: 'center', marginBottom: '2rem' }}>
              <span style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text)' }}>$29</span>
              <span style={{ color: 'var(--text-3)' }}> / mes</span>
            </div>
            <button onClick={() => alert('Upgrade flow pending')} className="btn btn-primary" style={{ width: '100%' }}>
              Actualizar ahora
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

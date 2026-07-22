'use client';
import { useMemo, useState } from 'react';
import { CompanyLogo, ExtensionOffer, ScoreRing } from '@/components/JobCardUI';
import { useApplicationActions } from '../useApplicationActions';
import type { AppRow } from '../data';
import LiveSessionButton from './LiveSessionButton';

type Tab = 'attention' | 'backlog';

export default function PendientesClient({ apps }: { apps: AppRow[] }) {
  const {
    pendingApps, queueApps, actioningId, markApplied, cancelAssisted, openApp, needsInfoFor,
    applyApp, discardApp, isAtsApp, linkedinPendingCount,
  } = useApplicationActions(apps);

  const [tab, setTab] = useState<Tab>(pendingApps.length > 0 ? 'attention' : 'backlog');
  const [search, setSearch] = useState('');

  const filteredBacklog = useMemo(() => {
    // queueApps already comes pre-sorted (fit score, oldest-first tiebreak) from
    // useApplicationActions, so Feed and this backlog never disagree on order.
    if (!search.trim()) return queueApps;
    const q = search.toLowerCase();
    return queueApps.filter((a) =>
      a.vacancy?.company?.toLowerCase().includes(q) ||
      a.vacancy?.title?.toLowerCase().includes(q) ||
      a.vacancy?.platform?.toLowerCase().includes(q) ||
      a.vacancy?.location?.toLowerCase().includes(q));
  }, [queueApps, search]);

  return (
    <div className="animate-fadein">
      <div className="page-eyebrow">Pendientes</div>
      <h1 className="page-title">Pendientes</h1>
      <p style={{ color: 'var(--text-2)', fontSize: '.85rem', margin: '0 0 1.5rem 0', maxWidth: 560 }}>
        Lo que necesita de ti ahora mismo, y tu backlog de vacantes aún sin revisar.
      </p>

      <div className="tab-bar">
        <button className={`tab-btn ${tab === 'attention' ? 'active' : ''}`} onClick={() => setTab('attention')}>
          Requieren tu atención {pendingApps.length > 0 && <span style={{ marginLeft: '.35rem', opacity: .6, fontSize: '.65rem' }}>({pendingApps.length})</span>}
        </button>
        <button className={`tab-btn ${tab === 'backlog' ? 'active' : ''}`} onClick={() => setTab('backlog')}>
          No revisados {queueApps.length > 0 && <span style={{ marginLeft: '.35rem', opacity: .6, fontSize: '.65rem' }}>({queueApps.length})</span>}
        </button>
      </div>

      {tab === 'attention' ? (
        pendingApps.length === 0 ? (
          <div className="bento-card" style={{ padding: '3.5rem 2rem', textAlign: 'center' }}>
            <div className="ambient-radar" style={{ margin: '0 auto 1.25rem auto' }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--success)', boxShadow: '0 0 10px var(--success)' }} />
            </div>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)', marginBottom: '.5rem' }}>Nada pendiente</h3>
            <p style={{ fontSize: '.85rem', color: 'var(--text-2)', maxWidth: 420, margin: '0 auto' }}>
              Cuando una aplicación necesite tu captcha, confirmación, o un dato que falte, aparecerá aquí.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem' }}>
            {pendingApps.map((app) => {
              const isApproved = app.status === 'approved';
              return (
                <div key={app.id} className="bento-card" style={{ padding: '1.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '.85rem', marginBottom: '1rem' }}>
                    <CompanyLogo companyName={app.vacancy?.company ?? 'N/A'} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: '.95rem', color: 'var(--text)', lineHeight: 1.3 }}>{app.vacancy?.title ?? '-'}</div>
                      <div style={{ fontSize: '.8rem', color: 'var(--text-3)' }}>{app.vacancy?.company ?? '-'}</div>
                    </div>
                  </div>
                  <span className={`badge ${isApproved ? 'badge-warning' : 'badge-danger'}`} style={{ marginBottom: '.85rem', display: 'inline-flex' }}>
                    {isApproved ? 'Captcha/confirmación' : 'Faltan datos'}
                  </span>

                  <div style={{ fontSize: '.82rem', color: 'var(--text-2)', background: 'var(--bg)', borderRadius: 'var(--radius-md)', padding: '.75rem .9rem', marginBottom: '1.1rem', lineHeight: 1.55 }}>
                    {isApproved
                      ? 'Applica abrió una ventana con el formulario listo. Resuelve el captcha si aparece, revisa y envía. Confirma aquí al terminar.'
                      : 'Esta vacante pide información que Applica todavía no tiene. Complétala para poder enviarla.'}
                  </div>

                  <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
                    {isApproved ? (
                      <>
                        <LiveSessionButton applicationId={app.id} />
                        <button className="btn btn-primary btn-sm" disabled={actioningId === app.id} onClick={() => markApplied(app)}>
                          {actioningId === app.id ? <span className="spinner" style={{ width: 12, height: 12 }} /> : 'Ya envié'}
                        </button>
                        <button className="btn btn-ghost btn-sm" disabled={actioningId === app.id} onClick={() => cancelAssisted(app)} style={{ color: 'var(--text-3)' }}>
                          No se envió
                        </button>
                      </>
                    ) : (
                      <button className="btn btn-primary btn-sm" onClick={() => openApp(app)}>
                        Completar datos
                      </button>
                    )}
                  </div>
                  {isApproved && <ExtensionOffer />}
                </div>
              );
            })}
          </div>
        )
      ) : (
        <div>
          {linkedinPendingCount > 0 && (
            <div style={{ marginBottom: '1.25rem', padding: '.75rem 1rem', borderRadius: 'var(--radius-lg)', background: 'linear-gradient(90deg, rgba(10,102,194,.07), rgba(18,51,56,.04))', border: '1px solid rgba(10,102,194,.22)', fontSize: '.8rem', color: 'var(--text-2)' }}>
              <strong style={{ color: 'var(--text)' }}>{linkedinPendingCount} {linkedinPendingCount === 1 ? 'oportunidad' : 'oportunidades'} en LinkedIn:</strong> te preparamos CV, carta y respuestas. Ábrela y aplica en tu LinkedIn en segundos.
            </div>
          )}

          <input className="input" placeholder="Buscar empresa, rol, plataforma, ubicación…"
            value={search} onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 360, marginBottom: '1.25rem' }} />

          {filteredBacklog.length === 0 ? (
            <div className="bento-card" style={{ padding: '3rem 2rem', textAlign: 'center' }}>
              <p style={{ fontSize: '.85rem', color: 'var(--text-2)' }}>
                {search ? 'Nada coincide con tu búsqueda.' : 'No hay vacantes sin revisar - el Feed está al día.'}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem' }}>
              {filteredBacklog.map((app) => (
                <div key={app.id} className="app-row" onClick={() => openApp(app)}>
                  <CompanyLogo companyName={app.vacancy?.company ?? 'N/A'} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '.88rem', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {app.vacancy?.title ?? '-'}
                    </div>
                    <div style={{ fontSize: '.76rem', color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {app.vacancy?.company} · {app.vacancy?.platform}{app.vacancy?.location ? ` · ${app.vacancy.location}` : ''}
                    </div>
                  </div>
                  <div className="app-row-meta" onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: '.6rem', flexShrink: 0 }}>
                    <ScoreRing score={app.vacancy?.score} size={32} />
                    <button className="btn btn-ghost btn-sm" disabled={actioningId === app.id} onClick={() => discardApp(app)} style={{ color: 'var(--text-3)' }}>
                      Descartar
                    </button>
                    <button className="btn btn-primary btn-sm" disabled={actioningId === app.id} onClick={() => applyApp(app)}>
                      {actioningId === app.id ? <span className="spinner" style={{ width: 12, height: 12 }} /> : (isAtsApp(app) ? 'Abrir y aplicar' : 'Aplicar')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

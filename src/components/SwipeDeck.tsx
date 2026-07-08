'use client';
import { useState, useMemo } from 'react';
import { vacancies, applications } from '@/db/schema';
import { CompanyLogo, ScoreRing, ExtensionOffer } from '@/components/JobCardUI';

type AppRow = typeof applications.$inferSelect & {
  vacancy: Pick<typeof vacancies.$inferSelect, 'title' | 'company' | 'platform' | 'url' | 'score' | 'location' | 'warnings' | 'description'> | null;
};

type AttentionReason = { title: string; detail: string; cta: 'go' | 'fill' };

export default function SwipeDeck({
  apps,
  actioningId,
  attentionApp,
  setAttentionApp,
  attentionReason,
  applyApp,
  discardApp,
  markApplied,
  cancelAssisted,
  openApp,
  isAtsApp,
}: {
  apps: AppRow[];
  actioningId: string | null;
  attentionApp: AppRow | null;
  setAttentionApp: (a: AppRow | null) => void;
  attentionReason: (app: AppRow) => AttentionReason;
  applyApp: (app: AppRow) => void;
  discardApp: (app: AppRow) => void;
  markApplied: (app: AppRow) => void;
  cancelAssisted: (app: AppRow) => void;
  openApp: (app: AppRow) => void;
  isAtsApp: (app: AppRow) => boolean;
}) {
  const [savedForLaterIds, setSavedForLaterIds] = useState<string[]>([]);

  const queue = useMemo(() => {
    const saved = apps.filter((a) => savedForLaterIds.includes(a.id));
    const rest = apps.filter((a) => !savedForLaterIds.includes(a.id));
    return [...rest, ...saved];
  }, [apps, savedForLaterIds]);

  const current = queue[0];
  const behind = queue.slice(1, 3);
  const upNext = queue.slice(1, 4);

  if (!current) {
    return (
      <div className="bento-card" style={{ padding: '3.5rem 2rem', textAlign: 'center', borderRadius: 'var(--radius-xl)' }}>
        <div className="ambient-radar" style={{ margin: '0 auto 1.25rem auto' }}>
          <div style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--petrol)', boxShadow: '0 0 10px var(--petrol)' }} />
        </div>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)', marginBottom: '.5rem' }}>Estás al día</h3>
        <p style={{ fontSize: '.875rem', color: 'var(--text-2)', maxWidth: 420, margin: '0 auto' }}>
          No hay vacantes nuevas para revisar ahora mismo. Te avisamos en cuanto Applica encuentre la próxima.
        </p>
      </div>
    );
  }

  const companyName = current.vacancy?.company ?? 'N/A';
  const isProcessing = current.status === 'approved';
  const inAttention = attentionApp?.id === current.id;
  const descriptionText = (current.vacancy?.description ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const warnings = (current.vacancy?.warnings as string[] | null) ?? [];

  return (
    <div className="swipe-deck-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: '1.5rem', alignItems: 'start' }}>
      {/* ── Stacked deck ── */}
      <div style={{ position: 'relative', maxWidth: 640, margin: '0 auto', width: '100%' }}>
        {/* Ghost cards peeking behind, to sell "a deck, not a form" */}
        {behind.map((_, i) => (
          <div key={i} aria-hidden style={{
            position: 'absolute', left: `${(i + 1) * 10}px`, right: `${(i + 1) * 10}px`, top: `${(i + 1) * 10}px`,
            bottom: -((i + 1) * 10), background: 'var(--surface)', borderRadius: 'var(--radius-xl)',
            boxShadow: 'var(--shadow-sm)', opacity: 1 - (i + 1) * 0.28, zIndex: 1 - i,
          }} />
        ))}

        <div className="swipe-card" style={{
          position: 'relative', zIndex: 10, background: 'var(--surface)', borderRadius: 'var(--radius-xl)',
          overflow: 'hidden', boxShadow: 'var(--shadow-lg)', border: '1px solid rgba(18,51,56,.05)',
        }}>
          <div style={{
            position: 'relative', height: 220,
            background: `linear-gradient(160deg, var(--petrol) 0%, var(--petrol-light) 55%, #3d6a70 100%)`,
            display: 'flex', alignItems: 'flex-end', padding: '1.5rem 1.5rem 1.35rem',
          }}>
            <div style={{ position: 'absolute', inset: 0, opacity: .5, background: 'radial-gradient(circle at 85% 15%, rgba(254,214,91,.35) 0%, transparent 45%)' }} />
            <span style={{
              position: 'absolute', top: 18, right: 18, padding: '.35rem .85rem', borderRadius: 'var(--radius-full)',
              background: 'var(--gold)', color: 'var(--text-gold)', fontSize: '.68rem', fontWeight: 800,
              textTransform: 'uppercase', letterSpacing: '.06em', boxShadow: 'var(--shadow-sm)',
            }}>
              {isAtsApp(current) ? 'Auto-Apply' : current.vacancy?.platform ?? 'Directo'}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', position: 'relative' }}>
              <div style={{ width: 60, height: 60, borderRadius: 'var(--radius-lg)', overflow: 'hidden', border: '2px solid rgba(255,255,255,.3)', flexShrink: 0, boxShadow: 'var(--shadow-md)' }}>
                <CompanyLogo companyName={companyName} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '.78rem', color: 'rgba(241,240,240,.75)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>{companyName}</div>
                <div style={{ fontSize: '1.55rem', fontWeight: 800, color: '#fff', lineHeight: 1.15, letterSpacing: '-0.01em' }}>{current.vacancy?.title ?? '-'}</div>
              </div>
            </div>
          </div>

          <div style={{ padding: '1.5rem 1.5rem 1.75rem' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem', marginBottom: '1.1rem' }}>
              {current.vacancy?.location && <span className="tag" style={{ background: 'var(--bg-2)', color: 'var(--text-2)', border: 'none' }}>{current.vacancy.location}</span>}
              {typeof current.vacancy?.score === 'number' && <span className="tag" style={{ background: 'var(--gold-dim)', color: 'var(--text-gold)', border: 'none' }}>Fit {current.vacancy.score}%</span>}
            </div>

            <p style={{ fontSize: '.9rem', color: 'var(--text-2)', lineHeight: 1.7, margin: 0, display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {descriptionText || 'Sin descripción disponible.'}
            </p>

            <div style={{ marginTop: '1.75rem' }}>
              {isProcessing ? (
                <div style={{ background: 'rgba(18,51,56,.06)', border: '1px solid rgba(18,51,56,.14)', borderRadius: 'var(--radius-lg)', padding: '1.1rem 1.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', marginBottom: '.4rem' }}>
                    <span className="spinner" style={{ width: 14, height: 14 }} />
                    <span style={{ fontWeight: 700, fontSize: '.85rem', color: 'var(--text)' }}>Applica está aplicando por ti</span>
                  </div>
                  <p style={{ fontSize: '.78rem', color: 'var(--text-2)', lineHeight: 1.55, margin: '0 0 .85rem' }}>
                    Se abrió una ventana con el formulario ya lleno. Revisa, completa lo que falte, resuelve el captcha si aparece y dale Enviar. Confirma aquí al terminar.
                  </p>
                  <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
                    <button className="btn btn-primary btn-sm" disabled={actioningId === current.id} onClick={() => markApplied(current)}>
                      {actioningId === current.id ? <span className="spinner" style={{ width: 12, height: 12 }} /> : 'Ya envié'}
                    </button>
                    <button className="btn btn-ghost btn-sm" disabled={actioningId === current.id} onClick={() => cancelAssisted(current)} style={{ color: 'var(--text-3)' }}>
                      No se envió
                    </button>
                  </div>
                  <ExtensionOffer />
                </div>
              ) : inAttention ? (() => {
                const r = attentionReason(current);
                return (
                  <div style={{ background: 'var(--gold-dim)', border: '1px solid rgba(254,214,91,.5)', borderRadius: 'var(--radius-lg)', padding: '1.1rem 1.25rem' }}>
                    <div style={{ fontWeight: 700, fontSize: '.85rem', color: 'var(--text)' }}>{r.title}</div>
                    <p style={{ fontSize: '.78rem', color: 'var(--text-2)', margin: '.3rem 0 .85rem', lineHeight: 1.55 }}>{r.detail}</p>
                    <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
                      <button className="btn btn-primary btn-sm" onClick={() => { setAttentionApp(null); openApp(current); }}>
                        {r.cta === 'fill' ? 'Completar datos' : 'Ver materiales y aplicar'}
                      </button>
                      {r.cta !== 'fill' && current.vacancy?.url && (
                        <a className="btn btn-secondary btn-sm" href={current.vacancy.url} target="_blank" rel="noopener" onClick={() => setAttentionApp(null)} style={{ textDecoration: 'none' }}>Ir a la oferta</a>
                      )}
                      <button className="btn btn-ghost btn-sm" onClick={() => setAttentionApp(null)} style={{ color: 'var(--text-3)' }}>Cancelar</button>
                    </div>
                  </div>
                );
              })() : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1.25rem' }}>
                  <button
                    title="No me interesa"
                    disabled={actioningId === current.id}
                    onClick={() => discardApp(current)}
                    className="swipe-btn swipe-btn-ghost"
                  >
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                  </button>
                  <button
                    disabled={actioningId === current.id}
                    onClick={() => setSavedForLaterIds((prev) => prev.includes(current.id) ? prev : [...prev, current.id])}
                    className="swipe-btn swipe-btn-save"
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4-7 4V4.5a1 1 0 0 1 1-1Z" /></svg>
                  </button>
                  <button
                    title={isAtsApp(current) ? 'Abrimos la oferta con el formulario listo; solo resuelves el captcha y envías.' : 'Ver cómo aplicar a esta oferta.'}
                    disabled={actioningId === current.id}
                    onClick={() => applyApp(current)}
                    className="swipe-btn swipe-btn-apply"
                  >
                    {actioningId === current.id ? <span className="spinner" style={{ width: 18, height: 18, borderTopColor: '#fff' }} /> : (
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Vacancy insights ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div className="bento-card" style={{ padding: '1.25rem' }}>
          <div className="card-label">Curated Match</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.85rem' }}>
            <ScoreRing score={current.vacancy?.score} size={52} />
            <div>
              <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text)', lineHeight: 1 }}>{current.vacancy?.score ?? '-'}%</div>
              <div style={{ fontSize: '.68rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>Overall Fit Score</div>
            </div>
          </div>
          {warnings.length > 0 && (
            <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-light)' }}>
              <div style={{ fontSize: '.68rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700, marginBottom: '.5rem' }}>A tener en cuenta</div>
              <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '.78rem', color: 'var(--text-2)', lineHeight: 1.6 }}>
                {warnings.slice(0, 3).map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}
        </div>

        {upNext.length > 0 && (
          <div className="bento-card" style={{ padding: '1.25rem' }}>
            <div className="card-label">Siguientes en tu cola</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
              {upNext.map((a) => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '.6rem', opacity: .85 }}>
                  <div style={{ width: 32, height: 32, flexShrink: 0 }}><CompanyLogo companyName={a.vacancy?.company ?? 'N/A'} /></div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '.8rem', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.vacancy?.company ?? '-'}</div>
                    <div style={{ fontSize: '.73rem', color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.vacancy?.title ?? '-'}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

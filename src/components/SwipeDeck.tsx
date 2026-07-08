'use client';
import { useState, useMemo } from 'react';
import { vacancies, applications } from '@/db/schema';
import { CompanyLogo, ScoreRing } from '@/components/JobCardUI';

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
  ExtensionOffer,
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
  ExtensionOffer: React.ComponentType;
}) {
  const [savedForLaterIds, setSavedForLaterIds] = useState<string[]>([]);

  const queue = useMemo(() => {
    const saved = apps.filter((a) => savedForLaterIds.includes(a.id));
    const rest = apps.filter((a) => !savedForLaterIds.includes(a.id));
    return [...rest, ...saved];
  }, [apps, savedForLaterIds]);

  const current = queue[0];
  const upNext = queue.slice(1, 4);

  if (!current) {
    return (
      <div className="bento-card" style={{ padding: '3.5rem 2rem', textAlign: 'center' }}>
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
  const isNavigating = false;
  const descriptionText = (current.vacancy?.description ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const warnings = (current.vacancy?.warnings as string[] | null) ?? [];

  return (
    <div className="swipe-deck-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: '1.5rem', alignItems: 'start' }}>
      {/* ── Swipe card ── */}
      <div className="bento-card" style={{ padding: 0, overflow: 'hidden', maxWidth: 640, margin: '0 auto', width: '100%' }}>
        <div style={{
          position: 'relative', height: 168,
          background: 'linear-gradient(135deg, var(--petrol) 0%, var(--petrol-light) 100%)',
          display: 'flex', alignItems: 'flex-end', padding: '1rem 1.25rem',
        }}>
          <span style={{
            position: 'absolute', top: 14, right: 14, padding: '.3rem .75rem', borderRadius: 'var(--radius-full)',
            background: 'var(--gold)', color: 'var(--text-gold)', fontSize: '.68rem', fontWeight: 800,
            textTransform: 'uppercase', letterSpacing: '.06em',
          }}>
            {isAtsApp(current) ? 'Auto-Apply' : current.vacancy?.platform ?? 'Directo'}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.85rem' }}>
            <div style={{ width: 52, height: 52, borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '2px solid rgba(255,255,255,.25)', flexShrink: 0 }}>
              <CompanyLogo companyName={companyName} />
            </div>
            <div>
              <div style={{ fontSize: '.75rem', color: 'rgba(241,240,240,.7)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>{companyName}</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#fff', lineHeight: 1.15 }}>{current.vacancy?.title ?? '-'}</div>
            </div>
          </div>
        </div>

        <div style={{ padding: '1.25rem 1.5rem 1.5rem' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem', marginBottom: '1rem' }}>
            {current.vacancy?.location && <span className="tag" style={{ background: 'var(--bg-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>{current.vacancy.location}</span>}
            {typeof current.vacancy?.score === 'number' && <span className="tag" style={{ background: 'var(--bg-2)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>Fit {current.vacancy.score}%</span>}
          </div>

          <p style={{ fontSize: '.875rem', color: 'var(--text-2)', lineHeight: 1.65, margin: 0, display: '-webkit-box', WebkitLineClamp: 5, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {descriptionText || 'Sin descripción disponible.'}
          </p>

          <div style={{ marginTop: '1.5rem' }}>
            {isProcessing ? (
              <div style={{ background: 'rgba(18,51,56,.06)', border: '1px solid rgba(18,51,56,.18)', borderRadius: 'var(--radius-md)', padding: '1rem 1.1rem' }}>
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
                <div style={{ background: 'rgba(254,214,91,.12)', border: '1px solid rgba(254,214,91,.4)', borderRadius: 'var(--radius-md)', padding: '1rem 1.1rem' }}>
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
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1.5rem' }}>
                <button
                  title="No me interesa"
                  disabled={actioningId === current.id}
                  onClick={() => discardApp(current)}
                  style={{
                    width: 56, height: 56, borderRadius: '50%', background: 'var(--surface)', border: '2px solid var(--border)',
                    color: 'var(--text-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem',
                    cursor: 'pointer', transition: 'all var(--transition)', flexShrink: 0,
                  }}
                >
                  ✕
                </button>
                <button
                  className="btn btn-secondary"
                  disabled={actioningId === current.id}
                  onClick={() => setSavedForLaterIds((prev) => prev.includes(current.id) ? prev : [...prev, current.id])}
                  style={{ borderRadius: 'var(--radius-full)' }}
                >
                  Guardar para después
                </button>
                <button
                  title={isAtsApp(current) ? 'Abrimos la oferta con el formulario listo; solo resuelves el captcha y envías.' : 'Ver cómo aplicar a esta oferta.'}
                  disabled={actioningId === current.id}
                  onClick={() => applyApp(current)}
                  style={{
                    width: 56, height: 56, borderRadius: '50%', background: 'var(--petrol)', border: 'none',
                    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem',
                    cursor: 'pointer', transition: 'all var(--transition)', boxShadow: 'var(--shadow-md)', flexShrink: 0,
                  }}
                >
                  {actioningId === current.id ? <span className="spinner" style={{ width: 16, height: 16, borderTopColor: '#fff' }} /> : '✓'}
                </button>
              </div>
            )}
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

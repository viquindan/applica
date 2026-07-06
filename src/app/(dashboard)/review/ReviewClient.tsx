'use client';
import { useState } from'react';
import { useRouter } from'next/navigation';

type ReviewItem = {
  id: string;
  status: string;
  mode: string;
  submissionDecision: any;
  createdAt: Date;
  vacancy: {
    title: string | null;
    company: string | null;
    platform: string | null;
    score: number | null;
    location: string | null;
    url: string | null;
    redFlags: string[] | null;
    warnings: string[] | null;
  } | null;
};

function ScorePill({ score }: { score: number | null | undefined }) {
  if (!score) return null;
  const color = score >= 80 ? '#4ecca3' : score >= 60 ? '#f0c040' : '#e57373';
  const bg = score >= 80 ? 'rgba(46,158,107,.12)' : score >= 60 ? 'rgba(196,154,42,.12)' : 'rgba(192,57,43,.12)';
  return (
    <span style={{ padding: '2px 10px', borderRadius: 2, fontWeight: 700, fontSize: '.8rem', color, background: bg, fontFamily: 'var(--font-display)', letterSpacing: '.02em' }}>
      {score}
    </span>
  );
}

export default function ReviewClient({ items }: { items: ReviewItem[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState<Record<string, string>>({});
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  async function act(id: string, action: string) {
    setLoading(l => ({ ...l, [id]: action }));
    await fetch(`/api/applications/${id}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    setLoading(l => { const n = { ...l }; delete n[id]; return n; });
    setDismissed(d => new Set([...d, id]));
  }

  const visible = items.filter(i => !dismissed.has(i.id));

  return (
    <div className="animate-fadein">
      <div className="page-header">
        <div className="page-eyebrow">Semi-Automatizado</div>
        <h1 className="page-title">Cola de Revisión</h1>
        <p className="page-subtitle">
          Aprueba, edita o descarta cada aplicación antes del envío final.
          El sistema ha preparado CV adaptado y carta de presentación.
        </p>
      </div>

      {/* Summary */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
        <div className="card card-sm" style={{ flex: 'none', minWidth: 140 }}>
          <div className="metric-value" style={{ fontSize: '2rem' }}>{visible.length}</div>
          <div className="metric-label">Pendientes</div>
        </div>
        <div className="card card-sm" style={{ flex: 'none', minWidth: 140 }}>
          <div className="metric-value" style={{ fontSize: '2rem', color: 'var(--gold-light)' }}>{dismissed.size}</div>
          <div className="metric-label">Procesadas</div>
        </div>
        {visible.length > 0 && (
          <div className="card card-sm" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button className="btn btn-primary" onClick={async () => {
              for (const i of visible) { await act(i.id, 'approve'); }
            }}>
               Aprobar todas ({visible.length})
            </button>
            <button className="btn btn-secondary" onClick={async () => {
              for (const i of visible) { await act(i.id, 'skip'); }
            }}>
              Omitir todas
            </button>
          </div>
        )}
      </div>

      {visible.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon" style={{ fontSize: '2.5rem' }}></div>
          <h3>Cola vacía</h3>
          <p style={{ fontSize: '.8125rem', maxWidth: 320 }}>
            No hay aplicaciones pendientes de revisión. El sistema procesará las nuevas búsquedas automáticamente.
          </p>
          <button className="btn btn-secondary" onClick={() => router.push('/applications')}>Ver todas las aplicaciones</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {visible.map(item => {
            const dec = item.submissionDecision as any;
            const isLoading = !!loading[item.id];
            return (
              <div key={item.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {/* Card header */}
                <div style={{ padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', marginBottom: '.35rem' }}>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.15rem', fontWeight: 600, color: 'var(--gold-light)' }}>
                        {item.vacancy?.company}
                      </span>
                      <span className="badge badge-ghost" style={{ fontSize: '.68rem' }}>{item.vacancy?.platform}</span>
                      <ScorePill score={item.vacancy?.score} />
                    </div>
                    <div style={{ fontSize: '.875rem', color: 'var(--text-2)' }}>{item.vacancy?.title}</div>
                    {item.vacancy?.location && (
                      <div style={{ fontSize: '.73rem', color: 'var(--text-3)', marginTop: '.2rem' }}>
                        {item.vacancy.location}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: '.73rem', color: 'var(--text-3)', textAlign: 'right', flexShrink: 0 }}>
                    {new Date(item.createdAt).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    {item.vacancy?.url && (
                      <div><a href={item.vacancy.url} target="_blank" rel="noopener" style={{ color: 'var(--gold-light)', fontSize: '.71rem' }}>Ver oferta</a></div>
                    )}
                  </div>
                </div>

                {/* Flags / warnings */}
                {((item.vacancy?.redFlags ?? []).length > 0 || (item.vacancy?.warnings ?? []).length > 0) && (
                  <div style={{ padding: '.75rem 1.5rem', background: 'var(--bg-3)', borderTop: '1px solid var(--border)', display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                    {(item.vacancy?.redFlags ?? []).map((f, i) => (
                      <span key={i} style={{ fontSize: '.73rem', color: '#e57373' }}>⊘ {f}</span>
                    ))}
                    {(item.vacancy?.warnings ?? []).map((w, i) => (
                      <span key={i} style={{ fontSize: '.73rem', color: '#f0c040' }}>{w}</span>
                    ))}
                  </div>
                )}

                {/* Decision reason */}
                {dec?.blockingReasons?.length > 0 && (
                  <div style={{ padding: '.5rem 1.5rem', background: 'var(--danger-dim)', borderTop: '1px solid rgba(192,57,43,.2)' }}>
                    {dec.blockingReasons.map((r: string, i: number) => (
                      <div key={i} style={{ fontSize: '.75rem', color: '#e57373' }}>· {r}</div>
                    ))}
                  </div>
                )}

                {/* Action buttons */}
                <div className="review-actions">
                  <button className="btn btn-primary" onClick={() => act(item.id, 'approve')} disabled={isLoading}>
                    {loading[item.id] === 'approve' ? <><span className="spinner" />Enviando…</> : 'Aprobar y enviar'}
                  </button>
                  <button className="btn btn-petrol btn-sm" onClick={() => router.push(`/applications/${item.id}`)} disabled={isLoading}>
                     Editar materiales
                  </button>
                  <button className="btn btn-petrol btn-sm" onClick={() => act(item.id, 'regenerate_cv')} disabled={isLoading}>
                    {loading[item.id] === 'regenerate_cv' ? <span className="spinner" /> : ''} CV
                  </button>
                  <button className="btn btn-petrol btn-sm" onClick={() => act(item.id, 'regenerate_letter')} disabled={isLoading}>
                    {loading[item.id] === 'regenerate_letter' ? <span className="spinner" /> : ''} Carta
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => act(item.id, 'skip')} disabled={isLoading}>Omitir</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => act(item.id, 'archive')} disabled={isLoading}>Archivar</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

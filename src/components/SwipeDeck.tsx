'use client';
import { useState, useMemo, useRef } from 'react';
import { vacancies, applications } from '@/db/schema';
import { CompanyLogo, ExtensionOffer } from '@/components/JobCardUI';

type AppRow = typeof applications.$inferSelect & {
  vacancy: Pick<typeof vacancies.$inferSelect, 'title' | 'company' | 'platform' | 'url' | 'score' | 'location' | 'warnings' | 'description'> | null;
};

type AttentionReason = { title: string; detail: string; cta: 'go' | 'fill' };

const EXIT_MS = 260;
const SWIPE_ROTATION_FACTOR = 0.06;
const SWIPE_BADGE_FULL_OPACITY_PX = 100;
const TAP_THRESHOLD_PX = 6;

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
  // Cards the user has decisively swiped/tapped away. Hidden immediately so the
  // fly-off animation doesn't "snap back" while we wait on the server round-trip
  // (assisted apply can take a beat before the status actually flips).
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [exiting, setExiting] = useState<null | 'left' | 'right'>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  // Pointerdown->pointerup can land in the SAME event-loop tick (Playwright's
  // .click() does this, and fast real taps can too) - if pointerup's handler
  // reads the `dragging` STATE, it sees the pre-render value from its stale
  // closure and silently no-ops, dropping the tap-to-open. A ref is read
  // synchronously and never goes stale, so gating lives here instead.
  const activeRef = useRef(false);
  const dragXRef = useRef(0);

  const queue = useMemo(() => {
    const visible = apps.filter((a) => !dismissedIds.has(a.id));
    const saved = visible.filter((a) => savedForLaterIds.includes(a.id));
    const rest = visible.filter((a) => !savedForLaterIds.includes(a.id));
    return [...rest, ...saved];
  }, [apps, savedForLaterIds, dismissedIds]);

  const current = queue[0];
  const behind = queue.slice(1, 3);

  if (!current) {
    return (
      <div className="bento-card" style={{ padding: '3.5rem 2rem', textAlign: 'center', borderRadius: 'var(--radius-xl)', maxWidth: 460, margin: '0 auto' }}>
        <div className="ambient-radar" style={{ margin: '0 auto 1.25rem auto' }}>
          <div style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--petrol)', boxShadow: '0 0 10px var(--petrol)' }} />
        </div>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)', marginBottom: '.5rem' }}>Estás al día</h3>
        <p style={{ fontSize: '.85rem', color: 'var(--text-2)', maxWidth: 380, margin: '0 auto' }}>
          No hay vacantes nuevas para revisar ahora mismo. Te avisamos en cuanto Applica encuentre la próxima.
        </p>
      </div>
    );
  }

  const companyName = current.vacancy?.company ?? 'N/A';
  const isProcessing = current.status === 'approved';
  const inAttention = attentionApp?.id === current.id;
  const descriptionText = (current.vacancy?.description ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  const canDrag = !isProcessing && !inAttention && actioningId !== current.id && exiting === null;

  function doExit(direction: 'left' | 'right') {
    const app = current;
    setExiting(direction);
    setTimeout(() => {
      if (direction === 'right') applyApp(app); else discardApp(app);
      setDismissedIds((prev) => new Set(prev).add(app.id));
      setExiting(null);
      setDragX(0);
    }, EXIT_MS);
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!canDrag) return;
    activeRef.current = true;
    dragXRef.current = 0;
    setDragging(true);
    startXRef.current = e.clientX;
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!activeRef.current) return;
    const x = e.clientX - startXRef.current;
    dragXRef.current = x;
    setDragX(x);
  }
  function onPointerUp() {
    if (!activeRef.current) return;
    activeRef.current = false;
    setDragging(false);
    const x = dragXRef.current;
    const width = cardRef.current?.clientWidth ?? 320;
    const threshold = width * 0.25;
    if (x > threshold) { doExit('right'); return; }
    if (x < -threshold) { doExit('left'); return; }
    // A tap, not a drag: open the full offer. Mirrors the Stitch prototype's
    // "only open if not dragging" (Math.abs(currentX) < 5) check.
    if (Math.abs(x) < TAP_THRESHOLD_PX) openApp(current);
    setDragX(0);
  }

  const cardTransform = exiting
    ? {
        transform: `translateX(${exiting === 'right' ? 140 : -140}%) rotate(${exiting === 'right' ? 20 : -20}deg)`,
        opacity: 0,
        transition: `transform ${EXIT_MS}ms ease, opacity ${EXIT_MS}ms ease`,
      }
    : dragging
      ? { transform: `translateX(${dragX}px) rotate(${dragX * SWIPE_ROTATION_FACTOR}deg)`, transition: 'none' }
      : { transform: 'translateX(0) rotate(0)', transition: 'transform .3s ease' };

  const dragProgress = Math.min(Math.abs(dragX) / SWIPE_BADGE_FULL_OPACITY_PX, 1);
  const nopeOpacity = exiting === 'left' ? 1 : (!exiting && dragX < 0 ? dragProgress : 0);
  const applyOpacity = exiting === 'right' ? 1 : (!exiting && dragX > 0 ? dragProgress : 0);

  return (
    <div className="feed-single">
      {/* ── Stacked deck ── */}
      <div className="swipe-card-wrap" style={{ position: 'relative', width: '100%' }}>
        {/* Ghost cards peeking behind, to sell "a deck, not a form" */}
        {behind.map((_, i) => (
          <div key={i} aria-hidden style={{
            position: 'absolute', left: `${(i + 1) * 10}px`, right: `${(i + 1) * 10}px`, top: `${(i + 1) * 10}px`,
            bottom: -((i + 1) * 10), background: 'var(--surface)', borderRadius: 'var(--radius-xl)',
            boxShadow: 'var(--shadow-sm)', opacity: 1 - (i + 1) * 0.28, zIndex: 1 - i,
          }} />
        ))}

        <div
          ref={cardRef}
          className="swipe-card"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          title="Toca para ver la oferta completa"
          style={{
            position: 'relative', zIndex: 10, background: 'var(--surface)', borderRadius: 'var(--radius-xl)',
            overflow: 'hidden', boxShadow: 'var(--shadow-lg)', border: '1px solid rgba(18,51,56,.05)',
            touchAction: canDrag ? 'none' : 'auto', cursor: canDrag ? (dragging ? 'grabbing' : 'pointer') : 'default',
            userSelect: 'none', display: 'flex', flexDirection: 'column', ...cardTransform,
          }}
        >
          {/* NOPE / APLICAR stamps, driven by drag distance - mirrors the Stitch prototype */}
          <div aria-hidden style={{ position: 'absolute', inset: 0, zIndex: 40, pointerEvents: 'none', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '1.75rem' }}>
            <div style={{
              opacity: nopeOpacity, transform: 'rotate(-14deg)', border: '3px solid var(--danger)', color: 'var(--danger)',
              fontWeight: 900, fontSize: '1.15rem', padding: '.2rem .85rem', borderRadius: 'var(--radius-md)',
              background: 'rgba(255,255,255,.9)', letterSpacing: '.04em', transition: dragging ? 'none' : 'opacity .2s ease',
            }}>
              NOPE
            </div>
            <div style={{
              opacity: applyOpacity, transform: 'rotate(14deg)', border: '3px solid var(--success)', color: 'var(--success)',
              fontWeight: 900, fontSize: '1.15rem', padding: '.2rem .85rem', borderRadius: 'var(--radius-md)',
              background: 'rgba(255,255,255,.9)', letterSpacing: '.04em', transition: dragging ? 'none' : 'opacity .2s ease',
            }}>
              APLICAR
            </div>
          </div>

          <div style={{ height: 5, background: 'linear-gradient(90deg, var(--petrol), var(--gold))', flexShrink: 0 }} />

          <div style={{ padding: '1.5rem 1.5rem 1rem', textAlign: 'center', flexShrink: 0 }}>
            <div style={{
              width: 72, height: 72, borderRadius: 'var(--radius-lg)', overflow: 'hidden', margin: '0 auto .9rem',
              border: '2px solid var(--surface)', boxShadow: '0 0 0 1px var(--border), var(--shadow-md)',
            }}>
              <CompanyLogo companyName={companyName} />
            </div>
            <span style={{
              display: 'inline-block', padding: '.3rem .75rem', borderRadius: 'var(--radius-full)', marginBottom: '.6rem',
              background: 'var(--gold-dim)', color: 'var(--text-gold)', fontSize: '.6rem', fontWeight: 800,
              textTransform: 'uppercase', letterSpacing: '.05em', border: '1px solid var(--gold-light)',
            }}>
              {isAtsApp(current) ? 'Auto-Apply' : current.vacancy?.platform ?? 'Directo'}
            </span>
            <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text)', lineHeight: 1.25, letterSpacing: '-0.01em' }}>{current.vacancy?.title ?? '-'}</div>
            <div style={{ fontSize: '.8rem', color: 'var(--text-3)', fontWeight: 600, marginTop: '.15rem' }}>{companyName}</div>
          </div>

          <div style={{ padding: '0 1.5rem 1.35rem', borderTop: '1px solid var(--border-light)', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem', justifyContent: 'center', margin: '1rem 0' }}>
              {current.vacancy?.location && <span className="tag" style={{ background: 'var(--bg-2)', color: 'var(--text-2)', border: 'none' }}>{current.vacancy.location}</span>}
              {typeof current.vacancy?.score === 'number' && <span className="tag" style={{ background: 'var(--gold-dim)', color: 'var(--text-gold)', border: 'none' }}>Fit {current.vacancy.score}%</span>}
            </div>

            <p style={{
              fontSize: '.82rem', color: 'var(--text-2)', lineHeight: 1.6, margin: 0, textAlign: 'center',
              display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}>
              {descriptionText || 'Sin descripción disponible.'}
            </p>

            <div style={{ marginTop: 'auto', paddingTop: '.85rem', textAlign: 'center' }}>
              <span style={{ fontSize: '.68rem', color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                Toca para ver la oferta completa
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Actions, outside the card so a tap on the card never fights a tap on a button ── */}
      <div className="swipe-actions-row" onClick={(e) => e.stopPropagation()}>
        {isProcessing ? (
          <div className="swipe-status-panel">
            <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', marginBottom: '.4rem' }}>
              <span className="spinner" style={{ width: 14, height: 14 }} />
              <span style={{ fontWeight: 700, fontSize: '.85rem', color: 'var(--text)' }}>Applica está aplicando por ti</span>
            </div>
            <p style={{ fontSize: '.78rem', color: 'var(--text-2)', lineHeight: 1.5, margin: '0 0 .75rem' }}>
              Revisa la ventana, completa lo que falte, resuelve el captcha si aparece y dale Enviar.
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
            <div className="swipe-status-panel" style={{ background: 'var(--gold-dim)', borderColor: 'rgba(254,214,91,.5)' }}>
              <div style={{ fontWeight: 700, fontSize: '.85rem', color: 'var(--text)' }}>{r.title}</div>
              <p style={{ fontSize: '.78rem', color: 'var(--text-2)', margin: '.3rem 0 .75rem', lineHeight: 1.5 }}>{r.detail}</p>
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
              aria-label="Descartar esta vacante"
              disabled={actioningId === current.id || exiting !== null}
              onClick={() => doExit('left')}
              className="swipe-btn swipe-btn-ghost"
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
            <button
              disabled={actioningId === current.id || exiting !== null}
              onClick={() => setSavedForLaterIds((prev) => prev.includes(current.id) ? prev : [...prev, current.id])}
              className="swipe-btn swipe-btn-save"
              title="Guardar para después"
              aria-label="Guardar esta vacante para después"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4-7 4V4.5a1 1 0 0 1 1-1Z" /></svg>
            </button>
            <button
              title={isAtsApp(current) ? 'Abrimos la oferta con el formulario listo; solo resuelves el captcha y envías.' : 'Ver cómo aplicar a esta oferta.'}
              aria-label={actioningId === current.id ? 'Aplicando…' : 'Aplicar a esta vacante'}
              aria-busy={actioningId === current.id}
              disabled={actioningId === current.id || exiting !== null}
              onClick={() => doExit('right')}
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
  );
}

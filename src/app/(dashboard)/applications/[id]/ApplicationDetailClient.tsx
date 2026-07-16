'use client';
import { useState, useEffect } from'react';
import { useRouter } from'next/navigation';
import type { Application, Vacancy, Resume, CoverLetter, ApplicationSubmission } from'@/db/schema';
import { unresolvedBlockers, blockerQuestion } from'@/core/automation/blockers';

// Friendly, user-facing status labels (never show raw"failed" etc.).
const STATUS_LABELS: Record<string, { label: string; badge: string }> = {
  draft: { label: 'Preparando materiales…', badge: 'badge-ghost' },
  pending_review: { label: 'Lista para tu revisión', badge: 'badge-warning' },
  approved: { label: 'Enviando…', badge: 'badge-warning' },
  submitted: { label: 'Enviada', badge: 'badge-success' },
  failed: { label: 'Requiere aplicación manual', badge: 'badge-warning' },
  skipped: { label: 'Omitida', badge: 'badge-ghost' },
  archived: { label: 'Archivada', badge: 'badge-ghost' },
};

// Platforms whose application forms Applica can fill automatically.
const AUTO_APPLY_PLATFORMS = new Set(['greenhouse', 'lever', 'ashby', 'smartrecruiters']);

function toPlainText(value?: string | null) {
  if (!value) return'';
  return value
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '\n• ')
    .replace(/<\/\s*(p|div|li|ul|ol|h[1-6]|tr|section)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Older vacancies were scraped with a stripper that collapsed all whitespace,
 * leaving a single wall of text with no line breaks. Heuristically re-insert
 * breaks before common section headers and list-like patterns so they read
 * decently until they're re-scraped with structure preserved.
 */
const HEADER_KEYWORDS = [
  'Responsibilities', 'Requirements', 'Qualifications', 'Required Qualifications',
  'Preferred Qualifications', 'What You.ll Do', 'What You.ll Bring', 'What You.ll Need',
  'What We.re Looking For', 'Who You Are', 'Who You.ll Be', 'About You', 'About Us',
  'About The Role', 'About The Team', 'The Role', 'Your Mission', 'Our Mission',
  'Benefits', 'Perks', 'Perks And Benefits', 'What We Offer', 'Compensation',
  'Key Responsibilities', 'Nice To Have', 'Bonus Points', 'Our Core Commitments',
  'Why Join', 'Why Join Us', 'How We Work', 'The Opportunity', 'Day To Day',
];

function reflowFlatText(text: string): string {
  if (text.includes('\n')) return text; // already structured
  let out = text;
  // Break before known section headers (case-insensitive, whole-phrase).
  for (const kw of HEADER_KEYWORDS) {
    const re = new RegExp(`\\s+(${kw})(\\s*:|\\s+[A-Z])`, 'g');
    out = out.replace(re, (_m, head, tail) => `\n\n${head}${tail.trim() === ':' ? ':' : '\n' + tail.trim()}`);
  }
  // Break before bullet-ish" - " and" • " separators.
  out = out.replace(/\s+[•·]\s+/g, '\n• ').replace(/\s+[--]\s+(?=[A-Z])/g, '\n• ');
  return out;
}

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function buildFitSummary({
  score,
  breakdown,
  warnings,
  redFlags,
  decision,
}: {
  score?: number | null;
  breakdown?: Record<string, number> | null;
  warnings: string[];
  redFlags: string[];
  decision: any;
}) {
  if (!score || !breakdown) return'Aún no hay suficiente información para explicar el fit.';
  const strengths: string[] = [];
  if ((breakdown.roleMatch ?? 0) >= 25) strengths.push('el rol coincide bien');
  if ((breakdown.locationMatch ?? 0) >= 15) strengths.push('la ubicación encaja');
  if ((breakdown.seniorityMatch ?? 0) >= 7) strengths.push('la seniority parece compatible');
  if ((breakdown.learnedOutcomeAdjustment ?? 0) > 0) strengths.push('tu historial responde bien a roles parecidos');
  const caution = redFlags[0] || warnings[0] || decision?.blockingReasons?.[0];
  const learnedCaution = (breakdown.learnedOutcomeAdjustment ?? 0) < 0
    ? 'tu historial reciente ha respondido peor a roles parecidos'
    : null;
  const base = strengths.length > 0
    ? `Buen fit porque ${strengths.join(', ')}.`
    : 'El encaje es razonable, pero no hay una señal dominante.';
  return caution
    ? `${base} Ojo: ${caution}`
    : learnedCaution
      ? `${base} Ojo: ${learnedCaution}.`
      : base;
}

/** Renders plain-text descriptions with bold-ish headers, bullets and paragraphs. */
function FormattedDescription({ text }: { text: string }) {
  const lines = reflowFlatText(text).split('\n');
  return (
    <div style={{ fontSize: '.8125rem', color: 'var(--text-2)', lineHeight: 1.7 }}>
      {lines.map((raw, i) => {
        const t = raw.trim();
        if (!t) return <div key={i} style={{ height: '.45rem' }} />;
        if (t.startsWith('•')) {
          return (
            <div key={i} style={{ display: 'flex', gap: '.45rem', marginLeft: '.25rem', marginBottom: '.2rem' }}>
              <span style={{ color: 'var(--gold)' }}>•</span><span>{t.replace(/^•\s*/, '')}</span>
            </div>
          );
        }
        const isHeader = t.length <= 70 && (t.endsWith(':') || /^[A-ZÁÉÍÓÚÑ0-9 &/().,'’-]+$/.test(t));
        if (isHeader) return <div key={i} style={{ fontWeight: 700, color: 'var(--text)', marginTop: i > 0 ? '.85rem' : 0, marginBottom: '.3rem' }}>{t}</div>;
        return <p key={i} style={{ margin: '0 0 .55rem' }}>{t}</p>;
      })}
    </div>
  );
}

const RADAR_DIMS: Array<{ key: string; label: string; max: number }> = [
  { key: 'roleMatch', label: 'Rol', max: 30 },
  { key: 'skillMatch', label: 'Skills', max: 10 },
  { key: 'expertiseMatch', label: 'Experiencia', max: 12 },
  { key: 'industryMatch', label: 'Industria', max: 15 },
  { key: 'locationMatch', label: 'Ubicación', max: 15 },
  { key: 'seniorityMatch', label: 'Seniority', max: 10 },
  { key: 'salaryMatch', label: 'Salario', max: 10 },
];

function ScoreRadar({ breakdown }: { breakdown: Record<string, number> }) {
  const dims = RADAR_DIMS;
  const n = dims.length;
  const cx = 170, cy = 150, R = 80;
  const pt = (i: number, r: number): [number, number] => {
    const a = (i * (360 / n) - 90) * Math.PI / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const ringPoly = (frac: number) => dims.map((_, i) => pt(i, R * frac).join(',')).join(' ');
  const dataPts = dims.map((d, i) => pt(i, R * Math.min(1, Math.max(0, Number(breakdown[d.key] ?? 0)) / d.max)));
  return (
    <svg viewBox="0 0 340 300" width="100%" style={{ maxWidth: 360, margin: '0 auto', display: 'block' }}>
      {[0.25, 0.5, 0.75, 1].map((f) => <polygon key={f} points={ringPoly(f)} fill="none" stroke="var(--border)" strokeWidth={1} />)}
      {dims.map((_, i) => { const [x, y] = pt(i, R); return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--border)" strokeWidth={1} />; })}
      <polygon points={dataPts.map((p) => p.join(',')).join(' ')} fill="rgba(42,74,79,.20)" stroke="var(--petrol)" strokeWidth={2} />
      {dataPts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={2.5} fill="var(--petrol)" />)}
      {dims.map((d, i) => {
        const [x, y] = pt(i, R + 15);
        const anchor = Math.abs(x - cx) < 8 ? 'middle' : x > cx ? 'start' : 'end';
        const val = Number(breakdown[d.key] ?? 0);
        return (
          <text key={d.key} x={x} y={y} textAnchor={anchor} dominantBaseline="middle" style={{ fontSize: 10, fill: 'var(--text-2)', fontWeight: 600 }}>
            {d.label} {val > 0 ? `+${val}` : val}
          </text>
        );
      })}
    </svg>
  );
}

type Props = {
  app: Application;
  vacancy: Vacancy | null;
  resume: Resume | null;
  coverLetter: CoverLetter | null;
  submission: ApplicationSubmission | null;
  vacancyOnly?: boolean;
};

export default function ApplicationDetailClient({ app, vacancy, resume, coverLetter, submission, vacancyOnly = false }: Props) {
  const router = useRouter();
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const answers = (app.formAnswers as Record<string, string>) ?? {};
  const [responseLoading, setResponseLoading] = useState<'unknown' | 'contacted' | 'rejected' | null>(null);
  const [descExpanded, setDescExpanded] = useState(false);

  const decision = app.submissionDecision as any;
  // Required questions we still can't answer - the user fills them here.
  const pendingBlockers = unresolvedBlockers(decision?.formPreview?.blockers, answers);
  const [extraAnswers, setExtraAnswers] = useState<Record<string, string>>({});
  const [savingExtra, setSavingExtra] = useState(false);
  const breakdown = vacancy?.scoreBreakdown as any;
  const score = vacancy?.score;
  const canAutoApply = AUTO_APPLY_PLATFORMS.has(vacancy?.platform ?? '');
  const statusMeta = STATUS_LABELS[app.status as string] ?? { label: String(app.status), badge: 'badge-ghost' };
  const scoreColor = score && score >= 80 ? '#4ecca3' : score && score >= 60 ? '#f0c040' : '#e57373';
  const vacancyDescription = toPlainText(vacancy?.description);
  const hasAnswers = Object.keys(answers).length > 0;
  const fitSummary = buildFitSummary({
    score,
    breakdown,
    warnings: (vacancy?.warnings as string[] | null) ?? [],
    redFlags: (vacancy?.redFlags as string[] | null) ?? [],
    decision,
  });

  async function doAction(action: string) {
    setActionLoading(action);
    setActionError(null);
    const response = await fetch(`/api/applications/${app.id}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    const payload = await response.json().catch(() => null);
    setActionLoading(null);
    if (!response.ok) {
      setActionError(payload?.blockers?.join(' ') || payload?.error || 'No se pudo completar la acción.');
      router.refresh();
      return;
    }
    if (action === 'approve' || action === 'mark_applied') router.push('/applications');
    else router.refresh();
  }

  async function saveExtraAnswers() {
    setSavingExtra(true);
    await fetch(`/api/applications/${app.id}/answers`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers: extraAnswers }),
    });
    // One decisive action: if we can auto-apply, send right away. Otherwise just
    // save so the manual flow has everything ready.
    if (canAutoApply) {
      await doAction('approve');
    } else {
      setSavingExtra(false);
      router.refresh();
    }
  }

  // While an application is being sent (status'approved' = queued for the
  // worker), poll so the user sees the final outcome (Enviada / Manual) without
  // refreshing manually.
  useEffect(() => {
    if (app.status !== 'approved') return;
    const interval = setInterval(() => router.refresh(), 3000);
    const stop = setTimeout(() => clearInterval(interval), 30000);
    return () => { clearInterval(interval); clearTimeout(stop); };
  }, [app.status, router]);

  async function setMarketResponse(response: 'unknown' | 'contacted' | 'rejected') {
    setResponseLoading(response);
    await fetch(`/api/applications/${app.id}/response`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ response }),
    });
    setResponseLoading(null);
    router.refresh();
  }

  // Discard works whether this is a real application (archive) or a low-score
  // vacancy-only review (whose id is a vacancy id, archived via its own endpoint).
  async function discard() {
    setActionLoading('discard');
    const url = vacancyOnly ? `/api/vacancies/${app.id}/discard` : `/api/applications/${app.id}/action`;
    const body = vacancyOnly ? {} : { action: 'archive' };
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    router.push('/applications');
  }

  // "Apply anyway" to a low-score vacancy: create the application + prepare
  // materials, then jump to the normal apply flow.
  async function applyAnyway() {
    setActionLoading('applyAnyway');
    const res = await fetch(`/api/vacancies/${app.id}/apply`, { method: 'POST' });
    const data = await res.json().catch(() => null);
    if (data?.applicationId) router.push(`/applications/${data.applicationId}`);
    else { setActionLoading(null); router.refresh(); }
  }

  const isDiscarded = (app.status as string) === 'archived';

  return (
    <div className="animate-fadein">
      {/* Back + Discard */}
      <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
        <button className="btn btn-ghost btn-sm" onClick={() => router.push('/applications')}>
           Volver a aplicaciones
        </button>
        {!isDiscarded && (
          <button className="btn btn-ghost btn-sm" disabled={actionLoading === 'discard'} onClick={discard} style={{ color: 'var(--text-3)' }} title="Descartar esta vacante y quitarla de tu lista">
            {actionLoading === 'discard' ? 'Descartando…' : 'Descartar vacante'}
          </button>
        )}
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1.5rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
        <div>
          <div className="page-eyebrow">{vacancy?.platform}</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '1.75rem', fontWeight: 600, marginBottom: '.25rem' }}>
            {vacancy?.title ?? 'Sin título'}
          </h1>
          <div style={{ fontSize: '.9rem', color: 'var(--text-2)', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--gold-light)', fontWeight: 600 }}>{vacancy?.company}</span>
            {vacancy?.location && <span>· {vacancy.location}</span>}
            {vacancy?.url && (
              <a href={vacancy.url} target="_blank" rel="noopener" className="btn btn-secondary btn-sm" style={{ textDecoration: 'none' }}>
                Ver oferta original
              </a>
            )}
          </div>
        </div>

        {/* Score */}
        {score !== null && score !== undefined && (
          <div style={{ textAlign: 'center', flexShrink: 0, padding: '0.5rem 1.5rem', background: 'var(--surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '2.5rem', fontWeight: 300, color: scoreColor, lineHeight: 1 }}>{score}</div>
            <div style={{ fontSize: '.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', color: 'var(--text-3)', marginTop: '.25rem' }}>Fit Score</div>
          </div>
        )}
      </div>

      {/* Status row */}
      <div style={{ display: 'flex', gap: '.75rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <span className={`badge ${statusMeta.badge}`}>{statusMeta.label}</span>
        <span className="badge badge-petrol">{app.mode}</span>
        {submission?.submittedAutomatically && <span className="badge badge-gold">Auto-enviado</span>}
        {submission?.approvedByUser && <span className="badge badge-success">Aprobado por usuario</span>}
        {submission?.submissionTimestamp && (
          <span style={{ fontSize: '.73rem', color: 'var(--text-3)' }}>
            Enviado: {new Date(submission.submissionTimestamp).toLocaleString('es')}
          </span>
        )}
        {app.responseStatus === 'contacted' && <span className="badge badge-success">Te llamaron</span>}
        {pendingBlockers.length > 0 && <span className="badge badge-warning">Faltan {pendingBlockers.length} dato{pendingBlockers.length === 1 ? '' : 's'}</span>}
      </div>

      {/* Solicitan información adicional */}
      {pendingBlockers.length > 0 && (
        <div style={{ marginBottom: '1.5rem', padding: '1.25rem 1.5rem', borderRadius: 'var(--radius-lg)', background: 'rgba(240,192,64,.10)', border: '1px solid rgba(240,192,64,.4)' }}>
          <div style={{ fontWeight: 700, fontSize: '.95rem', color: '#b8860b', marginBottom: '.35rem' }}>Solicitan información adicional</div>
          <p style={{ fontSize: '.82rem', color: 'var(--text-2)', margin: '0 0 1rem', lineHeight: 1.5 }}>
            Esta vacante pide datos que no teníamos. Complétalos y podrás enviar la aplicación automáticamente.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.85rem' }}>
            {pendingBlockers.map((b, i) => {
              const q = blockerQuestion(b);
              return (
                <div key={i}>
                  <label style={{ display: 'block', fontSize: '.8rem', fontWeight: 600, color: 'var(--text)', marginBottom: '.3rem' }}>{q}</label>
                  <input className="input" value={extraAnswers[q] ?? ''} placeholder="Tu respuesta…"
                    onChange={(e) => setExtraAnswers((s) => ({ ...s, [q]: e.target.value }))} style={{ width: '100%' }} />
                </div>
              );
            })}
          </div>
          <button className="btn btn-primary" style={{ marginTop: '1rem' }}
            disabled={savingExtra || !!actionLoading || pendingBlockers.some((b) => !((extraAnswers[blockerQuestion(b)] ?? '').trim()))}
            onClick={saveExtraAnswers}>
            {savingExtra || actionLoading === 'approve'
              ? (canAutoApply ? 'Enviando…' : 'Guardando…')
              : (canAutoApply ? 'Guardar y enviar' : 'Guardar')}
          </button>
        </div>
      )}

      <p style={{ fontSize: '1rem', color: 'var(--text)', marginBottom: '2rem', padding: '1rem', background: 'rgba(42, 74, 79, 0.05)', borderRadius: 'var(--radius-md)', borderLeft: '4px solid var(--petrol)' }}>
        <strong>Resumen de IA:</strong> {fitSummary}
      </p>

      {/* Why the score is low */}
      {(score ?? 100) < 70 && (((vacancy?.warnings as string[] | null)?.length ?? 0) > 0 || ((vacancy?.redFlags as string[] | null)?.length ?? 0) > 0) && (
        <div style={{ marginBottom: '1.5rem', padding: '1rem 1.15rem', borderRadius: 'var(--radius-md)', background: 'rgba(240,192,64,.10)', border: '1px solid rgba(240,192,64,.35)' }}>
          <div style={{ fontWeight: 700, fontSize: '.82rem', color: '#b8860b', marginBottom: '.5rem' }}>
            Por qué esta vacante tiene puntaje bajo:
          </div>
          <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '.8rem', color: 'var(--text-2)', lineHeight: 1.6 }}>
            {[...((vacancy?.redFlags as string[] | null) ?? []), ...((vacancy?.warnings as string[] | null) ?? [])].slice(0, 6).map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid-2" style={{ gap: '1.5rem' }}>
        {/* Vacancy description */}
        <div className="card">
          <div className="card-label">Descripción de la vacante</div>
          {vacancyDescription ? (
            <>
              <div style={{ maxHeight: descExpanded ? 'none' : 320, overflow: 'hidden', position: 'relative' }}>
                <FormattedDescription text={descExpanded ? vacancyDescription : vacancyDescription.slice(0, 1100)} />
                {!descExpanded && vacancyDescription.length > 1100 && (
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 48, background: 'linear-gradient(transparent, var(--surface))' }} />
                )}
              </div>
              {vacancyDescription.length > 1100 && (
                <button className="btn btn-ghost btn-sm" style={{ marginTop: '.5rem' }} onClick={() => setDescExpanded((v) => !v)}>
                  {descExpanded ? 'Ver menos' : 'Ver descripción completa'}
                </button>
              )}
            </>
          ) : (
            <p style={{ fontSize: '.8125rem', color: 'var(--text-3)' }}>
              No tenemos la descripción completa guardada. Ábrela en el sitio original
            </p>
          )}
        </div>

        {/* Score radar */}
        <div className="card">
          <div className="card-label">Breakdown de puntuación</div>
          {breakdown ? (
            <ScoreRadar breakdown={breakdown} />
          ) : <p style={{ fontSize: '.8125rem', color: 'var(--text-3)' }}>Sin datos de scoring</p>}
          {(vacancy?.redFlags ?? []).length > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <div className="card-label" style={{ color: '#e57373' }}>Red flags</div>
              {(vacancy!.redFlags as string[]).map((f, i) => (
                <div key={i} style={{ fontSize: '.78rem', color: '#e57373', marginTop: '.25rem' }}>{f}</div>
              ))}
            </div>
          )}
          {(vacancy?.warnings ?? []).length > 0 && (
            <div style={{ marginTop: '.75rem' }}>
              <div className="card-label" style={{ color: '#f0c040' }}>Avisos</div>
              {(vacancy!.warnings as string[]).map((w, i) => (
                <div key={i} style={{ fontSize: '.78rem', color: '#f0c040', marginTop: '.25rem' }}>· {w}</div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── ACCIÓN ── */}
      {vacancyOnly ? (
        <div className="card" style={{ marginTop: '2rem', textAlign: 'center' }}>
          <div className="card-label" style={{ fontSize: '1.05rem', marginBottom: '.75rem' }}>Esta vacante quedó por debajo del umbral recomendado</div>
          <p style={{ fontSize: '.85rem', color: 'var(--text-2)', maxWidth: 560, margin: '0 auto 1.5rem', lineHeight: 1.6 }}>
            No preparamos CV ni carta automáticamente para vacantes de bajo puntaje. Pero si a ti te interesa, dale <strong>Aplicar de todos modos</strong> y preparamos todo para que la envíes como cualquier otra.
          </p>
          <div style={{ display: 'flex', gap: '.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" disabled={!!actionLoading} onClick={applyAnyway} style={{ padding: '0.7rem 1.4rem' }}>
              {actionLoading === 'applyAnyway' ? 'Preparando materiales…' : 'Aplicar de todos modos'}
            </button>
            {vacancy?.url && (
              <a href={vacancy.url} target="_blank" rel="noopener" className="btn btn-secondary" style={{ textDecoration: 'none', padding: '0.7rem 1.25rem' }}>
                Ir a la oferta
              </a>
            )}
            {!isDiscarded && (
              <button className="btn btn-ghost" disabled={!!actionLoading} onClick={discard} style={{ color: 'var(--text-3)', padding: '0.7rem 1.25rem' }}>
                {actionLoading === 'discard' ? 'Descartando…' : 'Descartar vacante'}
              </button>
            )}
          </div>
        </div>
      ) : (
      <div className="card" style={{ marginTop: '2rem' }}>
        <div className="card-label" style={{ fontSize: '1.1rem', marginBottom: '1.5rem', textAlign: 'center' }}>¿Cómo quieres aplicar?</div>

        <div className="grid-2" style={{ gap: '1.5rem' }}>
          {/* Option A: automatic - one click */}
          <div style={{ padding: '1.5rem', border: canAutoApply ? '2px solid var(--petrol)' : '1px solid var(--border)', borderRadius: 'var(--radius-lg)', background: canAutoApply ? 'rgba(42, 74, 79, 0.03)' : 'var(--surface)', display: 'flex', flexDirection: 'column', gap: '1rem', opacity: canAutoApply ? 1 : 0.65 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ fontSize: '1.5rem' }}></div>
              <div style={{ fontWeight: 600, fontSize: '1.1rem', color: 'var(--text)' }}>Envío automático</div>
            </div>

            {canAutoApply ? (
              <>
                <p style={{ fontSize: '.85rem', color: 'var(--text-2)', lineHeight: 1.6, margin: 0 }}>
                  Un solo clic: el agente entra al formulario de {vacancy?.platform}, sube tu CV adaptado y tu carta, responde las preguntas y envía la aplicación por ti. No tienes que revisar nada.
                </p>
                {app.status === 'pending_review' ? (
                  <div style={{ marginTop: 'auto', paddingTop: '1.5rem' }}>
                    {actionError && (
                      <div style={{ marginBottom: '1rem', padding: '0.75rem', borderRadius: 'var(--radius-sm)', background: 'var(--danger-dim)', color: '#e57373', fontSize: '.8rem' }}>
                        {actionError}
                      </div>
                    )}
                    <button className="btn btn-primary" disabled={!!actionLoading} onClick={() => doAction('approve')} style={{ width: '100%', padding: '0.85rem', fontSize: '1rem' }} title="Applica llena y envía la aplicación automáticamente">
                      {actionLoading === 'approve' ? <><span className="spinner" />Enviando…</> : 'Enviar ahora (1 clic)'}
                    </button>
                  </div>
                ) : (
                  <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid var(--border-light)' }}>
                    <span style={{ fontSize: '.85rem', color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      Estado: <strong className={`badge ${statusMeta.badge}`}>{statusMeta.label}</strong>
                    </span>
                  </div>
                )}
              </>
            ) : (
              <p style={{ fontSize: '.85rem', color: 'var(--text-3)', lineHeight: 1.6, margin: 0 }}>
                <strong style={{ textTransform: 'capitalize' }}>{vacancy?.platform}</strong> requiere iniciar sesión en tu cuenta, así que el envío automático no está disponible aquí. Usa la opción manual: te dejamos todo listo para descargar y subir en segundos.
              </p>
            )}
          </div>

          {/* Option B: manual - download materials + go to post */}
          <div style={{ padding: '1.5rem', border: !canAutoApply ? '2px solid var(--gold)' : '1px solid var(--border)', borderRadius: 'var(--radius-lg)', background: 'var(--surface)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ fontSize: '1.5rem' }}></div>
              <div style={{ fontWeight: 600, fontSize: '1.1rem', color: 'var(--text)' }}>Aplicar manualmente</div>
            </div>
            <p style={{ fontSize: '.85rem', color: 'var(--text-2)', lineHeight: 1.6, margin: 0 }}>
              Descarga tu CV, tu carta y las respuestas que preparamos, abre la oferta y súbelos tú mismo.
            </p>

            <div style={{ marginTop: 'auto', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {(resume?.textContent || coverLetter?.content || hasAnswers) ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
                  <div style={{ fontSize: '.72rem', color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                    1. Descarga tus materiales
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem' }}>
                    {resume?.textContent && (
                      <button className="btn btn-secondary btn-sm" title="Descargar tu CV adaptado a esta vacante" onClick={() => downloadText(`CV - ${vacancy?.company ?? 'vacante'}.txt`, resume.textContent!)}>CV</button>
                    )}
                    {coverLetter?.content ? (
                      <button className="btn btn-secondary btn-sm" title="Descargar tu carta de presentación" onClick={() => downloadText(`Carta - ${vacancy?.company ?? 'vacante'}.txt`, coverLetter.content)}>Carta</button>
                    ) : (
                      // Applica no genera carta salvo que el formulario la exija
                      // explícitamente - si esta vacante sí la pide y no se detectó,
                      // el usuario la pide aquí manualmente.
                      <button className="btn btn-ghost btn-sm" disabled={actionLoading === 'regenerate_letter'} title="Esta vacante no mostró un campo obligatorio de carta - genera una solo si de verdad la piden" onClick={() => doAction('regenerate_letter')}>
                        {actionLoading === 'regenerate_letter' ? 'Generando…' : '+ Generar carta'}
                      </button>
                    )}
                    {hasAnswers && (
                      <button className="btn btn-secondary btn-sm" title="Descargar las preguntas y respuestas del formulario" onClick={() => downloadText(`Respuestas - ${vacancy?.company ?? 'vacante'}.txt`, Object.entries(answers).map(([q, a]) => `${q}\n${a}\n`).join('\n'))}>Preguntas y respuestas</button>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: '.78rem', color: 'var(--text-3)' }}>Estamos preparando tus materiales…</div>
              )}

              {vacancy?.url ? (
                <a href={vacancy.url} target="_blank" rel="noopener" className="btn btn-secondary" style={{ textDecoration: 'none', textAlign: 'center', padding: '0.75rem' }} title="Abre la oferta para llenar el formulario con tus materiales">
                  2. Ir a la oferta y llenar el formulario
                </a>
              ) : (
                <span style={{ fontSize: '.85rem', color: 'var(--text-3)' }}>No hay enlace disponible.</span>
              )}

              {app.status === 'pending_review' && (
                <button className="btn btn-ghost" disabled={!!actionLoading} onClick={() => doAction('mark_applied')} style={{ padding: '0.75rem', fontSize: '0.9rem', color: 'var(--petrol)' }} title="Marca esta aplicación como ya enviada manualmente">
                  {actionLoading === 'mark_applied' ? 'Guardando…' : '3. Marcar como"Ya apliqué" '}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Follow-up after submission */}
      {app.status === 'submitted' && (
        <div className="card" style={{ marginTop: '2rem', border: '2px solid rgba(78, 204, 163, 0.2)' }}>
          <div className="card-label" style={{ color: 'var(--success)' }}>Seguimiento</div>
          <div className="card-title" style={{ marginBottom: '.5rem' }}>¿Te contactaron por esta aplicación?</div>
          <p style={{ fontSize: '.85rem', color: 'var(--text-2)', marginBottom: '1.5rem' }}>
            Registrar el resultado le enseña a tu Autopilot a traerte mejores vacantes la próxima vez.
          </p>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" disabled={!!responseLoading} onClick={() => setMarketResponse('contacted')}>
              {responseLoading === 'contacted' ? 'Guardando…' : 'Sí, me llamaron'}
            </button>
            <button className="btn btn-secondary" disabled={!!responseLoading} onClick={() => setMarketResponse('rejected')}>
              {responseLoading === 'rejected' ? 'Guardando…' : 'Me rechazaron'}
            </button>
            <button className="btn btn-ghost" disabled={!!responseLoading} onClick={() => setMarketResponse('unknown')}>
              {responseLoading === 'unknown' ? 'Guardando…' : 'Aún sin respuesta'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

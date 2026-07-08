'use client';
import { useState, useEffect } from 'react';

/**
 * Last-resort offer to install the Applica browser extension. Shown inside the
 * assisted-apply panel (i.e. exactly when the user hits a verification-gated ATS
 * that keeps needing a window). Framed as "99% -> 100%": the extension fills the
 * form right in the user's own browser, so no more popup windows, anti-bot blocks
 * or profile conflicts. Self-contained: fetches the user's extension token on open.
 */
export function ExtensionOffer() {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (open && token === null) {
      fetch('/api/extension/token').then((r) => r.json()).then((d) => setToken(d.token ?? '')).catch(() => setToken(''));
    }
  }, [open, token]);
  return (
    <div style={{ width: '100%', marginTop: '.6rem', paddingTop: '.6rem', borderTop: '1px dashed rgba(18,51,56,.18)' }}>
      {!open ? (
        <button onClick={() => setOpen(true)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-gold)', fontWeight: 600, fontSize: '.76rem' }}>
          ¿Cansado de abrir ventanas? Pasa de 99% a 100% con la extensión Applica
        </button>
      ) : (
        <div style={{ fontSize: '.76rem', color: 'var(--text-2)', lineHeight: 1.55 }}>
          <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: '.3rem' }}>Extensión Applica: llena la postulación en tu propio navegador</div>
          Sin ventanas emergentes, sin bloqueos anti-bot. Un clic y se llena todo; solo el captcha y los datos que no sabemos quedan para ti.
          <ol style={{ margin: '.5rem 0', paddingLeft: '1.1rem' }}>
            <li>Abre <code>brave://extensions</code>, activa &quot;Modo de desarrollador&quot;, &quot;Cargar descomprimida&quot; y elige la carpeta <code>extension/</code>.</li>
            <li>Abre la extensión, pega tu token y &quot;Conectar&quot;:</li>
          </ol>
          <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center', margin: '.3rem 0 .5rem' }}>
            <input readOnly value={token ?? 'Cargando...'} style={{ flex: 1, fontSize: '.72rem', padding: '6px 8px', borderRadius: 6, border: '1px solid rgba(18,51,56,.25)', fontFamily: 'monospace' }} onFocus={(e) => e.currentTarget.select()} />
            <button onClick={() => { if (token) { navigator.clipboard.writeText(token); setCopied(true); setTimeout(() => setCopied(false), 1500); } }} className="btn btn-primary btn-sm" style={{ whiteSpace: 'nowrap' }}>{copied ? 'Copiado' : 'Copiar'}</button>
          </div>
          <div>3. En la vacante, pulsa &quot;Llenar con Applica&quot; (abajo a la derecha). <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', textDecoration: 'underline', fontSize: '.74rem' }}>Ocultar</button></div>
        </div>
      )}
    </div>
  );
}

export const CompanyLogo = ({ companyName }: { companyName: string }) => {
  const [error, setError] = useState(false);
  const initial = companyName.charAt(0).toUpperCase();

  if (error || !companyName || companyName === 'N/A') {
    return <div className="company-avatar">{initial}</div>;
  }

  const domain = companyName.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com';

  return (
    <img
      src={`https://logo.clearbit.com/${domain}`}
      alt={companyName}
      className="company-avatar"
      style={{ objectFit: 'contain', background: 'white' }}
      onError={() => setError(true)}
    />
  );
};

export function ScoreRing({ score, size = 38 }: { score: number | null | undefined; size?: number }) {
  if (!score) return <span style={{ color: 'var(--text-3)', fontSize: '.75rem' }}>-</span>;
  const r = (size / 2) - 5, c = 2 * Math.PI * r, fill = (score / 100) * c;
  const color = score >= 80 ? '#4ecca3' : score >= 60 ? '#f0c040' : '#e57373';
  const half = size / 2;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={half} cy={half} r={r} fill="none" stroke="var(--surface-2)" strokeWidth="3" />
      <circle cx={half} cy={half} r={r} fill="none" stroke={color} strokeWidth="3"
        strokeDasharray={`${fill} ${c}`} strokeLinecap="round" />
      <text x={half} y={half} textAnchor="middle" dominantBaseline="central"
        style={{ transform: `rotate(90deg)`, transformOrigin: `${half}px ${half}px`, fill: color, fontSize: size * 0.24, fontWeight: 700 }}>
        {score}
      </text>
    </svg>
  );
}

export const STATUS_META: Record<string, { label: string; badge: string }> = {
  draft: { label: 'Preparando materiales', badge: 'badge-petrol' },
  pending_review: { label: 'Necesita tu atención', badge: 'badge-warning' },
  approved: { label: 'Abriendo la oferta…', badge: 'badge-warning' },
  submitted: { label: 'Enviado', badge: 'badge-success' },
  failed: { label: 'Fallido', badge: 'badge-danger' },
  skipped: { label: 'Omitido', badge: 'badge-ghost' },
  archived: { label: 'Archivado', badge: 'badge-ghost' },
  filtered: { label: 'Puntaje Bajo (No recomendada)', badge: 'badge-danger' },
};

export const MODE_META: Record<string, string> = {
  auto: 'Auto',
  semi: 'Semi',
  manual: 'Manual',
  none: '-',
};

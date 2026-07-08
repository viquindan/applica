'use client';
import { useState } from 'react';

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

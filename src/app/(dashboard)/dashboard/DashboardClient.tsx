'use client';
import { useI18n } from'@/i18n/context';
import { useRouter } from'next/navigation';
import { useState } from'react';

type Stats = {
  total: number; thisWeek: number; pendingReview: number;
  submitted: number; successRate: number; recent: any[];
};

const STATUS_BADGE: Record<string, string> = {
  draft: 'badge-ghost', pending_review: 'badge-warning',
  approved: 'badge-petrol', submitted: 'badge-success',
  failed: 'badge-danger', skipped: 'badge-ghost', archived: 'badge-ghost',
};
const STATUS_LABELS: Record<string, string> = {
  draft: 'Preparando materiales', pending_review: 'Necesita atención', approved: 'Aprobado',
  submitted: 'Enviado', failed: 'Fallido', skipped: 'Omitido', archived: 'Archivado',
};

function ScoreRing({ score }: { score: number | null | undefined }) {
  if (!score) return <span style={{ color: 'var(--text-3)', fontSize: '.75rem' }}>-</span>;
  const r = 13, c = 2 * Math.PI * r, fill = (score / 100) * c;
  const color = score >= 80 ? '#4ecca3' : score >= 60 ? '#f0c040' : '#e57373';
  return (
    <svg width="34" height="34" style={{ transform: 'rotate(-90deg)' }}>
      <circle cx="17" cy="17" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="3" />
      <circle cx="17" cy="17" r={r} fill="none" stroke={color} strokeWidth="3"
        strokeDasharray={`${fill} ${c}`} strokeLinecap="round" />
      <text x="17" y="17" textAnchor="middle" dominantBaseline="central"
        style={{ transform: 'rotate(90deg)', transformOrigin: '17px 17px', fill: color, fontSize: '8px', fontWeight: 700 }}>
        {score}
      </text>
    </svg>
  );
}

export default function DashboardClient({ stats, userName }: { stats: Stats; userName: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [searching, setSearching] = useState(false);
  const firstName = userName.split(' ')[0];

  async function runSearch() {
    setSearching(true);
    await fetch('/api/search/run', { method: 'POST' });
    setSearching(false);
    router.refresh();
  }

  const METRICS = [
    { label: 'Aplicaciones totales', value: stats.total, color: 'var(--text)' },
    { label: 'Esta semana', value: stats.thisWeek, color: 'var(--gold-light)' },
    { label: 'En revisión', value: stats.pendingReview, color: '#f0c040', action: () => router.push('/review') },
    { label: 'Tasa de envío', value: `${stats.successRate}%`, color: '#4ecca3' },
  ];

  return (
    <div className="animate-fadein">
      <header className="page-header relative overflow-hidden glass-panel rounded-xl p-8 mb-8 border border-white/10 shadow-lg">
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--petrol)]/20 to-[var(--gold)]/10 pointer-events-none"></div>
        <div className="relative z-10">
          <div className="page-eyebrow tracking-widest text-[var(--gold-light)]">Applica Network</div>
          <h1 className="page-title text-4xl font-display text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400 mb-2">
            <span style={{ fontWeight: 300, fontStyle: 'italic' }}>Hola,</span> {firstName}
          </h1>
          <p className="page-subtitle text-[var(--text-3)] text-lg">Inteligencia de Adquisición de Talento</p>
        </div>
      </header>

      {/* Metrics */}
      <div className="grid-4" style={{ marginBottom: '2rem' }}>
        {METRICS.map(m => (
          <div key={m.label} className={`card glass-panel card-hover ${m.action ? 'cursor-pointer' : ''}`}
            style={{ cursor: m.action ? 'pointer' : 'default' }}
            onClick={m.action}>
            <div className="metric-card">
              <div className="metric-value" style={{ color: m.color }}>{m.value}</div>
              <div className="metric-label">{m.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Action strip */}
      <div className="card card-petrol" style={{ marginBottom: '2rem', padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 600 }}>
            {searching ? 'Buscando vacantes…' : 'Sistema listo'}
          </div>
          <div style={{ fontSize: '.75rem', color: 'var(--text-3)', marginTop: '.2rem' }}>
            Modo: Semi-automatizado · Próxima búsqueda: automática cada 6h
          </div>
        </div>
        <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={runSearch} disabled={searching}>
            {searching ? <><span className="spinner" />Buscando…</> : 'Ejecutar búsqueda'}
          </button>
          {stats.pendingReview > 0 && (
            <button className="btn btn-secondary" onClick={() => router.push('/review')}>
               Revisar cola
              <span className="badge badge-warning" style={{ marginLeft: '.35rem' }}>{stats.pendingReview}</span>
            </button>
          )}
        </div>
      </div>

      {/* Recent */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 600 }}>Actividad reciente</h2>
          <button className="btn btn-ghost btn-sm" onClick={() => router.push('/applications')}>Ver todo</button>
        </div>
        {stats.recent.length === 0 ? (
          <div className="empty-state" style={{ padding: '4rem 2rem' }}>
            <div className="empty-state-icon"></div>
            <h3>Sin aplicaciones aún</h3>
            <p style={{ fontSize: '.8125rem' }}>Ejecuta una búsqueda para comenzar a procesar vacantes.</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Empresa</th><th>Rol</th><th>Score</th>
                  <th>Estado</th><th>Modo</th><th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {stats.recent.map((app: any) => (
                  <tr key={app.id} style={{ cursor: 'pointer' }}
                    onClick={() => router.push(`/applications/${app.id}`)}>
                    <td style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '.9rem', color: 'var(--text)' }}>
                      {app.company}
                    </td>
                    <td style={{ maxWidth: 200 }}>
                      <span className="truncate" style={{ display: 'block' }}>{app.title}</span>
                    </td>
                    <td><ScoreRing score={app.score} /></td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[app.status] || 'badge-ghost'}`}>
                        {STATUS_LABELS[app.status] || app.status}
                      </span>
                    </td>
                    <td style={{ fontSize: '.73rem', color: 'var(--text-3)' }}>{app.mode}</td>
                    <td style={{ fontSize: '.73rem', color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
                      {new Date(app.createdAt).toLocaleDateString('es', { day: '2-digit', month: 'short' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

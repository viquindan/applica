import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { isSearchTuningUser } from '@/lib/searchTuning';
import { loadSwipeFeedback } from './data';

export const metadata = { title: 'Afinamiento del motor' };

export default async function SwipeReviewPage() {
  const session = await auth();
  if (!isSearchTuningUser(session?.user?.email)) redirect('/applications');

  const rows = await loadSwipeFeedback(session!.user.id);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <h1 style={{ margin: 0 }}>Afinamiento del motor</h1>
        <p style={{ color: 'var(--text-3)', margin: '.25rem 0 0' }}>
          Motivos que dejaste al swipear en el Feed, más recientes primero. {rows.length} en total.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="card">
          <p style={{ margin: 0, color: 'var(--text-3)' }}>Todavía no hay motivos guardados.</p>
        </div>
      ) : (
        rows.map((row) => (
          <div key={row.id} className="card card-sm">
            <div className="card-header">
              <div>
                <div className="card-title">
                  {row.vacancy?.url ? (
                    <a href={row.vacancy.url} target="_blank" rel="noreferrer">
                      {row.vacancy?.title ?? 'Vacante eliminada'}
                    </a>
                  ) : (row.vacancy?.title ?? 'Vacante eliminada')}
                </div>
                <div style={{ fontSize: '.875rem', color: 'var(--text-3)' }}>
                  {row.vacancy?.company}{row.vacancy?.location ? ` · ${row.vacancy.location}` : ''}
                </div>
              </div>
              <span className={`badge ${row.decision === 'positive' ? 'badge-success' : 'badge-danger'}`}>
                {row.decision === 'positive' ? 'Aplicó' : 'Descartó'}
              </span>
            </div>

            <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{row.reason}</p>

            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
              {row.scoreAtDecision != null && (
                <span className="badge badge-gold">{row.scoreAtDecision}% de coincidencia</span>
              )}
              <span style={{ fontSize: '.75rem', color: 'var(--text-3)' }}>
                {new Date(row.createdAt).toLocaleString('es')}
              </span>
            </div>

            {row.scoreBreakdownAtDecision != null && (
              <details>
                <summary style={{ cursor: 'pointer', fontSize: '.8rem', color: 'var(--text-3)' }}>
                  Desglose del score
                </summary>
                <pre style={{ fontSize: '.75rem', overflowX: 'auto', margin: '.5rem 0 0' }}>
                  {JSON.stringify(row.scoreBreakdownAtDecision, null, 2)}
                </pre>
              </details>
            )}
          </div>
        ))
      )}
    </div>
  );
}

'use client';
import { CompanyLogo, ExtensionOffer } from '@/components/JobCardUI';
import { useApplicationActions } from '../useApplicationActions';
import type { AppRow } from '../data';

export default function PendientesClient({ apps }: { apps: AppRow[] }) {
  const {
    pendingApps, actioningId, markApplied, cancelAssisted, openApp, needsInfoFor,
  } = useApplicationActions(apps);

  return (
    <div className="animate-fadein">
      <div className="page-eyebrow">Pendientes</div>
      <h1 style={{ fontSize: 'clamp(1.6rem,4vw,2rem)', fontWeight: 800, color: 'var(--text)', margin: '0 0 .35rem 0', letterSpacing: '-0.02em' }}>
        Requieren tu atención
      </h1>
      <p style={{ color: 'var(--text-2)', fontSize: '.9rem', margin: '0 0 2rem 0', maxWidth: 560 }}>
        Aplicaciones en curso que necesitan un captcha, una confirmación tuya, o un dato que Applica no conoce todavía.
      </p>

      {pendingApps.length === 0 ? (
        <div className="bento-card" style={{ padding: '3.5rem 2rem', textAlign: 'center' }}>
          <div className="ambient-radar" style={{ margin: '0 auto 1.25rem auto' }}>
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--success)', boxShadow: '0 0 10px var(--success)' }} />
          </div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)', marginBottom: '.5rem' }}>Nada pendiente</h3>
          <p style={{ fontSize: '.875rem', color: 'var(--text-2)', maxWidth: 420, margin: '0 auto' }}>
            Cuando una aplicación necesite tu captcha, confirmación, o un dato que falte, aparecerá aquí.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem' }}>
          {pendingApps.map((app) => {
            const isApproved = app.status === 'approved';
            const needsInfo = needsInfoFor(app);
            return (
              <div key={app.id} className="bento-card" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '.85rem', marginBottom: '1rem' }}>
                  <CompanyLogo companyName={app.vacancy?.company ?? 'N/A'} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text)', lineHeight: 1.3 }}>{app.vacancy?.title ?? '-'}</div>
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
      )}
    </div>
  );
}

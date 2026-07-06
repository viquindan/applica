'use client';
import { useState } from 'react';
import { useI18n } from '@/i18n/context';

export default function Step3Preferences({ data, onNext, onBack, saving }: { data: any; onNext: (d: any) => void; onBack: () => void; saving: boolean }) {
  const { t } = useI18n();
  // We only track the single user-facing decision
  const [requireReview, setRequireReview] = useState(data.requireReview ?? true);

  // The rest are sensible defaults as requested
  const defaults = {
    minScoreToConsider: 70,
    minScoreToGenerate: 70,
    minScoreToApply: 70,
    tailoringLevel: 'medium',
    maxPerDay: 5,
    maxPerWeek: 15,
    pauseOnSalary: false,
    pauseOnImmigration: false,
    pauseOnCustom: false,
    pauseOnCaptcha: true, // Bot physically cannot proceed
    pauseOnLogin: true, // Bot physically cannot proceed
    pauseOnMissing: false,
  };

  const handleComplete = () => {
    onNext({
      ...defaults,
      requireReview,
      allowAutoApply: !requireReview,
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h2 style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.5rem", letterSpacing: "-0.02em" }}>Modo de Operación</h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-2)' }}>Decide cuánto control quieres cederle a la Inteligencia Artificial.</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

        {/* Option 1: Require Review */}
        <label style={{
          display: 'flex', gap: '1rem', padding: '1.5rem',
          background: requireReview ? 'var(--color-primary-glow)' : 'var(--bg-2)',
          border: `2px solid ${requireReview ? 'var(--petrol)' : 'var(--border)'}`,
          borderRadius: 'var(--radius-lg)', cursor: 'pointer', transition: 'all var(--transition)'
        }}>
          <input type="radio" name="mode" checked={requireReview} onChange={() => setRequireReview(true)} style={{ marginTop: 4, transform: 'scale(1.2)' }} />
          <div>
            <div style={{ fontSize: '1.125rem', fontWeight: 600, color: requireReview ? 'var(--petrol)' : 'var(--text)', marginBottom: '0.25rem' }}>
              Revisión Manual (Recomendado)
            </div>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-2)', lineHeight: 1.5 }}>
              La IA buscará ofertas, evaluará el fit y redactará las cartas de presentación, pero las pondrá en estado <b>"Pendiente"</b>. Tú decides cuáles aprobar con un clic.
            </div>
          </div>
        </label>

        {/* Option 2: Full Auto */}
        <label style={{
          display: 'flex', gap: '1rem', padding: '1.5rem',
          background: !requireReview ? 'var(--color-primary-glow)' : 'var(--bg-2)',
          border: `2px solid ${!requireReview ? 'var(--petrol)' : 'var(--border)'}`,
          borderRadius: 'var(--radius-lg)', cursor: 'pointer', transition: 'all var(--transition)'
        }}>
          <input type="radio" name="mode" checked={!requireReview} onChange={() => setRequireReview(false)} style={{ marginTop: 4, transform: 'scale(1.2)' }} />
          <div>
            <div style={{ fontSize: '1.125rem', fontWeight: 600, color: !requireReview ? 'var(--petrol)' : 'var(--text)', marginBottom: '0.25rem' }}>
              Autopiloto Completo
            </div>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-2)', lineHeight: 1.5 }}>
              La IA hará todo el proceso de punta a punta. Aplicará automáticamente a las ofertas que superen el umbral del 70% de compatibilidad. Límite seguro: 15 aplicaciones por semana.
            </div>
          </div>
        </label>

      </div>

      <div style={{ padding: '1rem', background: 'var(--bg-3)', borderRadius: 'var(--radius-md)', border: '1px dashed var(--border-light)' }}>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-3)', textAlign: 'center' }}>
          Configuraciones avanzadas (Límites, Umbrales, Nivel de Personalización) estarán disponibles en <b>Ajustes</b> una vez finalices.
        </p>
      </div>

      <div className="flex justify-between" style={{ marginTop: '1rem' }}>
        <button type="button" className="btn btn-secondary" onClick={onBack}> Atrás</button>
        <button type="button" className="btn btn-primary btn-lg" onClick={handleComplete} disabled={saving}>
          {saving ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Guardando...</> : 'Finalizar y Activar '}
        </button>
      </div>
    </div>
  );
}

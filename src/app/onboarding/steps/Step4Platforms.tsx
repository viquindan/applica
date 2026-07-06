'use client';
import { useState } from 'react';
import { useI18n } from '@/i18n/context';

const ALL_PLATFORMS = [
  { id: 'greenhouse', name: 'Greenhouse', icon: '', canAutoApply: true, category: 'ATS' },
  { id: 'lever', name: 'Lever', icon: '', canAutoApply: true, category: 'ATS' },
  { id: 'ashby', name: 'Ashby', icon: '', canAutoApply: true, category: 'ATS' },
  { id: 'workable', name: 'Workable', icon: '', canAutoApply: false, category: 'ATS' },
  { id: 'smartrecruiters', name: 'SmartRecruiters', icon: '', canAutoApply: false, category: 'ATS' },
  { id: 'indeed', name: 'Indeed', icon: '', canAutoApply: false, category: 'Job Board' },
  { id: 'wellfound', name: 'Wellfound', icon: '', canAutoApply: false, category: 'Job Board' },
  { id: 'remoteok', name: 'RemoteOK', icon: '', canAutoApply: false, category: 'Job Board' },
  { id: 'idealist', name: 'Idealist', icon: '', canAutoApply: false, category: 'Social Impact' },
  { id: 'devex', name: 'Devex', icon: '', canAutoApply: false, category: 'Social Impact' },
  { id: 'reliefweb', name: 'ReliefWeb', icon: '', canAutoApply: false, category: 'Social Impact' },
  { id: 'unjobs', name: 'UN Jobs', icon: '', canAutoApply: false, category: 'Social Impact' },
  { id: 'linkedin_manual', name: 'LinkedIn (Manual)', icon: '', canAutoApply: false, category: 'Manual' },
  { id: 'manual_url', name: 'Manual URL', icon: '', canAutoApply: false, category: 'Manual' },
];

type PlatformConfig = {
  searchEnabled: boolean;
  autoApplyEnabled: boolean;
  semiAutoEnabled: boolean;
  requiresManualReview: boolean;
  minScore: number;
  maxPerDay: number;
  maxPerWeek: number;
};

const DEFAULT_CONFIG: PlatformConfig = {
  searchEnabled: true, autoApplyEnabled: false, semiAutoEnabled: true,
  requiresManualReview: true, minScore: 70, maxPerDay: 5, maxPerWeek: 20,
};

export default function Step4Platforms({ data, onFinish, onBack, saving }: { data: any; onFinish: (d: any) => void; onBack: () => void; saving: boolean }) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<Set<string>>(new Set(data.selected || []));
  const [configs, setConfigs] = useState<Record<string, PlatformConfig>>(data.configs || {});
  const [expanded, setExpanded] = useState<string | null>(null);

  function togglePlatform(id: string) {
    const next = new Set(selected);
    if (next.has(id)) { next.delete(id); } else {
      next.add(id);
      if (!configs[id]) setConfigs(c => ({ ...c, [id]: { ...DEFAULT_CONFIG } }));
    }
    setSelected(next);
  }

  function updateConfig(id: string, k: keyof PlatformConfig, v: any) {
    setConfigs(c => ({ ...c, [id]: { ...c[id], [k]: v } }));
  }

  const categories = [...new Set(ALL_PLATFORMS.map(p => p.category))];

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
      <div>
        <h2 className="card-title">{t.onboarding.platformSetup}</h2>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-2)' }}>
          Selecciona las plataformas donde quieres buscar y aplicar. Puedes cambiar esto en cualquier momento.
        </p>
      </div>

      {categories.map(cat => (
        <div key={cat}>
          <h3 style={{ fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-3)', marginBottom: 'var(--space-3)' }}>{cat}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            {ALL_PLATFORMS.filter(p => p.category === cat).map(platform => {
              const isSelected = selected.has(platform.id);
              const cfg = configs[platform.id] || DEFAULT_CONFIG;
              const isExpanded = expanded === platform.id;

              return (
                <div key={platform.id} style={{ border: `1px solid ${isSelected ? 'rgba(99,102,241,0.4)' : 'var(--color-border)'}`, borderRadius: 'var(--radius-md)', overflow: 'hidden', background: isSelected ? 'var(--color-surface)' : 'var(--color-bg-2)', transition: 'all var(--transition)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', padding: 'var(--space-4)', gap: 'var(--space-4)', cursor: 'pointer' }} onClick={() => togglePlatform(platform.id)}>
                    <span style={{ fontSize: 20 }}>{platform.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: isSelected ? 'var(--color-text)' : 'var(--color-text-2)' }}>{platform.name}</div>
                      {!platform.canAutoApply && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-3)' }}>Semi-automático únicamente</div>}
                    </div>
                    <div className={`toggle ${isSelected ? 'on' : ''}`} style={{ flexShrink: 0 }} />
                    {isSelected && (
                      <button type="button" className="btn btn-ghost btn-sm" style={{ marginLeft: 'var(--space-2)' }} onClick={e => { e.stopPropagation(); setExpanded(isExpanded ? null : platform.id); }}>
                        {isExpanded ? ' Menos' : ' Config'}
                      </button>
                    )}
                  </div>

                  {isSelected && isExpanded && (
                    <div style={{ padding: 'var(--space-5)', borderTop: '1px solid var(--color-border)', background: 'var(--color-bg-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                        {[
                          ['semiAutoEnabled', t.onboarding.platformsSemiAuto],
                          ...(platform.canAutoApply ? [['autoApplyEnabled', t.onboarding.platformsAutoApply] as const] : []),
                          ['requiresManualReview', t.onboarding.platformsManualReview],
                        ].map(([k, label]) => (
                          <label key={k} className="toggle-wrapper">
                            <div className={`toggle ${cfg[k as keyof PlatformConfig] ? 'on' : ''}`} onClick={() => updateConfig(platform.id, k as keyof PlatformConfig, !cfg[k as keyof PlatformConfig])} />
                            <span className="toggle-label">{label}</span>
                          </label>
                        ))}
                      </div>
                      <div className="grid-3" style={{ gap: 'var(--space-4)' }}>
                        {[['minScore', 'Min. score', 0, 100], ['maxPerDay', 'Máx/día', 1, 50], ['maxPerWeek', 'Máx/semana', 1, 200]].map(([k, label, min, max]) => (
                          <div className="field-group" key={k}>
                            <label className="field-label">{label as string}</label>
                            <input type="number" className="input" min={min as number} max={max as number} value={cfg[k as keyof PlatformConfig] as number} onChange={e => updateConfig(platform.id, k as keyof PlatformConfig, +e.target.value)} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div style={{ background: 'var(--color-primary-glow)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', fontSize: 'var(--text-sm)', color: 'var(--color-text-2)' }}>
        <strong style={{ color: 'var(--color-primary-hover)' }}> {selected.size} plataformas seleccionadas.</strong> Puedes modificar estos ajustes en cualquier momento desde Configuración Control de plataformas.
      </div>

      <div className="flex justify-between">
        <button type="button" className="btn btn-secondary" onClick={onBack}> {t.onboarding.back}</button>
        <button type="button" className="btn btn-primary btn-lg" onClick={() => onFinish({ selected: [...selected], configs })} disabled={saving}>
          {saving ? t.onboarding.saving : ' ' + t.onboarding.finish}
        </button>
      </div>
    </div>
  );
}

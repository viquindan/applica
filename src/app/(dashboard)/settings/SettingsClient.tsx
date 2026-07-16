'use client';
import { useState } from'react';
import { useI18n } from'@/i18n/context';
import type { UserSettings, PlatformSetting } from'@/db/schema';

const TABS = ['automation', 'platforms'] as const;
type Tab = typeof TABS[number];

const PLATFORM_ICONS: Record<string, string> = {
  greenhouse: '', lever: '', ashby: '', workable: '',
  smartrecruiters: '', indeed: '', wellfound: '', remoteok: '',
  idealist: '', devex: '', reliefweb: '', unjobs: '',
  linkedin_manual: '', manual_url: '',
};

const STATUS_COLORS: Record<string, string> = {
  active: 'success', paused: 'warning', error: 'danger', disabled: 'ghost',
};

export default function SettingsClient({ settings, platforms }: { settings: UserSettings; platforms: PlatformSetting[] }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('automation');
  const [s, setS] = useState(settings);
  const [ps, setPs] = useState(platforms);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const set = (k: keyof UserSettings, v: any) => setS(prev => ({ ...prev, [k]: v }));

  async function saveSettings() {
    setSaving(true);
    await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s) });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function savePlatform(p: PlatformSetting) {
    await fetch(`/api/platforms/${p.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
  }

  const updatePlatform = (id: string, k: keyof PlatformSetting, v: any) => {
    setPs(prev => prev.map(p => p.id === id ? { ...p, [k]: v } : p));
  };

  const Toggle = ({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) => (
    <div className={`toggle ${value ? 'on' : ''}`} onClick={() => onChange(!value)} style={{ cursor: 'pointer' }} />
  );

  return (
    <div className="animate-fadein">
      <div className="page-header">
        <h1 className="page-title">{t.settings.title}</h1>
      </div>

      <div className="tab-bar">
        {TABS.map(tabId => (
          <button key={tabId} className={`tab-btn ${tab === tabId ? 'active' : ''}`} onClick={() => setTab(tabId)}>
            {tabId === 'automation' ? t.settings.tabs.automation :
             t.settings.tabs.platforms}
          </button>
        ))}
      </div>

      {/* Automation Tab */}
      {tab === 'automation' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          <div className="card">
            <h3 className="card-title">{t.settings.automation.globalMode}</h3>
            <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
              {(['off', 'semi'] as const).map(mode => {
                const effectiveMode = s.globalAutomationMode === 'full' ? 'semi' : s.globalAutomationMode;
                return (
                  <button key={mode} className={`btn btn-lg ${effectiveMode === mode ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => set('globalAutomationMode', mode)}>
                    {mode === 'off' ? ' ' + t.settings.automation.off : ' ' + t.settings.automation.semi}
                  </button>
                );
              })}
            </div>
            <div style={{ marginTop: 'var(--space-4)', padding: 'var(--space-4)', background: 'var(--color-bg-2)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-xs)', color: 'var(--color-text-3)' }}>
              {s.globalAutomationMode === 'off'
                ? 'El sistema no busca ni prepara aplicaciones automáticamente.'
                : 'El sistema busca vacantes y prepara materiales solo. Nunca envía nada sin que primero le des swipe a la vacante en el Feed - eso es lo que autoriza el envío.'}
            </div>
          </div>

          <div className="card">
            <h3 className="card-title">Umbrales</h3>
            <div className="grid-2" style={{ gap: 'var(--space-6)' }}>
              {[
                ['minScoreToGenerateMaterials', t.settings.automation.minScoreGenerate],
                ['minScoreToApply', t.settings.automation.minScoreApply],
                ['maxApplicationsPerDay', t.settings.automation.maxPerDay],
                ['maxApplicationsPerWeek', t.settings.automation.maxPerWeek],
              ].map(([k, label]) => (
                <div className="field-group" key={k}>
                  <label className="field-label">{label}</label>
                  <input type="number" className="input" value={(s as any)[k] || ''} onChange={e => set(k as any, +e.target.value)} />
                </div>
              ))}
            </div>
            <div className="field-group" style={{ marginTop: 'var(--space-5)' }}>
              <label className="field-label">{t.settings.automation.tailoringLevel}</label>
              <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                {(['light', 'medium', 'deep'] as const).map(level => (
                  <button key={level} className={`btn ${s.defaultTailoringLevel === level ? 'btn-primary' : 'btn-secondary'}`} onClick={() => set('defaultTailoringLevel', level)}>
                    {level}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="card">
            <h3 className="card-title">{t.settings.automation.pauseConditions}</h3>
            {[
              ['requireReviewBeforeSubmit', t.settings.automation.requireReview],
              ['pauseOnSalaryQuestions', t.settings.automation.pauseSalary],
              ['pauseOnImmigrationQuestions', t.settings.automation.pauseImmigration],
              ['pauseOnCustomQuestions', t.settings.automation.pauseCustom],
              ['pauseOnCaptcha', t.settings.automation.pauseCaptcha],
              ['pauseOnLogin', t.settings.automation.pauseLogin],
              ['pauseOnMissingInformation', t.settings.automation.pauseMissing],
            ].map(([k, label]) => (
              <div key={k} className="flex items-center justify-between" style={{ padding: 'var(--space-3) 0', borderBottom: '1px solid var(--color-border)' }}>
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text)' }}>{label}</span>
                <Toggle value={(s as any)[k]} onChange={v => set(k as any, v)} />
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-primary btn-lg" onClick={saveSettings} disabled={saving}>
              {saved ? ' ' + t.common.saved : saving ? t.common.saving : t.common.save}
            </button>
          </div>
        </div>
      )}

      {/* Platforms Tab */}
      {tab === 'platforms' && (
        <div className="card">
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Plataforma</th>
                  <th>Búsqueda</th>
                  <th>Auto-apply</th>
                  <th>Semi-auto</th>
                  <th>Rev. manual</th>
                  <th>Min. score</th>
                  <th>Max/día</th>
                  <th>Max/sem</th>
                  <th>Notas / tokens</th>
                  <th>Estado</th>
                  <th>Último run</th>
                  <th>Guardar</th>
                </tr>
              </thead>
              <tbody>
                {ps.map(p => (
                  <tr key={p.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <span>{PLATFORM_ICONS[p.platformName] || ''}</span>
                        <span style={{ fontWeight: 600, color: 'var(--color-text)' }}>{p.platformName}</span>
                      </div>
                    </td>
                    <td><div className={`toggle ${p.searchEnabled ? 'on' : ''}`} onClick={() => updatePlatform(p.id, 'searchEnabled', !p.searchEnabled)} /></td>
                    <td><div className={`toggle ${p.autoApplyEnabled ? 'on' : ''}`} onClick={() => updatePlatform(p.id, 'autoApplyEnabled', !p.autoApplyEnabled)} /></td>
                    <td><div className={`toggle ${p.semiAutoApplyEnabled ? 'on' : ''}`} onClick={() => updatePlatform(p.id, 'semiAutoApplyEnabled', !p.semiAutoApplyEnabled)} /></td>
                    <td><div className={`toggle ${p.requiresManualReview ? 'on' : ''}`} onClick={() => updatePlatform(p.id, 'requiresManualReview', !p.requiresManualReview)} /></td>
                    <td><input type="number" className="input" style={{ width: 70 }} value={p.minimumScoreToApply || 70} onChange={e => updatePlatform(p.id, 'minimumScoreToApply', +e.target.value)} /></td>
                    <td><input type="number" className="input" style={{ width: 60 }} value={p.maxApplicationsPerDay || 5} onChange={e => updatePlatform(p.id, 'maxApplicationsPerDay', +e.target.value)} /></td>
                    <td><input type="number" className="input" style={{ width: 65 }} value={p.maxApplicationsPerWeek || 20} onChange={e => updatePlatform(p.id, 'maxApplicationsPerWeek', +e.target.value)} /></td>
                    <td>
                      <input
                        className="input"
                        style={{ minWidth: 180 }}
                        placeholder={p.platformName === 'greenhouse' ? 'board-token-1, board-token-2' : 'Notas'}
                        value={p.notes || ''}
                        onChange={e => updatePlatform(p.id, 'notes', e.target.value)}
                      />
                    </td>
                    <td><span className={`badge badge-${STATUS_COLORS[p.status || 'active']}`}>{p.status || 'active'}</span></td>
                    <td style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-3)' }}>
                      {p.lastRunAt ? new Date(p.lastRunAt).toLocaleString() : t.common.never}
                    </td>
                    <td><button className="btn btn-secondary btn-sm" onClick={() => savePlatform(p)}></button></td>
                  </tr>
                ))}
                {ps.length === 0 && (
                  <tr><td colSpan={12} style={{ textAlign: 'center', color: 'var(--color-text-3)', padding: 'var(--space-8)' }}>No hay plataformas configuradas. Completa el onboarding.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}

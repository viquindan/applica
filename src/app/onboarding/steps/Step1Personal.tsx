'use client';
import { useState } from 'react';
import { useI18n } from '@/i18n/context';
import CountryTagInput from '@/components/ui/CountryTagInput';

// value = canonical English name (matches the CV extraction); label = display text.
const LANGUAGES = [
  { value: 'Spanish', label: 'Español' },
  { value: 'English', label: 'English' },
  { value: 'French', label: 'Français' },
  { value: 'German', label: 'Deutsch' },
  { value: 'Portuguese', label: 'Português' },
  { value: 'Italian', label: 'Italiano' },
  { value: 'Mandarin', label: 'Mandarin (中文)' },
  { value: 'Arabic', label: 'Arabic (العربية)' },
  { value: 'Japanese', label: 'Japanese (日本語)' },
];
const PROFICIENCY_LEVELS = ['Native', 'C2', 'C1', 'B2', 'B1', 'A2', 'A1'];
const NOTICE_OPTIONS = ['Inmediato', '2 semanas', '1 mes', '2 meses', '3 meses', 'Por definir'];
const REGIONS = ['Norteamérica', 'LATAM', 'Europa', 'Asia', 'África', 'Oceanía', 'Remoto Global'];

export default function Step1Personal({ data, onNext, onBack, saving, isLastStep }: { data: any; onNext: (d: any) => void; onBack: () => void; saving: boolean; isLastStep?: boolean }) {
  const { t } = useI18n();
  const [form, setForm] = useState({
    name: data.name || '', email: data.email || '', phone: data.phone || '',
    linkedin: data.linkedin || '', portfolio: data.portfolio || '',
    location: data.location || '', country: data.country || '',
    languages: data.languages || [],
    workAuthorization: data.workAuthorization || [],
    targetCountries: data.targetCountries || [], // Used for remote regions now
    targetCities: data.targetCities || [], // Used for onsite/hybrid locations
    salaryMin: data.salaryMin || '', salaryMax: data.salaryMax || '',
    salaryCurrency: data.salaryCurrency || 'USD',
    noticePeriod: data.noticePeriod || '',
  });

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  function addLanguage() {
    set('languages', [...form.languages, { language: '', proficiency: 'B2' }]);
  }
  function updateLang(i: number, k: string, v: string) {
    const langs = [...form.languages];
    langs[i] = { ...langs[i], [k]: v };
    set('languages', langs);
  }
  function removeLang(i: number) {
    set('languages', form.languages.filter((_: any, idx: number) => idx !== i));
  }

  function addWorkAuth() {
    set('workAuthorization', [...form.workAuthorization, { country: '', status: 'Citizen' }]);
  }
  function updateAuth(i: number, k: string, v: string) {
    const auths = [...form.workAuthorization];
    auths[i] = { ...auths[i], [k]: v };
    set('workAuthorization', auths);
  }
  function removeAuth(i: number) {
    set('workAuthorization', form.workAuthorization.filter((_: any, idx: number) => idx !== i));
  }

  function toggleArray(key: string, val: string) {
    const current = (form as any)[key] as string[];

    if (key === 'targetCountries') {
      if (val === 'Remoto Global') {
        if (current.includes('Remoto Global')) set(key, []);
        else set(key, REGIONS);
        return;
      } else {
        if (current.includes(val)) {
          set(key, current.filter(x => x !== val && x !== 'Remoto Global'));
        } else {
          const newArr = [...current, val];
          // If all except 'Remoto Global' are selected, also add 'Remoto Global'
          const allOthers = REGIONS.filter(r => r !== 'Remoto Global');
          if (allOthers.every(r => newArr.includes(r))) set(key, REGIONS);
          else set(key, newArr);
        }
        return;
      }
    }

    if (current.includes(val)) set(key, current.filter(x => x !== val));
    else set(key, [...current, val]);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h2 style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.5rem", letterSpacing: "-0.02em" }}>{t.onboarding.personalInfo}</h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-2)' }}>{t.onboarding.subtitle}</p>
      </div>

      {/* Basic */}
      <div className="grid-2" style={{ gap: '1.25rem' }}>
        {[['name', t.onboarding.fullName, 'text', 'Juan García'],
          ['email', t.onboarding.emailAddress, 'email', 'tu@email.com'],
          ['phone', t.onboarding.phone, 'tel', '+1 555 000 0000'],
          ['linkedin', t.onboarding.linkedinUrl, 'url', 'https://linkedin.com/in/...'],
          ['portfolio', t.onboarding.portfolioUrl + ' (Opcional)', 'url', 'https://miportfolio.com'],
          ['country', t.onboarding.countryResidence, 'text', 'México'],
        ].map(([key, label, type, placeholder]) => (
          <div className="field-group" key={key as string}>
            <label className="field-label">{label}</label>
            <input type={type as string} className="input" placeholder={placeholder as string}
              value={(form as any)[key as string]} onChange={e => set(key as string, e.target.value)} />
          </div>
        ))}
      </div>

      {/* Location Preferences Matrix (Option B) */}
      <div style={{ background: 'var(--bg-2)', padding: '1.5rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
        <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--text)', marginBottom: '1.5rem' }}>Preferencias de Ubicación</h3>

        <div className="grid-2" style={{ gap: '1.5rem' }}>
          {/* Remote */}
          <div className="field-group">
            <label className="field-label" style={{ color: 'var(--petrol)' }}>Acepto trabajos REMOTOS en:</label>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginBottom: '0.75rem' }}>Selecciona las regiones remotas a las que apuntas. Si no seleccionas ninguna, asumimos que no buscas remoto.</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {REGIONS.map(r => (
                <button key={r} type="button" className={`btn btn-sm ${form.targetCountries.includes(r) ? 'btn-primary' : 'btn-secondary'}`} onClick={() => toggleArray('targetCountries', r)}>
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Onsite / Hybrid */}
          <div className="field-group">
            <label className="field-label" style={{ color: 'var(--text-gold)' }}>Acepto PRESENCIAL o HÍBRIDO en:</label>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginBottom: '0.75rem' }}>Selecciona los países donde puedes asistir físicamente o reubicarte. Si lo dejas vacío, asumimos que no buscas presencial.</p>
            <CountryTagInput value={form.targetCities} onChange={v => set('targetCities', v)} placeholder="Escribe un país..." />
          </div>
        </div>
      </div>

      {/* Languages */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <label className="field-label" style={{ marginBottom: 0 }}>{t.onboarding.languages}</label>
          <button type="button" className="btn btn-secondary btn-sm" onClick={addLanguage}>+ {t.onboarding.addLanguage}</button>
        </div>
        {form.languages.map((lang: any, i: number) => (
          <div key={i} className="flex gap-2 mb-4" style={{ alignItems: 'center' }}>
            <select className="select" value={lang.language} onChange={e => updateLang(i, 'language', e.target.value)} style={{ flex: 2 }}>
              <option value="">Seleccionar idioma</option>
              {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
              {lang.language && !LANGUAGES.some(l => l.value === lang.language) && (
                <option value={lang.language}>{lang.language}</option>
              )}
            </select>
            <select className="select" value={lang.proficiency} onChange={e => updateLang(i, 'proficiency', e.target.value)} style={{ flex: 1 }}>
              {PROFICIENCY_LEVELS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeLang(i)}></button>
          </div>
        ))}
      </div>

      {/* Work Authorization */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <label className="field-label" style={{ marginBottom: 0 }}>{t.onboarding.workAuthorization}</label>
          <button type="button" className="btn btn-secondary btn-sm" onClick={addWorkAuth}>+ {t.onboarding.addCountry}</button>
        </div>
        {form.workAuthorization.map((auth: any, i: number) => (
          <div key={i} className="flex gap-2 mb-4" style={{ alignItems: 'center' }}>
            <input className="input" placeholder="País" value={auth.country} onChange={e => updateAuth(i, 'country', e.target.value)} style={{ flex: 2 }} />
            <select className="select" value={auth.status} onChange={e => updateAuth(i, 'status', e.target.value)} style={{ flex: 1 }}>
              {['Citizen', 'Permanent Resident', 'Work Visa', 'Student Visa', 'Requires Sponsorship', 'Not Authorized'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeAuth(i)}></button>
          </div>
        ))}
      </div>

      <div className="field-group">
        <label className="field-label">{t.onboarding.noticePeriod}</label>
        <select className="select" value={form.noticePeriod} onChange={e => set('noticePeriod', e.target.value)}>
          <option value="">Seleccionar</option>
          {NOTICE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>

      {/* Salary */}
      <div>
        <label className="field-label">Salario Mínimo Mensual Esperado</label>
        <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
          <input type="number" className="input" placeholder="Mínimo Mensual (Ej. 4000)" value={form.salaryMin} onChange={e => set('salaryMin', e.target.value)} style={{ flex: 1, minWidth: 120 }} />
          <select className="select" value={form.salaryCurrency} onChange={e => set('salaryCurrency', e.target.value)} style={{ width: 90 }}>
            {['USD', 'EUR', 'MXN', 'GBP', 'CAD', 'ARS', 'COP', 'CLP', 'BRL'].map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <div className="flex justify-between" style={{ marginTop: '2rem' }}>
        <button type="button" className="btn btn-secondary" onClick={onBack}> {t.onboarding.back}</button>
        <button type="button" className="btn btn-primary btn-lg" onClick={() => onNext(form)} disabled={saving}>
          {saving
            ? <><span className="spinner" style={{ width: 16, height: 16 }} /> {t.onboarding.saving}</>
            : isLastStep ? 'Finalizar y Activar ' : t.onboarding.next + ' '}
        </button>
      </div>
    </div>
  );
}

'use client';
import { useState, useRef } from 'react';
import { useI18n } from '@/i18n/context';

const TONES = ['professional', 'conversational', 'technical', 'executive'];
const TONE_LABELS: Record<string, string> = { professional: 'Profesional', conversational: 'Conversacional', technical: 'Técnico', executive: 'Ejecutivo' };
const SENIORITY = ['Intern', 'Junior', 'Mid-level', 'Senior', 'Lead', 'Manager', 'Director', 'VP', 'C-Level'];
const REGIONS = ['Norteamérica', 'LATAM', 'Europa', 'Asia', 'África', 'Oceanía', 'Remoto Global'];
const INDUSTRIES = ['Tecnología (SaaS/Software)', 'Finanzas / Fintech', 'Salud / MedTech', 'E-commerce', 'Educación', 'Manufactura', 'Consultoría', 'Retail'];

function TagInput({ value, onChange, placeholder, id }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string, id?: string }) {
  const [input, setInput] = useState('');
  function add() {
    const trimmed = input.trim();
    if (trimmed && !value.includes(trimmed)) onChange([...value, trimmed]);
    setInput('');
  }
  const inputId = id || 'ti-' + placeholder;
  return (
    <div className="tag-input-wrapper" onClick={() => document.getElementById(inputId)?.focus()}>
      {value.map(v => (
        <span key={v} className="tag">{v} <button type="button" onClick={() => onChange(value.filter(x => x !== v))}></button></span>
      ))}
      <input id={inputId} className="tag-input" value={input} placeholder={placeholder}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } }}
        onBlur={add} />
    </div>
  );
}

export default function Step2Profile({ data, onNext, onBack, saving }: { data: any; onNext: (d: any, extractedData?: any) => void; onBack: () => void; saving: boolean }) {
  const { t } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    cvFileName: data.cvFileName || '',
    cvFilePath: data.cvFilePath || '',
    cvText: data.cvText || '',
    experience: data.experience || [],
    education: data.education || [],
    certifications: data.certifications || [],
    skills: data.skills || [],
    targetIndustries: data.targetIndustries || [],
    targetRoles: data.targetRoles || [],
    targetSeniority: data.targetSeniority || [],
    targetCountries: data.targetCountries || [],
    targetCompanies: data.targetCompanies || [],
    excludedCompanies: data.excludedCompanies || [],
    excludedIndustries: data.excludedIndustries || [],
    excludedRoles: data.excludedRoles || [],
    cvTone: data.cvTone || 'professional',
    coverLetterTone: data.coverLetterTone || 'professional',
  });

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const [extractedData, setExtractedData] = useState<any>(null);
  const [isUploading, setIsUploading] = useState(false);

  async function handleCVUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/resumes/parse', { method: 'POST', body: fd });
    const d = await res.json();
    if (d.text) {
      set('cvFileName', file.name);
      set('cvFilePath', d.filePath || '');
      // The parsed text was only ever used to populate experience/skills below -
      // never actually saved onto the form, so /api/onboarding/save's
      // `if (data.cvText?.trim())` check was always false and no resume row
      // was ever created. Every application prep since then had no CV to
      // attach or tailor, regardless of what the onboarding UI showed.
      set('cvText', d.text);

      if (d.extracted) {
        setExtractedData(d.extracted);
        if (d.extracted.profile) {
          if (d.extracted.profile.experience) set('experience', d.extracted.profile.experience);
          if (d.extracted.profile.education) set('education', d.extracted.profile.education);
          if (d.extracted.profile.skills) set('skills', d.extracted.profile.skills);
        }
      }
    }
    setIsUploading(false);
  }

  function addExp() {
    set('experience', [...form.experience, { company: '', role: '', startDate: '', endDate: '', current: false, description: '', achievements: [] }]);
  }
  function updateExp(i: number, k: string, v: any) {
    const exp = [...form.experience]; exp[i] = { ...exp[i], [k]: v }; set('experience', exp);
  }
  function removeExp(i: number) { set('experience', form.experience.filter((_: any, idx: number) => idx !== i)); }

  function toggleArray(key: string, val: string) {
    const current = (form as any)[key] as string[];
    if (current.includes(val)) set(key, current.filter(x => x !== val));
    else set(key, [...current, val]);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h2 style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text)", marginBottom: "0.5rem", letterSpacing: "-0.02em" }}>{t.onboarding.professionalProfile}</h2>
      </div>

      {/* CV Upload */}
      <div className="field-group">
        <label className="field-label">{t.onboarding.uploadCV}</label>
        <div style={{ border: '2px dashed var(--border)', borderRadius: 'var(--radius-lg)', padding: '2rem', textAlign: 'center', cursor: 'pointer', transition: 'border-color var(--transition)' }}
          onClick={() => fileRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); const file = e.dataTransfer.files[0]; if (file) { const input = fileRef.current!; const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files; handleCVUpload({ target: input } as any); } }}>
          {isUploading ? (
            <div style={{ padding: '1rem 0' }}>
              <style>{`
                @keyframes scanLine {
                  0% { transform: translateY(-100%); }
                  100% { transform: translateY(100%); }
                }
                .pulse-text {
                  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
                }
              `}</style>
              <div style={{ position: 'relative', width: 56, height: 72, border: '3px solid var(--border)', borderRadius: 'var(--radius-sm)', margin: '0 auto 1.5rem', overflow: 'hidden', background: 'var(--surface)' }}>
                {/* Document lines */}
                <div style={{ position: 'absolute', top: 12, left: '15%', right: '15%', height: 4, background: 'var(--border)', borderRadius: 2 }} />
                <div style={{ position: 'absolute', top: 24, left: '15%', right: '35%', height: 4, background: 'var(--border)', borderRadius: 2 }} />
                <div style={{ position: 'absolute', top: 36, left: '15%', right: '15%', height: 4, background: 'var(--border)', borderRadius: 2 }} />
                <div style={{ position: 'absolute', top: 48, left: '15%', right: '45%', height: 4, background: 'var(--border)', borderRadius: 2 }} />

                {/* Laser scanner */}
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0, height: '100%',
                  background: 'linear-gradient(to bottom, transparent, rgba(42, 74, 79, 0.2) 90%, var(--petrol) 100%)',
                  animation: 'scanLine 1.5s ease-in-out infinite alternate',
                  borderBottom: '2px solid var(--petrol)'
                }} />
              </div>
              <p className="pulse-text" style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--petrol)' }}>Analizando con IA...</p>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginTop: '0.25rem' }}>Extrayendo experiencia y habilidades...</p>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 32, marginBottom: '0.75rem' }}></div>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-2)', marginBottom: '0.5rem' }}>
                {form.cvFileName ? <><span style={{ color: 'var(--success)' }}></span> {form.cvFileName}</> : t.onboarding.uploadCVHint}
              </p>
              <button type="button" className="btn btn-secondary btn-sm">{t.onboarding.uploadCV}</button>
            </>
          )}
        </div>
        <input ref={fileRef} type="file" accept=".pdf,.docx,.txt" style={{ display: 'none' }} onChange={handleCVUpload} />
      </div>

      {/* Experience */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <label className="field-label" style={{ marginBottom: 0 }}>{t.onboarding.workExperience}</label>
          <button type="button" className="btn btn-secondary btn-sm" onClick={addExp}>+ {t.onboarding.addExperience}</button>
        </div>
        {form.experience.map((exp: any, i: number) => (
          <div key={i} style={{ marginBottom: '1rem', background: 'var(--bg-2)', padding: '1.25rem', borderRadius: 'var(--radius-lg)' }}>
            <div className="grid-2" style={{ gap: '1rem', marginBottom: '1rem' }}>
              <div className="field-group"><label className="field-label">Empresa</label><input className="input" value={exp.company} onChange={e => updateExp(i, 'company', e.target.value)} /></div>
              <div className="field-group"><label className="field-label">Rol</label><input className="input" value={exp.role} onChange={e => updateExp(i, 'role', e.target.value)} /></div>
              <div className="field-group"><label className="field-label">Fecha inicio</label><input type="month" className="input" value={exp.startDate} onChange={e => updateExp(i, 'startDate', e.target.value)} /></div>
              <div className="field-group">
                <label className="field-label">Fecha fin</label>
                <input type="month" className="input" value={exp.endDate} disabled={exp.current} onChange={e => updateExp(i, 'endDate', e.target.value)} />
                <label className="toggle-wrapper" style={{ marginTop: '0.5rem' }}>
                  <div className={`toggle ${exp.current ? 'on' : ''}`} onClick={() => updateExp(i, 'current', !exp.current)} style={{ width: 32, height: 18 }} />
                  <span className="toggle-label" style={{ fontSize: '0.75rem' }}>Trabajo actual</span>
                </label>
              </div>
            </div>
            <div className="field-group">
              <label className="field-label">Descripción & logros</label>
              <textarea className="textarea" value={exp.description} onChange={e => updateExp(i, 'description', e.target.value)} placeholder="Describe tu rol y logros cuantificados..." style={{ minHeight: 80 }} />
            </div>
            <button type="button" className="btn btn-ghost btn-sm text-danger" style={{ marginTop: '0.75rem' }} onClick={() => removeExp(i)}> Eliminar</button>
          </div>
        ))}
      </div>

      {/* Target Roles */}
      <div className="field-group">
        <label className="field-label">{t.onboarding.targetRoles}</label>
        {extractedData?.profile?.suggestedRoles && extractedData.profile.suggestedRoles.length > 0 && (
          <div style={{ marginBottom: '0.75rem' }}>
            <p style={{ fontSize: '0.75rem', color: 'var(--petrol)', marginBottom: '0.5rem', fontWeight: 600 }}> Roles Sugeridos (Haz clic para agregar)</p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {extractedData.profile.suggestedRoles.map((role: string) => (
                <button key={role} type="button" onClick={() => !form.targetRoles.includes(role) && set('targetRoles', [...form.targetRoles, role])} className="btn btn-sm btn-outline">
                  + {role}
                </button>
              ))}
            </div>
          </div>
        )}
        <TagInput value={form.targetRoles} onChange={v => set('targetRoles', v)} placeholder="Agregar rol y presionar Enter" />
      </div>

      {/* Target Regions & Industries */}
      <div className="grid-2" style={{ gap: '1.25rem' }}>
        <div className="field-group">
          <label className="field-label">Industrias Objetivo (Opcional)</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {INDUSTRIES.map(ind => (
              <button key={ind} type="button" className={`btn btn-sm ${form.targetIndustries.includes(ind) ? 'btn-primary' : 'btn-secondary'}`} onClick={() => toggleArray('targetIndustries', ind)}>
                {ind}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Target Seniority */}
      <div className="field-group">
        <label className="field-label">{t.onboarding.targetSeniority}</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {SENIORITY.map(s => (
            <button key={s} type="button"
              className={`btn btn-sm ${form.targetSeniority.includes(s) ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => toggleArray('targetSeniority', s)}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Tone */}
      <div className="grid-2" style={{ gap: '1.25rem' }}>
        {[['cvTone', t.onboarding.cvTone], ['coverLetterTone', t.onboarding.coverLetterTone]].map(([k, label]) => (
          <div className="field-group" key={k}>
            <label className="field-label">{label}</label>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {TONES.map(tone => (
                <button key={tone} type="button"
                  className={`btn btn-sm ${(form as any)[k] === tone ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => set(k, tone)}>
                  {TONE_LABELS[tone]}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Advanced Options (Exclusions) */}
      <details style={{ background: 'var(--bg-2)', borderRadius: 'var(--radius-lg)', padding: '1rem', border: '1px solid var(--border)' }}>
        <summary style={{ fontWeight: 600, color: 'var(--text-2)', cursor: 'pointer', fontSize: '0.875rem' }}> Opciones Avanzadas (Filtros de Exclusión)</summary>
        <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {[
            ['targetCompanies', t.onboarding.targetCompanies],
            ['excludedCompanies', t.onboarding.excludedCompanies],
            ['excludedIndustries', t.onboarding.excludedIndustries],
            ['excludedRoles', t.onboarding.excludedRoles],
          ].map(([k, label]) => (
            <div className="field-group" key={k}>
              <label className="field-label">{label}</label>
              <TagInput id={`ti-${k}`} value={(form as any)[k] || []} onChange={v => set(k, v)} placeholder="Agregar y presionar Enter" />
            </div>
          ))}
        </div>
      </details>

      <div className="flex justify-between" style={{ marginTop: '1rem' }}>
        <button type="button" className="btn btn-secondary" onClick={onBack} style={{ visibility: 'hidden' }}> {t.onboarding.back}</button>
        <button type="button" className="btn btn-primary btn-lg" onClick={() => onNext(form, extractedData)} disabled={saving}>
          {saving ? <><span className="spinner" style={{ width: 16, height: 16 }} /> {t.onboarding.saving}</> : t.onboarding.next + ' '}
        </button>
      </div>
    </div>
  );
}

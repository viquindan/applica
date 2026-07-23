'use client';
import { useMemo, useState, useRef, useEffect } from'react';
import { useRouter } from'next/navigation';
import type { ProfessionalProfile, Resume, User } from'@/db/schema';
import CountryTagInput from '@/components/ui/CountryTagInput';
import { COUNTRIES } from '@/lib/countries';

// The page never selects users.* (password hash) - this mirrors the exact
// column list of that safe select. See profile/page.tsx.
type SafeUser = Omit<User, 'password' | 'securityQuestion' | 'securityAnswerHash' | 'role' | 'lemonSqueezyCustomerId' | 'lemonSqueezySubscriptionId' | 'linkedinSession'>;

function blankExperience() {
  return { company: '', role: '', startDate: '', endDate: '', current: false, description: '', achievements: [] as string[] };
}
function blankEducation() {
  return { institution: '', degree: '', field: '', year: undefined as number | undefined };
}

function normalizeSkills(value: unknown): Array<{ skill: string; level?: string }> {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (typeof item === 'string') return { skill: item };
    if (item && typeof item === 'object') {
      const row = item as { skill?: unknown; name?: unknown; level?: unknown };
      return {
        skill: String(row.skill ?? row.name ?? '').trim(),
        ...(row.level ? { level: String(row.level) } : {}),
      };
    }
    return { skill: '' };
  }).filter((item) => item.skill.length > 0);
}

// Same 4 tabs, same order and grouping as the mobile Perfil screen (see
// mobile/src/app/(tabs)/profile.tsx) - Perfil=identidad, CV=documento fuente
// + lo que el parser extrajo, Busqueda=TODO lo que fitScorer consume,
// Preferencias=restricciones duras. Keep these in lockstep by hand.
type Tab = 'perfil' | 'cv' | 'busqueda' | 'preferencias';
const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'perfil', label: 'Perfil' },
  { key: 'cv', label: 'CV' },
  { key: 'busqueda', label: 'Búsqueda' },
  { key: 'preferencias', label: 'Preferencias' },
];

// Same values the onboarding step writes and roleTaxonomy's seniorityMatches
// expects - only labels are localized (mirrored in the mobile Perfil too).
const SENIORITY_OPTIONS: Array<[string, string]> = [
  ['Intern', 'Practicante'], ['Junior', 'Junior'], ['Mid-level', 'Semi senior'],
  ['Senior', 'Senior'], ['Lead', 'Lead'], ['Manager', 'Manager'],
  ['Director', 'Director'], ['VP', 'VP'], ['C-Level', 'C-Level'],
];

// One chip editor for every free-text array the scorer consumes (industries,
// priority/alert keywords) - same interaction as the existing targetRoles tags.
function TagInput({ tags, onChange, placeholder }: { tags: string[]; onChange: (tags: string[]) => void; placeholder: string }) {
  return (
    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
      {tags.map((tag, i) => (
        <span key={i} className="tag">
          {tag}
          <button type="button" aria-label={`Quitar ${tag}`} onClick={() => onChange(tags.filter((_, idx) => idx !== i))}></button>
        </span>
      ))}
      <input className="input" style={{ maxWidth: 220, fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
        placeholder={placeholder}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            const val = (e.target as HTMLInputElement).value.trim();
            if (val && !tags.includes(val)) {
              onChange([...tags, val]);
              (e.target as HTMLInputElement).value = '';
            }
          }
        }} />
    </div>
  );
}

export default function ProfileClient({ user, profile, resumes }: { user: SafeUser; profile: ProfessionalProfile; resumes: Resume[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('perfil');
  const [items, setItems] = useState(resumes);
  const [activeId, setActiveId] = useState(profile.baseResumeId);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [hasAvatar, setHasAvatar] = useState(!!user.avatarPath);
  const [avatarNonce, setAvatarNonce] = useState(0);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  async function handleAvatarUpload(file?: File) {
    if (!file) return;
    setUploadingAvatar(true);
    const fd = new FormData(); fd.append('file', file);
    const res = await fetch('/api/profile/avatar', { method: 'POST', body: fd });
    const data = await res.json().catch(() => ({}));
    if (res.ok) { setHasAvatar(true); setAvatarNonce(Date.now()); }
    else alert(data.error || 'No se pudo subir la foto');
    setUploadingAvatar(false);
    if (avatarInputRef.current) avatarInputRef.current.value = '';
  }
  const [form, setForm] = useState({
    name: user.name ?? '',
    email: user.email ?? '',
    phone: user.phone ?? '',
    linkedin: user.linkedin ?? '',
    portfolioLinks: user.portfolioLinks ?? [],
    location: user.location ?? '',
    country: user.country ?? '',
    languages: user.languages ?? [],
    workAuthorization: user.workAuthorization ?? [],
    workModalityPrefs: user.workModalityPrefs ?? {
      acceptsRemote: true, remoteScope: 'worldwide' as const, remoteRegions: [] as string[],
      acceptsHybrid: false, hybridLocations: [] as string[],
      acceptsOnsite: false, onsiteLocations: [] as string[],
    },
    relocationAvailable: user.relocationAvailable ?? false,
    noticePeriod: user.noticePeriod ?? '',
    salaryMin: user.salaryMin ?? '',
    salaryCurrency: user.salaryCurrency ?? 'USD',
    targetRoles: profile.targetRoles ?? [],
    targetSeniority: profile.targetSeniority ?? [],
    targetIndustries: profile.targetIndustries ?? [],
    priorityKeywords: profile.priorityKeywords ?? [],
    alertKeywords: profile.alertKeywords ?? [],
    targetCountries: profile.targetCountries ?? [],
    experience: profile.experience ?? [],
    education: profile.education ?? [],
    certifications: profile.certifications ?? [],
    skills: normalizeSkills(profile.skills),
    achievements: profile.achievements ?? '',
  });
  // Phone = dial code + number. Split any stored value; ignore junk (e.g. an email
  // saved by mistake). Keep the two parts in sync with form.phone.
  const initialPhone = (() => {
    const raw = String(user.phone ?? '');
    if (raw.includes('@') || !/\d/.test(raw)) return { dial: '+507', number: '' };
    const m = raw.match(/^\s*(\+\d{1,4})?[\s-]*(.*)$/);
    return { dial: m?.[1] || '+507', number: (m?.[2] || '').replace(/[^\d\s-]/g, '').trim() };
  })();
  const [dial, setDial] = useState(initialPhone.dial);
  const [phoneNum, setPhoneNum] = useState(initialPhone.number);
  const setPhone = (d: string, n: string) => { setDial(d); setPhoneNum(n); setForm((f) => ({ ...f, phone: n ? `${d} ${n}`.trim() : '' })); };
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeResume = useMemo(() => items.find((item) => item.id === activeId) ?? null, [items, activeId]);

  const suggestedRoles = useMemo(() => {
    const roles = form.experience.map((e: any) => e.role?.trim()).filter(Boolean);
    return Array.from(new Set(roles)).filter((r: any) => !form.targetRoles.includes(r)).slice(0, 5);
  }, [form.experience, form.targetRoles]);

  async function handleCVUpload(file?: File) {
    if (!file) return;
    setUploading(true);
    const fd = new FormData(); fd.append('file', file);
    const res = await fetch('/api/resumes/base', { method: 'POST', body: fd });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      const next = { ...data.resume, userId: user.id, textContent: null, version: (activeResume?.version ?? 0) + 1, isBase: true } as Resume;
      setItems((current) => {
        const updated = current.map(r => ({ ...r, isBase: false }));
        return [next, ...updated];
      });
      setActiveId(next.id);
      // Merge the extracted profile AND the CV-grounded suggested roles so the
      // auto-save doesn't overwrite the roles the server just registered.
      setForm((current) => ({
        ...current,
        ...data.extracted,
        ...(data.suggestedRoles?.length ? { targetRoles: data.suggestedRoles } : {}),
      }));
    } else alert(data.error || 'No se pudo subir el CV');
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleDeleteResume(id: string) {
    if (!confirm('¿Seguro que quieres eliminar este CV?')) return;
    await fetch(`/api/resumes/${id}`, { method: 'DELETE' });
    setItems(items.filter(r => r.id !== id));
    if (activeId === id) setActiveId(items.find(r => r.id !== id)?.id ?? null);
  }

  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  async function handleActivateResume(id: string) {
    setActivatingId(id);
    try {
      const res = await fetch(`/api/resumes/${id}`, { method: 'PUT' });
      const data = await res.json();
      if (data.success) {
        setActiveId(id);
        if (data.extracted) {
          setForm((current) => ({
            ...current,
            ...data.extracted,
            ...(data.suggestedRoles?.length ? { targetRoles: data.suggestedRoles } : {}),
          }));
        }
        const resume = items.find(r => r.id === id);
        if (resume) {
          setSuccessToast(` CV "${resume.label}" activado y perfil actualizado.`);
          setTimeout(() => setSuccessToast(null), 4000);
        }
      }
    } finally {
      setActivatingId(null);
    }
  }

  // Auto-save debounced
  useEffect(() => {
    const timer = setTimeout(async () => {
      setSaving(true);
      await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      setSaving(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }, 1500);
    return () => clearTimeout(timer);
  }, [form]);

  // Handle explicit save for any stragglers if needed, though auto-save covers it
  async function save(e?: React.FormEvent) {
    if (e) e.preventDefault();
  }

  const DIAL_CODES = [
    ['Panamá', '+507'], ['Colombia', '+57'], ['México', '+52'], ['EE. UU. / Canadá', '+1'],
    ['Argentina', '+54'], ['Chile', '+56'], ['Perú', '+51'], ['Ecuador', '+593'],
    ['Costa Rica', '+506'], ['Guatemala', '+502'], ['El Salvador', '+503'], ['Honduras', '+504'],
    ['Nicaragua', '+505'], ['Rep. Dominicana', '+1'], ['Venezuela', '+58'], ['Uruguay', '+598'],
    ['Paraguay', '+595'], ['Bolivia', '+591'], ['Brasil', '+55'], ['España', '+34'],
    ['Reino Unido', '+44'], ['Alemania', '+49'], ['Francia', '+33'], ['Italia', '+39'],
  ];

  return (
    <div className="animate-fadein" style={{ position: 'relative' }}>

      {/* ── Toast de Éxito ── */}
      {successToast && (
        <div style={{
          position: 'fixed', bottom: '2rem', left: '50%', transform: 'translateX(-50%)', zIndex: 9998,
          background: 'var(--petrol)', color: 'white', padding: '0.75rem 1.5rem', borderRadius: '32px',
          boxShadow: '0 8px 24px rgba(42, 74, 79, 0.2)', fontSize: '0.875rem', fontWeight: 500,
          animation: 'fadeinUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
        }}>
          {successToast}
        </div>
      )}
      <style>{`
        @keyframes fadeinUp {
          from { opacity: 0; transform: translate(-50%, 10px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
      `}</style>

      <div className="page-header">
        <div className="page-eyebrow">Perfil</div>
        <h1 className="page-title">Perfil</h1>
        <p className="page-subtitle">Ningún campo es obligatorio. Mientras más completo esté tu perfil, mejor podrá Applica encontrar vacantes relevantes y preparar aplicaciones fuertes por ti.</p>
      </div>

      {/* Identidad resumida - persiste al cambiar de pestaña */}
      <div className="card" style={{ flexDirection: 'row', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', padding: '1.1rem 1.5rem' }}>
        <div
          onClick={() => avatarInputRef.current?.click()}
          title="Cambiar foto de perfil"
          style={{
            position: 'relative', width: 52, height: 52, borderRadius: '50%', flexShrink: 0, cursor: 'pointer',
            background: hasAvatar ? undefined : 'linear-gradient(135deg, var(--petrol), var(--petrol-light))',
            border: '2px solid var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: '1.1rem', fontWeight: 800, fontFamily: 'var(--font-display)', overflow: 'hidden',
          }}>
          {hasAvatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/profile/avatar?v=${avatarNonce}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            (form.name || 'U').trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase()
          )}
          {uploadingAvatar && (
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="spinner" style={{ width: 16, height: 16, borderColor: '#fff' }} />
            </div>
          )}
        </div>
        <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} disabled={uploadingAvatar}
          onChange={(e) => handleAvatarUpload(e.target.files?.[0])} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{form.name || 'Tu nombre'}</div>
          <div style={{ fontSize: '.78rem', color: 'var(--text-3)', fontWeight: 600 }}>{form.targetRoles?.[0] ?? 'Rol objetivo pendiente'}</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '.5rem', flexShrink: 0 }}>
          {saving && <span style={{ fontSize: '.75rem', color: 'var(--text-3)' }}>Guardando...</span>}
          {saved && !saving && <span style={{ fontSize: '.75rem', color: 'var(--success)' }}>Guardado</span>}
        </div>
      </div>

      <div className="tab-bar">
        {TABS.map((t) => (
          <button key={t.key} className={`tab-btn ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      <form onSubmit={save}>
        {tab === 'cv' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: 640 }}>
            <div className="card-label">Portafolio de CV</div>
            <p style={{ fontSize: '.78rem', color: 'var(--text-3)', margin: '-.5rem 0 0' }}>
              Solo tus CVs subidos aquí. Los CVs que Applica adapta automáticamente para cada aplicación viven en el detalle de esa aplicación, no aquí.
            </p>
            <div style={{ border: '2px dashed var(--border)', borderRadius: 'var(--radius-lg)', padding: '2rem', textAlign: 'center', cursor: 'pointer', transition: 'border-color var(--transition)', background: 'var(--bg)' }}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                e.preventDefault();
                const file = e.dataTransfer.files[0];
                handleCVUpload(file);
              }}>
              {(uploading || activatingId) ? (
                <div style={{ padding: '1rem 0' }}>
                  <style>{`
                    @keyframes scanLine {
                      0% { transform: translateY(-100%); }
                      100% { transform: translateY(100%); }
                    }
                    .pulse-text {
                      animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
                    }
                    @keyframes pulse {
                      0%, 100% { opacity: 1; }
                      50% { opacity: 0.6; }
                    }
                  `}</style>
                  <div style={{ position: 'relative', width: 56, height: 72, border: '3px solid var(--border)', borderRadius: 'var(--radius-sm)', margin: '0 auto 1.5rem', overflow: 'hidden', background: 'var(--surface)' }}>
                    <div style={{ position: 'absolute', top: 12, left: '15%', right: '15%', height: 4, background: 'var(--border)', borderRadius: 2 }} />
                    <div style={{ position: 'absolute', top: 24, left: '15%', right: '35%', height: 4, background: 'var(--border)', borderRadius: 2 }} />
                    <div style={{ position: 'absolute', top: 36, left: '15%', right: '15%', height: 4, background: 'var(--border)', borderRadius: 2 }} />
                    <div style={{ position: 'absolute', top: 48, left: '15%', right: '45%', height: 4, background: 'var(--border)', borderRadius: 2 }} />
                    <div style={{
                      position: 'absolute', top: 0, left: 0, right: 0, height: '100%',
                      background: 'linear-gradient(to bottom, transparent, rgba(42, 74, 79, 0.2) 90%, var(--petrol) 100%)',
                      animation: 'scanLine 1.5s ease-in-out infinite alternate',
                      borderBottom: '2px solid var(--petrol)'
                    }} />
                  </div>
                  <p className="pulse-text" style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--petrol)' }}>
                    {activatingId ? 'Re-procesando CV con IA...' : 'Analizando con IA...'}
                  </p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-3)', marginTop: '0.25rem' }}>
                    {activatingId ? 'Actualizando tu perfil...' : 'Extrayendo experiencia y habilidades...'}
                  </p>
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 32, marginBottom: '0.75rem' }}></div>
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-2)', marginBottom: '0.5rem' }}>
                    {activeResume ? <><span style={{ color: 'var(--success)' }}></span> {activeResume.label}</> : 'Aún no hay CV cargado. Arrastra tu PDF o Word (.docx) aquí.'}
                  </p>
                  <button type="button" className="btn btn-secondary btn-sm">{activeResume ? 'Subir nueva versión' : 'Subir CV'}</button>
                </>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept=".pdf,.docx,.txt" style={{ display: 'none' }} disabled={uploading}
              onChange={(e) => handleCVUpload(e.target.files?.[0])} />

            {items.length > 0 && (
              <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border-light)' }}>
                <div style={{ fontSize: '.75rem', color: 'var(--text-3)', marginBottom: '.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Historial de versiones</div>
                <style>{`
                  .resume-item:hover .marquee-text {
                    display: inline-block;
                    animation: marquee 5s linear infinite;
                  }
                  @keyframes marquee {
                    0% { transform: translateX(0); }
                    100% { transform: translateX(calc(-100% + 150px)); }
                  }
                `}</style>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
                  {items.map(r => (
                    <div key={r.id} className="resume-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '.8125rem', padding: '.75rem 1rem', background: 'var(--bg-2)', borderRadius: 'var(--radius-md)', border: r.id === activeId ? '1px solid var(--petrol)' : '1px solid var(--border-light)', boxShadow: r.id === activeId ? '0 2px 4px rgba(0,0,0,0.02)' : 'none', position: 'relative' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', overflow: 'hidden', flex: 1, whiteSpace: 'nowrap' }}>
                        <span style={{ fontSize: '1.25rem', opacity: r.id === activeId ? 1 : 0.5 }}></span>
                        <div style={{ maxWidth: 180, overflow: 'hidden', maskImage: 'linear-gradient(to right, black 80%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to right, black 80%, transparent 100%)' }}>
                          <span className="marquee-text truncate" style={{ display: 'inline-block', fontWeight: r.id === activeId ? 600 : 500, color: r.id === activeId ? 'var(--petrol)' : 'var(--text-2)' }}>
                            {r.label}
                          </span>
                        </div>
                        {r.id === activeId && <span style={{ fontSize: '.65rem', padding: '2px 10px', background: 'var(--gold)', color: 'var(--text-gold)', borderRadius: 'var(--radius-full)', fontWeight: 800, letterSpacing: '0.04em', flexShrink: 0 }}>ACTIVO</span>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                        <span style={{ color: 'var(--text-3)', fontSize: '0.75rem' }}>
                          {new Date(r.createdAt).toLocaleDateString('es', { day: '2-digit', month: 'short' })}
                        </span>
                        {r.id !== activeId && (
                          <button type="button" disabled={activatingId === r.id} onClick={() => handleActivateResume(r.id)} style={{ background: 'none', border: 'none', color: 'var(--petrol)', fontSize: '0.75rem', cursor: activatingId === r.id ? 'wait' : 'pointer', textDecoration: 'underline', opacity: activatingId === r.id ? 0.5 : 1 }}>
                            {activatingId === r.id ? 'Activando...' : 'Activar'}
                          </button>
                        )}
                        <button type="button" onClick={() => handleDeleteResume(r.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 4, color: 'var(--error, #e53e3e)' }} title="Eliminar CV">

                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-label">Experiencia</div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setForm({ ...form, experience: [...form.experience, blankExperience()] })}>+ Añadir experiencia</button>
            {form.experience.map((exp, index) => (
              <div key={index} style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
                <div className="grid-2" style={{ gap: '1rem', marginBottom: '1rem' }}>
                  <div className="field-group">
                    <label className="field-label">Empresa</label>
                    <input className="input" placeholder="Empresa" value={exp.company} onChange={(e) => {
                      const experience = [...form.experience]; experience[index] = { ...exp, company: e.target.value }; setForm({ ...form, experience });
                    }} />
                  </div>
                  <div className="field-group">
                    <label className="field-label">Rol</label>
                    <input className="input" placeholder="Rol" value={exp.role} onChange={(e) => {
                      const experience = [...form.experience]; experience[index] = { ...exp, role: e.target.value }; setForm({ ...form, experience });
                    }} />
                  </div>
                  <div className="field-group">
                    <label className="field-label">Fecha inicio</label>
                    <input type="month" className="input" value={exp.startDate} onChange={(e) => {
                      const experience = [...form.experience]; experience[index] = { ...exp, startDate: e.target.value }; setForm({ ...form, experience });
                    }} />
                  </div>
                  <div className="field-group">
                    <label className="field-label">Fecha fin</label>
                    <input type="month" className="input" value={exp.endDate} disabled={exp.current} onChange={(e) => {
                      const experience = [...form.experience]; experience[index] = { ...exp, endDate: e.target.value }; setForm({ ...form, experience });
                    }} />
                    <label className="toggle-wrapper" style={{ marginTop: '0.5rem' }}>
                      <div className={`toggle ${exp.current ? 'on' : ''}`} onClick={() => {
                        const experience = [...form.experience]; experience[index] = { ...exp, current: !exp.current }; setForm({ ...form, experience });
                      }} style={{ width: 32, height: 18 }} />
                      <span className="toggle-label" style={{ fontSize: '0.75rem' }}>Trabajo actual</span>
                    </label>
                  </div>
                </div>
                <div className="field-group">
                  <label className="field-label">Descripción y logros</label>
                  <textarea className="textarea" placeholder="Descripción y logros" value={exp.description} onChange={(e) => {
                    const experience = [...form.experience]; experience[index] = { ...exp, description: e.target.value }; setForm({ ...form, experience });
                  }} />
                </div>
              </div>
            ))}
          </div>

          <div className="card">
            <div className="card-label">Educación y credenciales</div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setForm({ ...form, education: [...form.education, blankEducation()] })}>+ Añadir educación</button>
            {form.education.map((edu, index) => (
              <div key={index} className="grid-2" style={{ gap: '1rem', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
                <div className="field-group">
                  <label className="field-label">Institución</label>
                  <input className="input" placeholder="Institución" value={edu.institution} onChange={(e) => {
                    const education = [...form.education]; education[index] = { ...edu, institution: e.target.value }; setForm({ ...form, education });
                  }} />
                </div>
                <div className="field-group">
                  <label className="field-label">Título</label>
                  <input className="input" placeholder="Título" value={edu.degree} onChange={(e) => {
                    const education = [...form.education]; education[index] = { ...edu, degree: e.target.value }; setForm({ ...form, education });
                  }} />
                </div>
                <div className="field-group">
                  <label className="field-label">Campo de estudio (ej. Finanzas, Medicina)</label>
                  <input className="input" placeholder="Campo de estudio" value={edu.field} onChange={(e) => {
                    const education = [...form.education]; education[index] = { ...edu, field: e.target.value }; setForm({ ...form, education });
                  }} />
                </div>
                <div className="field-group">
                  <label className="field-label">Año de graduación</label>
                  <input type="number" className="input" placeholder="Año" value={edu.year || ''} onChange={(e) => {
                    const education = [...form.education]; education[index] = { ...edu, year: parseInt(e.target.value) || undefined }; setForm({ ...form, education });
                  }} />
                </div>
              </div>
            ))}
          </div>

          <div className="card">
            <div className="card-label">Logros</div>
            <textarea className="textarea" value={form.achievements} onChange={(e) => setForm({ ...form, achievements: e.target.value })} placeholder="Logros que Applica debería recordar al preparar aplicaciones" />
          </div>
          </div>
        )}

        {tab === 'perfil' && (
          <div className="card" style={{ maxWidth: 640 }}>
            <div className="card-label">Identidad y contacto</div>
            <div className="grid-2" style={{ gap: '1rem' }}>
              {[
                ['name', 'Nombre completo', true],
                ['email', 'Email (para tus postulaciones)', true],
                ['linkedin', 'LinkedIn', false],
              ].map(([key, label, isRequired]) => (
                <div className="field-group" key={key as string}>
                  <label className="field-label">{label as string}{isRequired ? ' *' : ''}</label>
                  <input className="input" type={key === 'email' ? 'email' : 'text'} required={isRequired as boolean} value={(form as any)[key as string]} onChange={(e) => setForm({ ...form, [key as string]: e.target.value })} />
                </div>
              ))}
              <div className="field-group">
                <label className="field-label">Teléfono</label>
                <div style={{ display: 'flex', gap: '.5rem' }}>
                  <select className="select" value={dial} onChange={(e) => setPhone(e.target.value, phoneNum)} style={{ flex: '0 0 auto', width: 150 }}>
                    {DIAL_CODES.map(([country, code]) => <option key={country} value={code}>{code} {country}</option>)}
                  </select>
                  <input className="input" type="tel" inputMode="tel" placeholder="6000-0000" value={phoneNum} onChange={(e) => setPhone(dial, e.target.value.replace(/[^\d\s-]/g, ''))} style={{ flex: 1 }} />
                </div>
              </div>
              <div className="field-group">
                <label className="field-label">País de residencia</label>
                <select className="select" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })}>
                  <option value="">Selecciona un país...</option>
                  {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div className="field-group" style={{ marginTop: '1rem' }}>
              <label className="field-label">Portafolio</label>
              <p style={{ fontSize: '.75rem', color: 'var(--text-3)', margin: '0 0 0.5rem' }}>
                Cada enlace es clicable - úsalo para verificar que apunte al sitio correcto.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '0.5rem' }}>
                {form.portfolioLinks.map((link: string, i: number) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <a
                      href={/^https?:\/\//i.test(link) ? link : `https://${link}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: '0.85rem', color: 'var(--petrol)', textDecoration: 'underline', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {link}
                    </a>
                    <button type="button" aria-label={`Quitar ${link}`} onClick={() => {
                      const portfolioLinks = form.portfolioLinks.filter((_: string, idx: number) => idx !== i);
                      setForm({ ...form, portfolioLinks });
                    }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}></button>
                  </div>
                ))}
              </div>
              <input className="input" style={{ maxWidth: 280, fontSize: '0.8rem' }}
                placeholder="Ej. portafolio.com... Enter para añadir"
                autoCapitalize="off"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const val = (e.target as HTMLInputElement).value.trim();
                    if (val && !form.portfolioLinks.includes(val)) {
                      setForm({ ...form, portfolioLinks: [...form.portfolioLinks, val] });
                      (e.target as HTMLInputElement).value = '';
                    }
                  }
                }} />
            </div>
          </div>
        )}

        {tab === 'busqueda' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <p style={{ fontSize: '.8rem', color: 'var(--text-3)', margin: 0 }}>
              Todo lo de esta pestaña alimenta directamente el buscador: define qué vacantes te mostramos y cómo puntúan.
            </p>
            <div className="card">
              <div className="card-label">Roles y Expectativas</div>
              <div className="field-group" style={{ marginBottom: '1rem' }}>
                <label className="field-label">Roles Objetivo (Ej. Frontend Developer, CTO)</label>
                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                  {form.targetRoles.map((role: string, i: number) => (
                    <span key={i} className="tag">
                      {role}
                      <button type="button" onClick={() => {
                        const targetRoles = form.targetRoles.filter((_: string, idx: number) => idx !== i);
                        setForm({ ...form, targetRoles });
                      }}></button>
                    </span>
                  ))}
                  <input className="input" style={{ maxWidth: 220, fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                    placeholder="Añadir rol y presionar Enter..."
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const val = (e.target as HTMLInputElement).value.trim();
                        if (val && !form.targetRoles.includes(val)) {
                          setForm({ ...form, targetRoles: [...form.targetRoles, val] });
                          (e.target as HTMLInputElement).value = '';
                        }
                      }
                    }} />
                </div>
                {suggestedRoles.length > 0 && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-3)', marginBottom: '0.35rem', fontWeight: 600, textTransform: 'uppercase' }}>Sugeridos de tu experiencia:</div>
                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                      {suggestedRoles.map((role: any, i: number) => (
                        <button key={i} type="button" className="btn btn-ghost" style={{ fontSize: '0.72rem', padding: '2px 8px' }}
                          onClick={() => setForm({ ...form, targetRoles: [...form.targetRoles, role] })}>
                          + {role}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="field-group" style={{ marginBottom: '1rem' }}>
                <label className="field-label">Seniority objetivo</label>
                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                  {SENIORITY_OPTIONS.map(([value, label]) => {
                    const active = form.targetSeniority.includes(value);
                    return (
                      <button key={value} type="button"
                        onClick={() => setForm({
                          ...form,
                          targetSeniority: active
                            ? form.targetSeniority.filter((s: string) => s !== value)
                            : [...form.targetSeniority, value],
                        })}
                        style={{
                          padding: '0.3rem 0.75rem', borderRadius: 'var(--radius-full)', fontSize: '0.75rem', fontWeight: 600,
                          border: `1px solid ${active ? 'var(--gold)' : 'var(--border)'}`,
                          background: active ? 'var(--gold-dim)' : 'var(--surface)',
                          color: active ? 'var(--text-gold)' : 'var(--text-3)',
                          cursor: 'pointer', transition: 'all var(--transition)',
                        }}>
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="field-group" style={{ marginBottom: '1rem' }}>
                <label className="field-label">Industrias objetivo (vacío = todas)</label>
                <TagInput
                  tags={form.targetIndustries}
                  onChange={(targetIndustries) => setForm({ ...form, targetIndustries })}
                  placeholder="Ej. Fintech, Salud... Enter para añadir"
                />
              </div>

              <div className="field-group">
                <label className="field-label">Expectativa Salarial Mínima</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <select className="select" style={{ width: '90px' }} value={form.salaryCurrency} onChange={(e) => setForm({ ...form, salaryCurrency: e.target.value })}>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="COP">COP</option>
                    <option value="MXN">MXN</option>
                  </select>
                  <input className="input" type="number" placeholder="Ej. 60000" value={form.salaryMin} onChange={(e) => setForm({ ...form, salaryMin: parseInt(e.target.value) || '' })} style={{ flex: 1 }} />
                </div>
                <input
                  className="slider" type="range" min={0} max={300000} step={5000}
                  value={typeof form.salaryMin === 'number' ? form.salaryMin : 0}
                  onChange={(e) => setForm({ ...form, salaryMin: parseInt(e.target.value) || 0 })}
                  style={{ marginTop: '.6rem' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.68rem', color: 'var(--text-3)', marginTop: '.25rem' }}>
                  <span>{form.salaryCurrency} 0</span>
                  <span>{form.salaryCurrency} 300k+</span>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-label">Habilidades</div>
              <p style={{ fontSize: '.78rem', color: 'var(--text-3)', margin: '0 0 .6rem' }}>
                Si la agregas, asumimos que la tienes - se usa como palabra clave en la búsqueda.
              </p>
              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                {form.skills.map((s: { skill: string; level?: string }, i: number) => (
                  <span key={i} className="tag">
                    {s.skill}
                    <button type="button" onClick={() => {
                      const skills = form.skills.filter((_: any, idx: number) => idx !== i);
                      setForm({ ...form, skills });
                    }}></button>
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <input className="input" style={{ maxWidth: 220, fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                  placeholder="Añadir habilidad y presionar Enter..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const val = (e.target as HTMLInputElement).value.trim();
                      if (val) {
                        setForm({ ...form, skills: [...form.skills, { skill: val }] });
                        (e.target as HTMLInputElement).value = '';
                      }
                    }
                  }} />
              </div>
            </div>

            <div className="card">
              <div className="card-label">Certificaciones</div>
              <p style={{ fontSize: '.78rem', color: 'var(--text-3)', margin: '0 0 .6rem' }}>
                El buscador también las usa como palabras clave de coincidencia.
              </p>
              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                {(form.certifications ?? []).map((c: { name: string; issuer?: string }, i: number) => (
                  <span key={i} className="tag">
                    {c.name}{c.issuer ? ` · ${c.issuer}` : ''}
                    <button type="button" onClick={() => {
                      const certifications = form.certifications.filter((_: any, idx: number) => idx !== i);
                      setForm({ ...form, certifications });
                    }}></button>
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <input className="input" style={{ maxWidth: 220, fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                  placeholder="Nombre de la certificación..." id="cert-name-input" />
                <input className="input" style={{ maxWidth: 180, fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                  placeholder="Emisor (opcional)"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const nameInput = document.getElementById('cert-name-input') as HTMLInputElement;
                      const name = nameInput?.value.trim();
                      const issuer = (e.target as HTMLInputElement).value.trim();
                      if (name) {
                        setForm({ ...form, certifications: [...(form.certifications ?? []), { name, issuer }] });
                        nameInput.value = '';
                        (e.target as HTMLInputElement).value = '';
                      }
                    }
                  }} />
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => {
                  const nameInput = document.getElementById('cert-name-input') as HTMLInputElement;
                  const name = nameInput?.value.trim();
                  if (name) {
                    setForm({ ...form, certifications: [...(form.certifications ?? []), { name, issuer: '' }] });
                    nameInput.value = '';
                  }
                }}>+ Añadir</button>
              </div>
            </div>
          </div>
        )}

        {tab === 'preferencias' && (
          <div className="card">
            <div className="card-label">Idiomas y elegibilidad</div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setForm({ ...form, languages: [...form.languages, { language: 'English', proficiency: 'B2' }] })}>+ Añadir idioma</button>
            {form.languages.map((language, index) => (
              <div key={index} style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', alignItems: 'flex-start' }}>
                <div className="grid-2" style={{ gap: '0.5rem', flex: 1 }}>
                  <select className="select" value={language.language} onChange={(e) => {
                    const languages = [...form.languages]; languages[index] = { ...language, language: e.target.value }; setForm({ ...form, languages });
                  }}>
                    <option value="Spanish">Español</option>
                    <option value="English">Inglés</option>
                    <option value="French">Francés</option>
                    <option value="Portuguese">Portugués</option>
                    <option value="German">Alemán</option>
                    <option value="Italian">Italiano</option>
                    <option value="Mandarin">Mandarín</option>
                    <option value="Japanese">Japonés</option>
                    <option value="Other">Otro</option>
                    {language.language && !['Spanish', 'English', 'French', 'Portuguese', 'German', 'Italian', 'Mandarin', 'Japanese', 'Other'].includes(language.language) && (
                      <option value={language.language}>{language.language}</option>
                    )}
                  </select>
                  <select className="select" value={language.proficiency} onChange={(e) => {
                    const languages = [...form.languages]; languages[index] = { ...language, proficiency: e.target.value }; setForm({ ...form, languages });
                  }}>
                    <option value="Native">Nativo</option>
                    <option value="C2">C2 (Avanzado Alto)</option>
                    <option value="C1">C1 (Avanzado)</option>
                    <option value="B2">B2 (Intermedio Alto)</option>
                    <option value="B1">B1 (Intermedio)</option>
                    <option value="A2">A2 (Básico Alto)</option>
                    <option value="A1">A1 (Básico)</option>
                    {language.proficiency && !['Native', 'C2', 'C1', 'B2', 'B1', 'A2', 'A1'].includes(language.proficiency) && (
                      <option value={language.proficiency}>{language.proficiency}</option>
                    )}
                  </select>
                </div>
                <button type="button" onClick={() => {
                  const languages = form.languages.filter((_, i) => i !== index); setForm({ ...form, languages });
                }} style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '0.5rem', cursor: 'pointer', color: 'var(--text-3)', height: 36, width: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}></button>
              </div>
            ))}
            <div style={{ marginTop: '1rem' }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setForm({ ...form, workAuthorization: [...form.workAuthorization, { country: '', status: '' }] })}>+ Añadir autorización laboral</button>
              {form.workAuthorization.map((auth, index) => (
                <div key={index} className="grid-2" style={{ gap: '1rem', marginTop: '1rem' }}>
                  <input className="input" placeholder="País" value={auth.country} onChange={(e) => {
                    const workAuthorization = [...form.workAuthorization]; workAuthorization[index] = { ...auth, country: e.target.value }; setForm({ ...form, workAuthorization });
                  }} />
                  <input className="input" placeholder="Estado migratorio / permiso" value={auth.status} onChange={(e) => {
                    const workAuthorization = [...form.workAuthorization]; workAuthorization[index] = { ...auth, status: e.target.value }; setForm({ ...form, workAuthorization });
                  }} />
                </div>
              ))}
            </div>
            <div className="field-group" style={{ marginTop: '1rem' }}>
              <label className="field-label">Países objetivo (mercados en los que te interesa trabajar)</label>
              <p style={{ fontSize: '.75rem', color: 'var(--text-3)', margin: '0 0 0.5rem' }}>
                Applica no descarta vacantes presenciales/híbridas en estos países aunque sean extranjeros - úsalo si buscas activamente reubicarte a un mercado específico.
              </p>
              <CountryTagInput
                value={form.targetCountries}
                onChange={(targetCountries) => setForm({ ...form, targetCountries })}
                placeholder="Añadir país..."
              />
            </div>
            <div className="grid-2" style={{ gap: '1rem', marginTop: '1rem' }}>
              <div className="field-group">
                <label className="field-label">Disponibilidad para reubicarse</label>
                <select className="select" value={form.relocationAvailable ? 'yes' : 'no'} onChange={(e) => setForm({ ...form, relocationAvailable: e.target.value === 'yes' })}>
                  <option value="no">No</option>
                  <option value="yes">Sí</option>
                </select>
              </div>
              <div className="field-group">
                <label className="field-label">Disponibilidad / notice period</label>
                <select className="select" value={form.noticePeriod} onChange={(e) => setForm({ ...form, noticePeriod: e.target.value })}>
                  <option value="">No especificado</option>
                  <option value="Inmediato">Inmediato</option>
                  <option value="1 semana">1 semana</option>
                  <option value="2 semanas">2 semanas</option>
                  <option value="1 mes">1 mes</option>
                  <option value="2 meses">2 meses</option>
                  <option value="3 meses">3 meses</option>
                  <option value="Por definir">Por definir</option>
                  {form.noticePeriod && !['Inmediato', '1 semana', '2 semanas', '1 mes', '2 meses', '3 meses', 'Por definir'].includes(form.noticePeriod) && (
                    <option value={form.noticePeriod}>{form.noticePeriod}</option>
                  )}
                </select>
              </div>
            </div>

            {/* ── Modalidad de trabajo condicional ── */}
            <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border-light)' }}>
              <div style={{ fontSize: '.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--petrol)', marginBottom: '.75rem', display: 'flex', alignItems: 'center', gap: '.5rem' }}>
                <span style={{ width: 4, height: 12, background: 'var(--gold)', borderRadius: 2, display: 'inline-block' }} />
                Modalidad de trabajo
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-3)', marginBottom: '1rem' }}>Selecciona las modalidades que aceptas. Applica filtrará vacantes automáticamente.</p>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                {([['acceptsRemote', 'Remoto'], ['acceptsHybrid', 'Híbrido'], ['acceptsOnsite', 'Presencial']] as const).map(([key, label]) => (
                  <button key={key} type="button"
                    onClick={() => setForm({ ...form, workModalityPrefs: { ...form.workModalityPrefs, [key]: !form.workModalityPrefs[key] } })}
                    style={{
                      padding: '0.5rem 1.1rem', borderRadius: 'var(--radius-full)', fontSize: '0.8125rem', fontWeight: 700,
                      border: `1px solid ${form.workModalityPrefs[key] ? 'var(--petrol)' : 'var(--border)'}`,
                      background: form.workModalityPrefs[key] ? 'var(--petrol)' : 'var(--surface)',
                      color: form.workModalityPrefs[key] ? '#fff' : 'var(--text-3)',
                      cursor: 'pointer', transition: 'all var(--transition)'
                    }}>
                    {label}
                  </button>
                ))}
              </div>

              {/* Conditional: Remote scope */}
              {form.workModalityPrefs.acceptsRemote && (
                <div style={{ background: 'var(--bg)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', padding: '1rem', marginBottom: '0.75rem' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-2)', marginBottom: '0.5rem' }}>Alcance remoto</div>
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    {(['worldwide', 'regions'] as const).map(scope => (
                      <button key={scope} type="button"
                        onClick={() => setForm({ ...form, workModalityPrefs: { ...form.workModalityPrefs, remoteScope: scope } })}
                        style={{
                          padding: '0.35rem 0.85rem', borderRadius: 'var(--radius-full)', fontSize: '0.75rem', fontWeight: 600,
                          border: `1px solid ${form.workModalityPrefs.remoteScope === scope ? 'var(--gold)' : 'var(--border)'}`,
                          background: form.workModalityPrefs.remoteScope === scope ? 'var(--gold-dim)' : 'var(--surface)',
                          color: form.workModalityPrefs.remoteScope === scope ? 'var(--text-gold)' : 'var(--text-3)',
                          cursor: 'pointer', transition: 'all var(--transition)'
                        }}>
                        {scope === 'worldwide' ? 'Todo el mundo' : 'Regiones específicas'}
                      </button>
                    ))}
                  </div>
                  {form.workModalityPrefs.remoteScope === 'regions' && (
                    <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                      {['Europa', 'América del Norte', 'América Latina', 'Asia', 'Medio Oriente', 'África', 'Oceanía'].map(region => {
                        const active = form.workModalityPrefs.remoteRegions.includes(region);
                        return (
                          <button key={region} type="button"
                            onClick={() => {
                              const regions = active
                                ? form.workModalityPrefs.remoteRegions.filter((r: string) => r !== region)
                                : [...form.workModalityPrefs.remoteRegions, region];
                              setForm({ ...form, workModalityPrefs: { ...form.workModalityPrefs, remoteRegions: regions } });
                            }}
                            style={{
                              padding: '0.25rem 0.6rem', borderRadius: '2px', fontSize: '0.72rem', fontWeight: 500,
                              border: `1px solid ${active ? 'var(--petrol)' : 'var(--border)'}`,
                              background: active ? 'rgba(42,74,79,0.08)' : 'var(--surface)',
                              color: active ? 'var(--petrol)' : 'var(--text-3)',
                              cursor: 'pointer', transition: 'all var(--transition)'
                            }}>
                            {active ? ' ' : ''}{region}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Conditional: Hybrid locations */}
              {form.workModalityPrefs.acceptsHybrid && (
                <div style={{ background: 'var(--bg)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', padding: '1rem', marginBottom: '0.75rem' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-2)', marginBottom: '0.5rem' }}>Países donde aceptas híbrido</div>
                  {form.country && !form.workModalityPrefs.hybridLocations.includes(form.country) && (
                    <button type="button" className="btn btn-ghost" style={{ fontSize: '0.72rem', padding: '2px 8px', marginBottom: '0.5rem' }}
                      onClick={() => setForm({ ...form, workModalityPrefs: { ...form.workModalityPrefs, hybridLocations: [...form.workModalityPrefs.hybridLocations, form.country] } })}>
                      + {form.country}
                    </button>
                  )}
                  <CountryTagInput
                    value={form.workModalityPrefs.hybridLocations}
                    onChange={(hybridLocations) => setForm({ ...form, workModalityPrefs: { ...form.workModalityPrefs, hybridLocations } })}
                    placeholder="Añadir país..."
                  />
                </div>
              )}

              {/* Conditional: Onsite locations */}
              {form.workModalityPrefs.acceptsOnsite && (
                <div style={{ background: 'var(--bg)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', padding: '1rem' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-2)', marginBottom: '0.5rem' }}>Países donde aceptas presencial</div>
                  {form.country && !form.workModalityPrefs.onsiteLocations.includes(form.country) && (
                    <button type="button" className="btn btn-ghost" style={{ fontSize: '0.72rem', padding: '2px 8px', marginBottom: '0.5rem' }}
                      onClick={() => setForm({ ...form, workModalityPrefs: { ...form.workModalityPrefs, onsiteLocations: [...form.workModalityPrefs.onsiteLocations, form.country] } })}>
                      + {form.country}
                    </button>
                  )}
                  <CountryTagInput
                    value={form.workModalityPrefs.onsiteLocations}
                    onChange={(onsiteLocations) => setForm({ ...form, workModalityPrefs: { ...form.workModalityPrefs, onsiteLocations } })}
                    placeholder="Añadir país..."
                  />
                </div>
              )}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '1.5rem' }}>
          <button type="button" className="btn btn-secondary" onClick={() => router.push('/applications')} style={{ width: 'fit-content' }}>
            Todo está bien, ver oportunidades
          </button>
        </div>
      </form>
    </div>
  );
}

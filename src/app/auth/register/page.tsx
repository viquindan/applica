'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { useI18n } from '@/i18n/context';
import { LogoBadge, LogoMark } from '@/components/Logo';

export default function RegisterPage() {
  const { t, locale, setLocale } = useI18n();
  const router = useRouter();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirm) { setError('Las contraseñas no coinciden.'); return; }
    if (form.password.length < 8) { setError('La contraseña debe tener al menos 8 caracteres.'); return; }
    setLoading(true);
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: form.name, email: form.email, password: form.password }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error || 'Error al crear cuenta.'); setLoading(false); return; }
    await signIn('credentials', { email: form.email, password: form.password, redirect: false });
    router.push('/onboarding');
  }

  return (
    <div className="auth-layout">
      {/* Top Header */}
      <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', padding: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 10 }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none' }}>
          <LogoBadge size={28} radius="var(--radius-sm)" />
          <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 700, color: 'var(--text)' }}>Applica</span>
        </Link>
        <select
          style={{ background: 'transparent', color: 'var(--text-3)', fontSize: '0.875rem', border: 'none', outline: 'none', cursor: 'pointer', fontWeight: 600 }}
          value={locale}
          onChange={(e) => setLocale(e.target.value as any)}
        >
          <option value="es">ES</option>
          <option value="en">EN</option>
        </select>
      </div>

      <div className="auth-card animate-fadein relative z-20 mt-12">
        {/* Logo */}
        <div className="auth-logo-wrap">
          <div className="auth-logo-icon">
            <LogoMark size={24} stroke="var(--gold)" />
          </div>
          <div className="auth-wordmark">Applic<em>a</em></div>
          <div className="auth-tagline">Job Search Intelligence</div>
        </div>
        <div>
          <h1 className="auth-title">{t.auth.createYourAccount}</h1>
          <p className="auth-subtitle">{t.auth.registerSubtitle}</p>
        </div>
        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="field-group">
            <label className="field-label" htmlFor="name">{t.auth.name}</label>
            <input id="name" type="text" className="input" value={form.name} onChange={set('name')} placeholder="Juan García" required />
          </div>
          <div className="field-group">
            <label className="field-label" htmlFor="email">{t.auth.email}</label>
            <input id="email" type="email" className="input" value={form.email} onChange={set('email')} placeholder="tu@email.com" required />
          </div>
          <div className="field-group">
            <label className="field-label" htmlFor="password">{t.auth.password}</label>
            <input id="password" type="password" className="input" value={form.password} onChange={set('password')} placeholder="Mín. 8 caracteres" required />
          </div>
          <div className="field-group">
            <label className="field-label" htmlFor="confirm">{t.auth.confirmPassword}</label>
            <input id="confirm" type="password" className={`input ${error.includes('contraseña') ? 'input-error' : ''}`} value={form.confirm} onChange={set('confirm')} placeholder="Repetir contraseña" required />
          </div>
          {error && <p className="field-error" style={{ textAlign: 'center' }}>{error}</p>}
          <button type="submit" className="btn btn-primary btn-lg w-full" disabled={loading}>
            {loading ? <><span className="spinner" style={{ width: 16, height: 16 }} /> {t.common.loading}</> : t.auth.registerButton}
          </button>
        </form>
        <div className="auth-footer">
          {t.auth.hasAccount}{' '}
          <Link href="/auth/login">{t.auth.login}</Link>
        </div>
      </div>
    </div>
  );
}

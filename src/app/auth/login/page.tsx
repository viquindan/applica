'use client';
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useI18n } from '@/i18n/context';

export default function LoginPage() {
  const { t, locale, setLocale } = useI18n();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError('');
    const res = await signIn('credentials', { email, password, redirect: false });
    if (res?.error) { setError('Credenciales incorrectas.'); setLoading(false); }
    else router.push('/dashboard');
  }

  return (
    <div className="auth-layout">
      {/* Top Header */}
      <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', padding: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 10 }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none' }}>
          <div style={{ width: 28, height: 28, background: 'var(--petrol)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M12 2C12.8 7.8 16.2 11.2 22 12C16.2 12.8 12.8 16.2 12 22C11.2 16.2 7.8 12.8 2 12C7.8 11.2 11.2 7.8 12 2Z" fill="var(--gold)"/>
            </svg>
          </div>
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
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 2C12.8 7.8 16.2 11.2 22 12C16.2 12.8 12.8 16.2 12 22C11.2 16.2 7.8 12.8 2 12C7.8 11.2 11.2 7.8 12 2Z" fill="#B09460"/>
            </svg>
          </div>
          <div className="auth-wordmark">Applic<em>a</em></div>
          <div className="auth-tagline">Job Search Intelligence</div>
        </div>

        <div className="divider" />

        <div>
          <h1 className="auth-heading">{t.auth.welcomeBack}</h1>
          <p className="auth-sub">{t.auth.loginSubtitle}</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="field-group">
            <label className="field-label" htmlFor="email">{t.auth.email}</label>
            <input id="email" type="email" className={`input ${error ? 'input-error' : ''}`}
              value={email} onChange={e => setEmail(e.target.value)}
              placeholder="tu@email.com" required autoComplete="email" />
          </div>
          <div className="field-group">
            <label className="field-label" htmlFor="password">{t.auth.password}</label>
            <input id="password" type="password" className={`input ${error ? 'input-error' : ''}`}
              value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" required autoComplete="current-password" />
          </div>
          {error && <p className="field-error" style={{ textAlign: 'center' }}>{error}</p>}

          <button type="submit" className="btn btn-primary btn-lg w-full" disabled={loading} style={{ justifyContent: 'center' }}>
            {loading ? <><span className="spinner" /> Ingresando...</> : t.auth.loginButton}
          </button>

          {process.env.NEXT_PUBLIC_LINKEDIN_OAUTH === 'true' && (
            <>
              <div className="auth-divider">o</div>
              <button type="button" className="btn w-full" style={{ justifyContent: 'center', background: '#0a66c2', color: '#fff', fontWeight: 600 }}
                onClick={() => signIn('linkedin', { callbackUrl: '/dashboard' })}>
                Continuar con LinkedIn
              </button>
            </>
          )}

          <div className="auth-divider">demo</div>
          <button type="button" className="btn btn-secondary w-full" style={{ justifyContent: 'center', fontSize: '.78rem' }}
            onClick={() => { setEmail('test@example.com'); setPassword('password123'); }}>
            Usar cuenta de prueba test@example.com
          </button>
        </form>

        <div className="auth-link-row">
          {t.auth.noAccount} <Link href="/auth/register">{t.auth.register}</Link>
        </div>
      </div>
    </div>
  );
}

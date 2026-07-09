'use client';
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError('');
    const res = await signIn('credentials', { email, password, redirect: false });
    if (res?.error) { setError('Credenciales incorrectas.'); setLoading(false); return; }
    // The (admin)/b2b-hq layout re-checks role server-side and bounces
    // non-admins to /applications - this push is safe even if this login
    // form is used by a non-admin account by mistake.
    router.push('/b2b-hq');
  }

  return (
    <div className="auth-layout" style={{ background: 'var(--petrol-dark)' }}>
      <div className="auth-card animate-fadein" style={{ background: 'var(--surface)' }}>
        <div className="auth-logo-wrap">
          <div className="auth-logo-icon" style={{ background: 'var(--petrol)' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2">
              <rect x="3" y="7" width="18" height="13" rx="2" />
              <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </div>
          <div className="auth-wordmark">Applica <em>Admin</em></div>
          <div className="auth-tagline">Backoffice interno</div>
        </div>

        <div className="divider" />

        <div>
          <h1 className="auth-heading">Acceso restringido</h1>
          <p className="auth-sub">Solo cuentas con rol de administrador.</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="field-group">
            <label className="field-label" htmlFor="email">Email</label>
            <input id="email" type="email" className={`input ${error ? 'input-error' : ''}`}
              value={email} onChange={e => setEmail(e.target.value)}
              placeholder="admin@applica.com" required autoComplete="email" />
          </div>
          <div className="field-group">
            <label className="field-label" htmlFor="password">Contraseña</label>
            <input id="password" type="password" className={`input ${error ? 'input-error' : ''}`}
              value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" required autoComplete="current-password" />
          </div>
          {error && <p className="field-error" style={{ textAlign: 'center' }}>{error}</p>}

          <button type="submit" className="btn btn-primary btn-lg w-full" disabled={loading} style={{ justifyContent: 'center' }}>
            {loading ? <><span className="spinner" /> Verificando...</> : 'Entrar al backoffice'}
          </button>
        </form>

        <div className="auth-link-row">
          <a href="/auth/login" style={{ color: 'var(--text-3)' }}>Volver al acceso de usuarios</a>
        </div>
      </div>
    </div>
  );
}

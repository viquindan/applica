'use client';
import Link from 'next/link';
import { useI18n } from '@/i18n/context';

export default function LandingClient() {
  const { t, locale, setLocale } = useI18n();

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-sans)', color: 'var(--text)' }}>
      {/* Header */}
      <header style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: 32, height: 32, background: 'var(--petrol)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-sm)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M12 2C12.8 7.8 16.2 11.2 22 12C16.2 12.8 12.8 16.2 12 22C11.2 16.2 7.8 12.8 2 12C7.8 11.2 11.2 7.8 12 2Z" fill="var(--gold)"/>
            </svg>
          </div>
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: '1.5rem', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' }}>Applica</span>
        </div>
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
          <select
            style={{ background: 'transparent', color: 'var(--text-3)', fontSize: '0.875rem', border: 'none', outline: 'none', cursor: 'pointer', fontWeight: 600 }}
            value={locale}
            onChange={(e) => setLocale(e.target.value as any)}
          >
            <option value="es">ES</option>
            <option value="en">EN</option>
          </select>
          <Link href="/auth/login" style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-2)', textDecoration: 'none' }}>
            {t.auth.login}
          </Link>
          <Link href="/auth/register" className="btn btn-primary btn-sm px-4">
            {t.auth.registerButton}
          </Link>
        </div>
      </header>

      {/* Hero */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '5rem 2rem', textAlign: 'center', position: 'relative' }}>

        <h1 style={{ fontSize: 'clamp(3rem, 5vw, 5rem)', fontFamily: 'var(--font-sans)', fontWeight: 700, color: 'var(--text)', marginBottom: '1.5rem', maxWidth: '800px', lineHeight: 1.1, letterSpacing: '-0.03em' }}>
          {t.landing.heroTitle}
        </h1>
        <p style={{ fontSize: '1.25rem', color: 'var(--text-3)', maxWidth: '600px', marginBottom: '3rem', lineHeight: 1.6 }}>
          {t.landing.heroSubtitle}
        </p>
        <div style={{ display: 'flex', gap: '1rem', zIndex: 10 }}>
          <Link href="/auth/register" className="btn btn-primary btn-lg">
            {t.landing.ctaPrimary}
          </Link>
        </div>

        {/* Features */}
        <div style={{ marginTop: '6rem', maxWidth: '1200px', width: '100%', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem', textAlign: 'left' }}>
          <div className="card" style={{ background: 'var(--surface)' }}>
            <div style={{ width: 48, height: 48, borderRadius: 'var(--radius-full)', background: 'var(--gold-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem' }}>
              <span style={{ color: 'var(--text-gold)', fontSize: '1.25rem', fontWeight: 700 }}>1</span>
            </div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text)', marginBottom: '0.75rem' }}>{t.landing.feature1Title}</h3>
            <p style={{ color: 'var(--text-3)', fontSize: '0.9rem', lineHeight: 1.6 }}>{t.landing.feature1Desc}</p>
          </div>
          <div className="card" style={{ background: 'var(--surface)' }}>
            <div style={{ width: 48, height: 48, borderRadius: 'var(--radius-full)', background: 'var(--gold-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem' }}>
              <span style={{ color: 'var(--text-gold)', fontSize: '1.25rem', fontWeight: 700 }}>2</span>
            </div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text)', marginBottom: '0.75rem' }}>{t.landing.feature2Title}</h3>
            <p style={{ color: 'var(--text-3)', fontSize: '0.9rem', lineHeight: 1.6 }}>{t.landing.feature2Desc}</p>
          </div>
          <div className="card" style={{ background: 'var(--surface)' }}>
            <div style={{ width: 48, height: 48, borderRadius: 'var(--radius-full)', background: 'var(--gold-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem' }}>
              <span style={{ color: 'var(--text-gold)', fontSize: '1.25rem', fontWeight: 700 }}>3</span>
            </div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--text)', marginBottom: '0.75rem' }}>{t.landing.feature3Title}</h3>
            <p style={{ color: 'var(--text-3)', fontSize: '0.9rem', lineHeight: 1.6 }}>{t.landing.feature3Desc}</p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer style={{ width: '100%', borderTop: '1px solid var(--border)', padding: '2rem 0', marginTop: '4rem' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 2rem', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ color: 'var(--text-3)', fontSize: '0.875rem' }}>
            © {new Date().getFullYear()} Applica. {t.landing.footerTagline}.
          </div>
          <div style={{ display: 'flex', gap: '1.5rem' }}>
            <Link href="/terms" style={{ fontSize: '0.875rem', color: 'var(--text-3)', textDecoration: 'none' }}>{t.landing.terms}</Link>
            <Link href="/privacy" style={{ fontSize: '0.875rem', color: 'var(--text-3)', textDecoration: 'none' }}>{t.landing.privacy}</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

'use client';
import Link from 'next/link';
import { useI18n } from '@/i18n/context';
import { LogoBadge } from '@/components/Logo';

export default function LandingClient() {
  const { t, locale, setLocale } = useI18n();

  const features = [
    { title: t.landing.feature1Title, desc: t.landing.feature1Desc, dark: false },
    { title: t.landing.feature2Title, desc: t.landing.feature2Desc, dark: true },
    { title: t.landing.feature3Title, desc: t.landing.feature3Desc, dark: false },
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-sans)', color: 'var(--text)' }}>
      {/* Hero: deep forest */}
      <div style={{ background: 'linear-gradient(160deg, var(--petrol) 0%, var(--petrol-light) 100%)', color: '#f1f0f0' }}>
        <header style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.5rem 2rem', maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <LogoBadge size={34} />
            <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>Applica</span>
          </div>
          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
            <select
              style={{ background: 'transparent', color: 'rgba(241,240,240,.7)', fontSize: '0.875rem', border: 'none', outline: 'none', cursor: 'pointer', fontWeight: 600 }}
              value={locale}
              onChange={(e) => setLocale(e.target.value as any)}
            >
              <option value="es" style={{ color: 'var(--text)' }}>ES</option>
              <option value="en" style={{ color: 'var(--text)' }}>EN</option>
            </select>
            <Link href="/auth/login" style={{ fontSize: '0.875rem', fontWeight: 600, color: 'rgba(241,240,240,.85)', textDecoration: 'none' }}>
              {t.auth.login}
            </Link>
            <Link href="/auth/register" className="btn btn-gold btn-sm">
              {t.auth.registerButton}
            </Link>
          </div>
        </header>

        <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '6rem 2rem 7rem', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '.5rem', padding: '.35rem 1rem',
            borderRadius: 'var(--radius-full)', border: '1px solid rgba(254,214,91,.4)',
            color: 'var(--gold)', fontSize: '.68rem', fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '.12em', marginBottom: '2rem'
          }}>
            Executive Suite
          </span>
          <h1 style={{ fontSize: 'clamp(2.75rem, 5vw, 4.25rem)', fontWeight: 900, color: '#fff', marginBottom: '1.5rem', maxWidth: '820px', lineHeight: 1.1, letterSpacing: '-0.02em' }}>
            {t.landing.heroTitle}
          </h1>
          <p style={{ fontSize: '1.15rem', color: 'rgba(241,240,240,.75)', maxWidth: '600px', marginBottom: '3rem', lineHeight: 1.6 }}>
            {t.landing.heroSubtitle}
          </p>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <Link href="/auth/register" className="btn btn-gold btn-lg">
              {t.landing.ctaPrimary}
            </Link>
            <Link href="/auth/login" className="btn btn-lg" style={{ background: 'rgba(255,255,255,.1)', color: '#fff', border: '1px solid rgba(255,255,255,.15)' }}>
              {t.auth.login}
            </Link>
          </div>
        </main>
      </div>

      {/* Features: 3 steps, middle card dark */}
      <section style={{ maxWidth: '1200px', width: '100%', margin: '0 auto', padding: '5rem 2rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', textAlign: 'left' }}>
          {features.map((f, i) => (
            <div key={i} style={{
              background: f.dark ? 'var(--petrol)' : 'var(--surface)',
              color: f.dark ? '#f1f0f0' : 'var(--text)',
              border: '1px solid ' + (f.dark ? 'var(--petrol)' : 'var(--border)'),
              borderRadius: 'var(--radius-lg)', padding: '2rem',
              boxShadow: 'var(--shadow-sm)', display: 'flex', flexDirection: 'column'
            }}>
              <div style={{
                width: 48, height: 48, borderRadius: 'var(--radius-full)',
                background: f.dark ? 'var(--gold)' : 'var(--gold-dim)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem'
              }}>
                <span style={{ color: f.dark ? 'var(--petrol)' : 'var(--text-gold)', fontSize: '1.15rem', fontWeight: 800 }}>{i + 1}</span>
              </div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.75rem' }}>{f.title}</h3>
              <p style={{ color: f.dark ? 'rgba(241,240,240,.7)' : 'var(--text-2)', fontSize: '0.9rem', lineHeight: 1.6 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer style={{ width: '100%', borderTop: '1px solid var(--border)', padding: '2rem 0', marginTop: 'auto' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 2rem', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ color: 'var(--text-3)', fontSize: '0.875rem' }}>
            {'©'} {new Date().getFullYear()} Applica. {t.landing.footerTagline}.
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

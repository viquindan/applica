'use client';
import { useState } from 'react';
import Link from 'next/link';
import {
  IconWorldSearch, IconSparkles, IconSwipe, IconShieldCheck,
  IconLock, IconUserCheck, IconDatabase, IconCheck, IconChevronDown,
  IconUpload, IconRadar2, IconFileCheck,
} from '@tabler/icons-react';
import { useI18n } from '@/i18n/context';
import { LogoBadge } from '@/components/Logo';

export default function LandingClient({ trackedBoards }: { trackedBoards: number }) {
  const { t, locale, setLocale } = useI18n();

  const steps = [
    { icon: IconUpload, title: t.landing.how1Title, desc: t.landing.how1Desc },
    { icon: IconRadar2, title: t.landing.how2Title, desc: t.landing.how2Desc },
    { icon: IconSwipe, title: t.landing.how3Title, desc: t.landing.how3Desc },
    { icon: IconFileCheck, title: t.landing.how4Title, desc: t.landing.how4Desc },
  ];

  const features = [
    { icon: IconWorldSearch, title: t.landing.feature1Title, desc: t.landing.feature1Desc },
    { icon: IconSparkles, title: t.landing.feature2Title, desc: t.landing.feature2Desc },
    { icon: IconSwipe, title: t.landing.feature3Title, desc: t.landing.feature3Desc },
    { icon: IconShieldCheck, title: t.landing.feature4Title, desc: t.landing.feature4Desc },
  ];

  const trustPoints = [
    { icon: IconLock, title: t.landing.trust1Title, desc: t.landing.trust1Desc },
    { icon: IconDatabase, title: t.landing.trust2Title, desc: t.landing.trust2Desc },
    { icon: IconUserCheck, title: t.landing.trust3Title, desc: t.landing.trust3Desc },
  ];

  const faqs = [
    { q: t.landing.faq1Q, a: t.landing.faq1A },
    { q: t.landing.faq2Q, a: t.landing.faq2A },
    { q: t.landing.faq3Q, a: t.landing.faq3A },
    { q: t.landing.faq4Q, a: t.landing.faq4A },
  ];
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-sans)', color: 'var(--text)' }}>
      {/* Hero: deep forest */}
      <div style={{ background: 'linear-gradient(160deg, var(--petrol) 0%, var(--petrol-light) 100%)', color: '#f1f0f0' }}>
        <header className="landing-header" style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.5rem 2rem', maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <LogoBadge size={34} />
            <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>Applica</span>
          </div>
          <nav aria-label="Primary" className="landing-nav" style={{ gap: '2rem', alignItems: 'center' }}>
            <a href="#how" style={{ fontSize: '0.875rem', fontWeight: 600, color: 'rgba(241,240,240,.75)', textDecoration: 'none', transition: 'color 150ms ease' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#fff')} onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(241,240,240,.75)')}>
              {t.landing.navHow}
            </a>
            <a href="#pricing" style={{ fontSize: '0.875rem', fontWeight: 600, color: 'rgba(241,240,240,.75)', textDecoration: 'none', transition: 'color 150ms ease' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#fff')} onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(241,240,240,.75)')}>
              {t.landing.navPricing}
            </a>
            <a href="#faq" style={{ fontSize: '0.875rem', fontWeight: 600, color: 'rgba(241,240,240,.75)', textDecoration: 'none', transition: 'color 150ms ease' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#fff')} onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(241,240,240,.75)')}>
              {t.landing.navFaq}
            </a>
          </nav>
          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
            <select
              aria-label="Language"
              style={{ background: 'transparent', color: 'rgba(241,240,240,.7)', fontSize: '0.875rem', border: 'none', outline: 'none', cursor: 'pointer', fontWeight: 600 }}
              value={locale}
              onChange={(e) => setLocale(e.target.value as any)}
            >
              <option value="es" style={{ color: 'var(--text)' }}>ES</option>
              <option value="en" style={{ color: 'var(--text)' }}>EN</option>
            </select>
            <Link href="/auth/login" className="landing-login-link" style={{ fontSize: '0.875rem', fontWeight: 600, color: 'rgba(241,240,240,.85)', textDecoration: 'none' }}>
              {t.auth.login}
            </Link>
            <Link href="/auth/register" className="btn btn-gold btn-sm">
              {t.auth.registerButton}
            </Link>
          </div>
        </header>

        <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '5rem 2rem 6rem', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }} className="animate-fadein">
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '.5rem', padding: '.35rem 1rem',
            borderRadius: 'var(--radius-full)', border: '1px solid rgba(254,214,91,.4)',
            color: 'var(--gold)', fontSize: '.68rem', fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '.12em', marginBottom: '2rem'
          }}>
            {t.landing.heroEyebrow}
          </span>
          <h1 style={{ fontSize: 'clamp(2.75rem, 5vw, 4.25rem)', fontWeight: 900, color: '#fff', marginBottom: '1.5rem', maxWidth: '820px', lineHeight: 1.1, letterSpacing: '-0.02em' }}>
            {t.landing.heroTitle}
          </h1>
          <p style={{ fontSize: '1.15rem', color: 'rgba(241,240,240,.75)', maxWidth: '620px', marginBottom: '2.5rem', lineHeight: 1.6 }}>
            {t.landing.heroSubtitle}
          </p>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <Link href="/auth/register" className="btn btn-gold btn-lg">
              {t.landing.ctaPrimary}
            </Link>
            <a href="#how" className="btn btn-lg" style={{ background: 'rgba(255,255,255,.1)', color: '#fff', border: '1px solid rgba(255,255,255,.15)' }}>
              {t.landing.ctaSecondary}
            </a>
          </div>
          <p style={{ fontSize: '.8rem', color: 'rgba(241,240,240,.5)' }}>{t.landing.heroNote}</p>

          {/* Stat strip - real numbers, no invented social proof */}
          <div style={{ display: 'flex', gap: '2.5rem', flexWrap: 'wrap', marginTop: '3.5rem', paddingTop: '2.5rem', borderTop: '1px solid rgba(255,255,255,.12)', width: '100%' }}>
            <div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{trackedBoards.toLocaleString(locale)}</div>
              <div style={{ fontSize: '.72rem', color: 'rgba(241,240,240,.55)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{t.landing.statBoards}</div>
            </div>
            <div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#fff' }}>5+</div>
              <div style={{ fontSize: '.72rem', color: 'rgba(241,240,240,.55)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{t.landing.statAts}</div>
            </div>
            <div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--gold)' }}>0</div>
              <div style={{ fontSize: '.72rem', color: 'rgba(241,240,240,.55)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{t.landing.statControl}</div>
            </div>
          </div>
        </main>
      </div>

      {/* How it works */}
      <section id="how" style={{ maxWidth: '1200px', width: '100%', margin: '0 auto', padding: '6rem 2rem 5rem' }}>
        <div style={{ maxWidth: 620, marginBottom: '3rem' }}>
          <h2 style={{ fontSize: 'clamp(1.75rem, 3vw, 2.25rem)', fontWeight: 800, marginBottom: '.75rem', letterSpacing: '-0.01em' }}>{t.landing.howTitle}</h2>
          <p style={{ fontSize: '1rem', color: 'var(--text-2)', lineHeight: 1.6 }}>{t.landing.howSubtitle}</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem' }}>
          {steps.map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={i} className="card card-hover" style={{ padding: '1.75rem', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem' }}>
                  <div style={{ width: 42, height: 42, borderRadius: 'var(--radius-md)', background: 'var(--gold-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon size={22} stroke={1.75} color="var(--text-gold)" />
                  </div>
                  <span style={{ fontSize: '.7rem', fontWeight: 800, color: 'var(--text-3)', letterSpacing: '.08em' }}>0{i + 1}</span>
                </div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>{s.title}</h3>
                <p style={{ fontSize: '.85rem', color: 'var(--text-2)', lineHeight: 1.6 }}>{s.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Features */}
      <section style={{ maxWidth: '1200px', width: '100%', margin: '0 auto', padding: '3rem 2rem 5rem' }}>
        <h2 style={{ fontSize: 'clamp(1.75rem, 3vw, 2.25rem)', fontWeight: 800, marginBottom: '2.5rem', letterSpacing: '-0.01em', maxWidth: 620 }}>{t.landing.featuresTitle}</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.5rem' }}>
          {features.map((f, i) => {
            const Icon = f.icon;
            const dark = i === 2;
            return (
              <div key={i} style={{
                background: dark ? 'var(--petrol)' : 'var(--surface)',
                color: dark ? '#f1f0f0' : 'var(--text)',
                border: '1px solid ' + (dark ? 'var(--petrol)' : 'var(--border)'),
                borderRadius: 'var(--radius-lg)', padding: '2rem',
                boxShadow: 'var(--shadow-sm)', display: 'flex', flexDirection: 'column'
              }} className="card-hover">
                <div style={{
                  width: 48, height: 48, borderRadius: 'var(--radius-full)',
                  background: dark ? 'var(--gold)' : 'var(--gold-dim)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.5rem'
                }}>
                  <Icon size={24} stroke={1.75} color={dark ? 'var(--petrol)' : 'var(--text-gold)'} />
                </div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.75rem' }}>{f.title}</h3>
                <p style={{ color: dark ? 'rgba(241,240,240,.7)' : 'var(--text-2)', fontSize: '0.875rem', lineHeight: 1.6 }}>{f.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Trust */}
      <section style={{ background: 'var(--bg-2)', padding: '5rem 0' }}>
        <div style={{ maxWidth: '1200px', width: '100%', margin: '0 auto', padding: '0 2rem' }}>
          <h2 style={{ fontSize: 'clamp(1.75rem, 3vw, 2.25rem)', fontWeight: 800, marginBottom: '2.5rem', letterSpacing: '-0.01em', maxWidth: 620 }}>{t.landing.trustTitle}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '2rem' }}>
            {trustPoints.map((p, i) => {
              const Icon = p.icon;
              return (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
                  <Icon size={26} stroke={1.6} color="var(--petrol)" />
                  <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>{p.title}</h3>
                  <p style={{ fontSize: '.85rem', color: 'var(--text-2)', lineHeight: 1.6 }}>{p.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" style={{ maxWidth: '1200px', width: '100%', margin: '0 auto', padding: '6rem 2rem 5rem' }}>
        <div style={{ maxWidth: 620, marginBottom: '3rem' }}>
          <h2 style={{ fontSize: 'clamp(1.75rem, 3vw, 2.25rem)', fontWeight: 800, marginBottom: '.75rem', letterSpacing: '-0.01em' }}>{t.landing.pricingTitle}</h2>
          <p style={{ fontSize: '1rem', color: 'var(--text-2)', lineHeight: 1.6 }}>{t.landing.pricingSubtitle}</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem', maxWidth: 760 }}>
          {/* Free */}
          <div className="card" style={{ padding: '2rem' }}>
            <div>
              <div style={{ fontSize: '.9rem', fontWeight: 700, color: 'var(--text-2)', marginBottom: '.5rem' }}>{t.landing.pricingFreeName}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '.25rem', marginBottom: '.5rem' }}>
                <span style={{ fontSize: '2.25rem', fontWeight: 800 }}>{t.landing.pricingFreePrice}</span>
                <span style={{ fontSize: '.85rem', color: 'var(--text-3)' }}>{t.landing.pricingFreePeriod}</span>
              </div>
              <p style={{ fontSize: '.85rem', color: 'var(--text-3)' }}>{t.landing.pricingFreeDesc}</p>
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '.65rem' }}>
              {[t.landing.pricingFreeFeat1, t.landing.pricingFreeFeat2, t.landing.pricingFreeFeat3].map((feat, i) => (
                <li key={i} style={{ display: 'flex', gap: '.6rem', alignItems: 'flex-start', fontSize: '.85rem', color: 'var(--text-2)' }}>
                  <IconCheck size={16} stroke={2} color="var(--petrol)" style={{ flexShrink: 0, marginTop: 2 }} />
                  {feat}
                </li>
              ))}
            </ul>
            <Link href="/auth/register" className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center' }}>
              {t.landing.pricingCta}
            </Link>
          </div>
          {/* Pro */}
          <div className="card" style={{ padding: '2rem', border: '2px solid var(--gold)', position: 'relative' }}>
            <span className="badge badge-gold" style={{ position: 'absolute', top: '-11px', left: '2rem' }}>{t.landing.pricingBadgePopular}</span>
            <div>
              <div style={{ fontSize: '.9rem', fontWeight: 700, color: 'var(--text-gold)', marginBottom: '.5rem' }}>{t.landing.pricingProName}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '.25rem', marginBottom: '.5rem' }}>
                <span style={{ fontSize: '2.25rem', fontWeight: 800 }}>{t.landing.pricingProPrice}</span>
                <span style={{ fontSize: '.85rem', color: 'var(--text-3)' }}>{t.landing.pricingProPeriod}</span>
              </div>
              <p style={{ fontSize: '.85rem', color: 'var(--text-3)' }}>{t.landing.pricingProDesc}</p>
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '.65rem' }}>
              {[t.landing.pricingProFeat1, t.landing.pricingProFeat2, t.landing.pricingProFeat3].map((feat, i) => (
                <li key={i} style={{ display: 'flex', gap: '.6rem', alignItems: 'flex-start', fontSize: '.85rem', color: 'var(--text-2)' }}>
                  <IconCheck size={16} stroke={2} color="var(--text-gold)" style={{ flexShrink: 0, marginTop: 2 }} />
                  {feat}
                </li>
              ))}
            </ul>
            <Link href="/auth/register" className="btn btn-gold" style={{ width: '100%', justifyContent: 'center' }}>
              {t.landing.pricingCta}
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" style={{ background: 'var(--bg-2)', padding: '5rem 0' }}>
        <div style={{ maxWidth: 760, width: '100%', margin: '0 auto', padding: '0 2rem' }}>
          <h2 style={{ fontSize: 'clamp(1.75rem, 3vw, 2.25rem)', fontWeight: 800, marginBottom: '2.5rem', letterSpacing: '-0.01em' }}>{t.landing.faqTitle}</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.75rem' }}>
            {faqs.map((f, i) => {
              const open = openFaq === i;
              return (
                <div key={i} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <button
                    onClick={() => setOpenFaq(open ? null : i)}
                    aria-expanded={open}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      background: 'none', border: 'none', cursor: 'pointer', padding: '1.25rem 1.5rem',
                      fontSize: '.95rem', fontWeight: 600, color: 'var(--text)', textAlign: 'left',
                    }}
                  >
                    {f.q}
                    <IconChevronDown size={18} stroke={2} color="var(--text-3)" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 200ms ease', flexShrink: 0 }} />
                  </button>
                  {open && (
                    <p style={{ padding: '0 1.5rem 1.25rem', fontSize: '.875rem', color: 'var(--text-2)', lineHeight: 1.6 }}>{f.a}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section style={{ background: 'linear-gradient(160deg, var(--petrol) 0%, var(--petrol-light) 100%)', padding: '5rem 2rem', textAlign: 'center' }}>
        <div style={{ maxWidth: 620, margin: '0 auto' }}>
          <h2 style={{ fontSize: 'clamp(1.75rem, 3.5vw, 2.5rem)', fontWeight: 800, color: '#fff', marginBottom: '1rem', letterSpacing: '-0.01em' }}>{t.landing.finalCtaTitle}</h2>
          <p style={{ fontSize: '1rem', color: 'rgba(241,240,240,.75)', marginBottom: '2rem' }}>{t.landing.finalCtaSubtitle}</p>
          <Link href="/auth/register" className="btn btn-gold btn-xl">{t.landing.finalCtaButton}</Link>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ width: '100%', borderTop: '1px solid var(--border)', padding: '3rem 0 2rem', marginTop: 'auto' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '2rem', marginBottom: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <LogoBadge size={24} radius="var(--radius-sm)" />
              <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)' }}>Applica</span>
            </div>
            <div style={{ display: 'flex', gap: '3rem', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '.7rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '.75rem' }}>{t.landing.footerProduct}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
                  <a href="#how" style={{ fontSize: '.85rem', color: 'var(--text-2)', textDecoration: 'none' }}>{t.landing.navHow}</a>
                  <a href="#pricing" style={{ fontSize: '.85rem', color: 'var(--text-2)', textDecoration: 'none' }}>{t.landing.navPricing}</a>
                  <a href="#faq" style={{ fontSize: '.85rem', color: 'var(--text-2)', textDecoration: 'none' }}>{t.landing.navFaq}</a>
                </div>
              </div>
              <div>
                <div style={{ fontSize: '.7rem', fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '.75rem' }}>{t.landing.footerLegal}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
                  <Link href="/terms" style={{ fontSize: '.85rem', color: 'var(--text-2)', textDecoration: 'none' }}>{t.landing.terms}</Link>
                  <Link href="/privacy" style={{ fontSize: '.85rem', color: 'var(--text-2)', textDecoration: 'none' }}>{t.landing.privacy}</Link>
                </div>
              </div>
            </div>
          </div>
          <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '1.5rem', color: 'var(--text-3)', fontSize: '0.8rem' }}>
            {'©'} {new Date().getFullYear()} Applica. {t.landing.footerTagline}.
          </div>
        </div>
      </footer>
    </div>
  );
}

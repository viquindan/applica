'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useI18n } from '@/i18n/context';

const STEPS = [
  { href: '/profile', number: '1', label: 'nav.profile' },
  { href: '/applications', number: '2', label: 'nav.applications' },
];

function getLabel(key: string, t: any): string {
  return key.split('.').reduce((o: any, k) => o?.[k], t) ?? key;
}

export default function Sidebar() {
  const { t, locale, setLocale } = useI18n();
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <Link href="/" className="sidebar-logo" style={{ textDecoration: 'none' }}>
        <div style={{ width: 32, height: 32, background: 'var(--petrol)', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M12 2C12.8 7.8 16.2 11.2 22 12C16.2 12.8 12.8 16.2 12 22C11.2 16.2 7.8 12.8 2 12C7.8 11.2 11.2 7.8 12 2Z" fill="var(--gold)"/>
          </svg>
        </div>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: '1.25rem', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em' }}>Applica</span>
      </Link>

      <nav className="sidebar-nav">
        <div className="nav-section">{getLabel('nav.journey', t) ?? 'Journey'}</div>
        {STEPS.map((step) => {
          const active = pathname === step.href || pathname.startsWith(step.href);
          return (
            <Link key={step.href} href={step.href} className={`nav-item ${active ? 'active' : ''}`}>
              <span style={{
                width: 20,
                height: 20,
                borderRadius: '999px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '.72rem',
                border: '1px solid currentColor',
              }}>{step.number}</span>
              {getLabel(step.label, t)}
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div style={{ display: 'flex', gap: '.375rem', marginBottom: '.75rem' }}>
          {(['es', 'en'] as const).map(l => (
            <button key={l} onClick={() => setLocale(l)} style={{
              flex: 1, padding: '6px', borderRadius: '4px', fontSize: '.7rem', fontWeight: 700,
              letterSpacing: '.06em', textTransform: 'uppercase',
              background: locale === l ? 'var(--surface)' : 'transparent',
              color: locale === l ? 'var(--text)' : 'var(--text-3)',
              border: `1px solid ${locale === l ? 'var(--border)' : 'transparent'}`,
              boxShadow: locale === l ? 'var(--shadow-sm)' : 'none',
              cursor: 'pointer', transition: 'all var(--transition)',
            }}>
              {l}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}




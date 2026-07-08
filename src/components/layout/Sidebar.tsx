'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useI18n } from '@/i18n/context';

const NAV = [
  {
    href: '/profile', label: 'nav.profile',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c0-3.3 3.6-5 8-5s8 1.7 8 5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: '/applications', label: 'nav.applications',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3" y="7" width="18" height="13" rx="2" />
        <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      </svg>
    ),
  },
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
        <div style={{ width: 36, height: 36, background: 'var(--gold)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--petrol)" strokeWidth="2">
            <rect x="3" y="7" width="18" height="13" rx="2" />
            <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="sidebar-wordmark">Applica</span>
          <span className="sidebar-tagline">Executive Career Suite</span>
        </div>
      </Link>

      <nav className="sidebar-nav">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href} className={`nav-item ${active ? 'active' : ''}`}>
              {item.icon}
              {getLabel(item.label, t)}
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div style={{ display: 'flex', gap: '.375rem' }}>
          {(['es', 'en'] as const).map(l => (
            <button key={l} onClick={() => setLocale(l)} style={{
              flex: 1, padding: '6px', borderRadius: 'var(--radius-full)', fontSize: '.7rem', fontWeight: 700,
              letterSpacing: '.06em', textTransform: 'uppercase',
              background: locale === l ? 'rgba(255,255,255,.14)' : 'transparent',
              color: locale === l ? '#fff' : 'rgba(241,240,240,.55)',
              border: '1px solid ' + (locale === l ? 'rgba(255,255,255,.2)' : 'transparent'),
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

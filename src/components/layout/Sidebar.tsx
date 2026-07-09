'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useI18n } from '@/i18n/context';
import { LogoBadge } from '@/components/Logo';

const NAV = [
  {
    href: '/applications', label: 'nav.feed',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="5" y="3" width="13" height="17" rx="2.5" transform="rotate(-6 11.5 11.5)" opacity=".45" />
        <rect x="4" y="4" width="14" height="17" rx="2.5" />
      </svg>
    ),
  },
  {
    href: '/applications/pending', label: 'nav.pending',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="4" y="4" width="16" height="17" rx="2" />
        <path d="M9 3.5h6a1 1 0 0 1 1 1V6H8V4.5a1 1 0 0 1 1-1Z" fill="currentColor" stroke="none" />
        <path d="M12 10v4" strokeLinecap="round" />
        <circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    href: '/applications/apps', label: 'nav.applications',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="3" y="7" width="18" height="13" rx="2" />
        <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      </svg>
    ),
  },
  {
    href: '/profile', label: 'nav.profile',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c0-3.3 3.6-5 8-5s8 1.7 8 5" strokeLinecap="round" />
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
        <LogoBadge size={36} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="sidebar-wordmark">Applica</span>
          <span className="sidebar-tagline">Executive Career Suite</span>
        </div>
      </Link>

      <nav className="sidebar-nav">
        {NAV.map((item) => {
          // '/applications' (Feed) must match exactly - it's a prefix of the
          // other two applications/* routes and would otherwise always light up.
          const active = pathname === item.href || (item.href !== '/applications' && pathname.startsWith(item.href));
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
              background: locale === l ? 'var(--gold-dim)' : 'transparent',
              color: locale === l ? 'var(--text-gold)' : 'var(--text-3)',
              border: '1px solid ' + (locale === l ? 'var(--gold-light)' : 'transparent'),
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

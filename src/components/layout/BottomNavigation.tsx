'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useI18n } from '@/i18n/context';

const NAV = [
  {
    href: '/applications', label: 'nav.feed',
    icon: (filled: boolean) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="5" y="3" width="13" height="17" rx="2.5" transform="rotate(-6 11.5 11.5)" opacity=".4" />
        <rect x="4" y="4" width="14" height="17" rx="2.5" fill={filled ? 'currentColor' : 'none'} />
      </svg>
    ),
  },
  {
    href: '/applications/pending', label: 'nav.pending',
    icon: (filled: boolean) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="4" y="4" width="16" height="17" rx="2" fill={filled ? 'currentColor' : 'none'} />
        <path d="M9 3.5h6a1 1 0 0 1 1 1V6H8V4.5a1 1 0 0 1 1-1Z" fill={filled ? 'var(--gold)' : 'currentColor'} stroke="none" />
        <path d="M12 10v4" stroke={filled ? 'var(--gold)' : 'currentColor'} strokeLinecap="round" />
        <circle cx="12" cy="17" r="0.9" fill={filled ? 'var(--gold)' : 'currentColor'} stroke="none" />
      </svg>
    ),
  },
  {
    href: '/applications/apps', label: 'nav.applications',
    icon: (filled: boolean) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8">
        <rect x="3" y="7" width="18" height="13" rx="2" />
        <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      </svg>
    ),
  },
  {
    href: '/profile', label: 'nav.profile',
    icon: (filled: boolean) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c0-3.3 3.6-5 8-5s8 1.7 8 5" strokeLinecap="round" />
      </svg>
    ),
  },
];

function getLabel(key: string, t: any): string {
  return key.split('.').reduce((o: any, k) => o?.[k], t) ?? key;
}

export default function BottomNavigation() {
  const { t } = useI18n();
  const pathname = usePathname();

  return (
    <nav className="bottom-nav">
      {NAV.map((item) => {
        const active = pathname === item.href || (item.href !== '/applications' && pathname.startsWith(item.href));
        return (
          <Link key={item.href} href={item.href} className={`bottom-nav-item ${active ? 'active' : ''}`}>
            {item.icon(active)}
            <span>{getLabel(item.label, t)}</span>
          </Link>
        );
      })}
    </nav>
  );
}

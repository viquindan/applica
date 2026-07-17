'use client';
import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { signOut } from 'next-auth/react';
import { useI18n } from '@/i18n/context';
import { LogoBadge } from '@/components/Logo';

export default function Header({ userName }: { userName: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const initials = userName
    .split(' ')
    .map(n => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'U';

  return (
    <header className="app-header" style={{
      width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '.85rem 2rem', borderBottom: '1px solid var(--border)',
      background: 'var(--bg)', position: 'sticky', top: 0, zIndex: 50
    }}>
      {/* Hidden on desktop (the sidebar already shows the logo), shown on
          mobile via the .header-brand media query override in globals.css.
          Must stay `visibility: hidden` (not display: none): with only one
          flex child, `justify-content: space-between` collapses it to
          flex-start (left) instead of the far end - which pinned the account
          avatar/dropdown to the left, overlapping the sidebar nav. Keeping
          this in the flex flow (invisible but still taking space) is what
          pushes the avatar to the right on desktop. */}
      <Link href="/applications" className="header-brand" style={{ visibility: 'hidden', display: 'flex', alignItems: 'center', gap: '.5rem', textDecoration: 'none' }}>
        <LogoBadge size={30} radius="var(--radius-sm)" />
        <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.01em' }}>Applica</span>
      </Link>

      <div style={{ position: 'relative' }} ref={ref}>
        <button
          onClick={() => setOpen(!open)}
          aria-label={`Menú de cuenta de ${userName}`}
          aria-haspopup="menu"
          aria-expanded={open}
          style={{
            width: '40px', height: '40px', borderRadius: '50%',
            background: 'var(--petrol)',
            color: 'white', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: 'none', cursor: 'pointer', transition: 'all 0.2s', boxShadow: 'var(--shadow-sm)'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--petrol-light)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'var(--petrol)'}
        >
          {initials}
        </button>

        {open && (
          <div style={{
            position: 'absolute', right: 0, top: 'calc(100% + 8px)', width: '220px',
            borderRadius: 'var(--radius-sm)', background: 'var(--surface)', border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-md)', overflow: 'hidden', zIndex: 50,
            animation: 'fadeIn 0.2s ease-out'
          }}>
            <div style={{ padding: '16px', borderBottom: '1px solid var(--border-light)', background: 'var(--bg-2)' }}>
              <p style={{ fontSize: '14px', color: 'var(--text)', fontWeight: 600, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{userName}</p>
            </div>

            <Link
              href="/profile"
              onClick={() => setOpen(false)}
              style={{ display: 'block', padding: '12px 16px', fontSize: '13px', color: 'var(--text-2)', textDecoration: 'none', transition: 'all 0.2s' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-3)'; e.currentTarget.style.color = 'var(--text)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-2)'; }}
            >
              {t.nav.profile ?? 'Profile'}
            </Link>

            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              style={{ display: 'block', padding: '12px 16px', fontSize: '13px', color: 'var(--text-2)', textDecoration: 'none', transition: 'all 0.2s' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-3)'; e.currentTarget.style.color = 'var(--text)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-2)'; }}
            >
              {t.nav.settings ?? 'Settings'}
            </Link>

            <div style={{ borderTop: '1px solid var(--border-light)', margin: '4px 0' }} />

            <button
              onClick={() => signOut({ callbackUrl: '/auth/login' })}
              style={{
                width: '100%', textAlign: 'left', padding: '12px 16px', fontSize: '13px', color: 'var(--danger)',
                background: 'transparent', border: 'none', cursor: 'pointer', transition: 'all 0.2s',
                display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 500
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--danger-dim)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <span>{t.nav.logout ?? 'Log out'}</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

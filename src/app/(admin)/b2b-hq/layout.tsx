import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/admin/login');
  }

  // Ensure role is admin by checking the database directly
  const [dbUser] = await db.select({ role: users.role }).from(users).where(eq(users.id, session.user.id)).limit(1);

  if (!dbUser || dbUser.role !== 'admin') {
    redirect('/applications');
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>
      {/* Simple sidebar for the admin backoffice - deliberately separate from the user Sidebar/BottomNavigation */}
      <aside style={{ width: '250px', flexShrink: 0, background: 'var(--surface)', borderRight: '1px solid var(--border)', padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem', marginBottom: '2rem' }}>
          <div style={{ width: 32, height: 32, background: 'var(--petrol)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="2">
              <rect x="3" y="7" width="18" height="13" rx="2" />
              <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '.95rem', color: 'var(--petrol)', lineHeight: 1.2 }}>Applica Admin</div>
            <div style={{ fontSize: '.65rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Backoffice</div>
          </div>
        </div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '.25rem' }}>
          <a href="/b2b-hq" className="nav-item active">Overview</a>
          <a href="/applications" className="nav-item" style={{ marginTop: '1.5rem', color: 'var(--text-3)', fontSize: '.8rem' }}>← Volver a la app de usuario</a>
        </nav>
      </aside>

      <main style={{ flex: 1, padding: '2rem', overflowY: 'auto' }}>
        {children}
      </main>
    </div>
  );
}

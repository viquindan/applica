import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { LogoMark } from '@/components/Logo';

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
            <LogoMark size={16} stroke="var(--gold)" />
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

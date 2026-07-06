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
    redirect('/auth/login');
  }

  // Ensure role is admin by checking the database directly
  const [dbUser] = await db.select({ role: users.role }).from(users).where(eq(users.id, session.user.id)).limit(1);

  if (!dbUser || dbUser.role !== 'admin') {
    redirect('/applications');
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-1)', color: 'var(--text-1)' }}>
      {/* Simple Sidebar for Admin */}
      <aside style={{ width: '250px', background: 'var(--bg-2)', borderRight: '1px solid var(--border)', padding: '1.5rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '2rem', color: 'var(--primary)' }}>Applica Admin</h2>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <a href="/b2b-hq" style={{ color: 'var(--text-1)', textDecoration: 'none', fontWeight: 500 }}>Overview</a>
          <a href="/applications" style={{ color: 'var(--text-3)', textDecoration: 'none', fontSize: '0.875rem' }}> Back to User App</a>
        </nav>
      </aside>

      <main style={{ flex: 1, padding: '2rem', overflowY: 'auto' }}>
        {children}
      </main>
    </div>
  );
}

import { auth } from'@/lib/auth';
import { redirect } from'next/navigation';
import Sidebar from'@/components/layout/Sidebar';
import Header from'@/components/layout/Header';
import { db } from'@/db/client';
import { users } from'@/db/schema';
import { eq } from'drizzle-orm';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/auth/login');

  const dbUser = await db.query.users.findFirst({
    where: eq(users.id, session.user.id)
  });

  if (!dbUser?.onboardingCompleted) {
    redirect('/onboarding');
  }

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <Header userName={session.user?.name || session.user?.email || 'Usuario'} />
        <div className="page-container">
          {children}
        </div>
      </main>
    </div>
  );
}

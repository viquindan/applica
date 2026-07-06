import { db } from '@/db/client';
import { users, atsBoards, vacancies } from '@/db/schema';
import { eq, count } from 'drizzle-orm';
import { PgBoss } from 'pg-boss';
import { getAtsRegistryMetrics } from '@/core/platforms/atsRegistry';

export const dynamic = 'force-dynamic';

async function getPgBossMetrics() {
  try {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) return null;

    const boss = new PgBoss({ connectionString: dbUrl });
    // Connect silently, get state, disconnect
    await boss.start();
    await boss.stop();
    return { status: "Online" };
  } catch (e) {
    console.error('Error fetching pg-boss metrics', e);
    return null;
  }
}

export default async function AdminPage() {
  const [
    totalUsersRes,
    totalBoardsRes,
    totalVacanciesRes,
    queueState,
    atsMetrics
  ] = await Promise.all([
    db.select({ count: count() }).from(users),
    db.select({ count: count() }).from(atsBoards),
    db.select({ count: count() }).from(vacancies).where(eq(vacancies.status, 'new')),
    getPgBossMetrics(),
    getAtsRegistryMetrics(),
  ]);

  const totalUsers = totalUsersRes[0]?.count ?? 0;
  const totalBoards = totalBoardsRes[0]?.count ?? 0;
  const totalVacancies = totalVacanciesRes[0]?.count ?? 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <header>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 600, marginBottom: '0.5rem' }}>B2B Backoffice Dashboard</h1>
        <p style={{ color: 'var(--text-2)' }}>Market demand and Talent Pool intelligence.</p>
      </header>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
        <div className="card" style={{ padding: '1.5rem', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
          <h3 style={{ fontSize: '0.875rem', color: 'var(--text-3)', marginBottom: '0.5rem' }}>Talent Pool (Users)</h3>
          <div style={{ fontSize: '2rem', fontWeight: 700 }}>{totalUsers}</div>
        </div>
        <div className="card" style={{ padding: '1.5rem', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
          <h3 style={{ fontSize: '0.875rem', color: 'var(--text-3)', marginBottom: '0.5rem' }}>Active Companies (Boards)</h3>
          <div style={{ fontSize: '2rem', fontWeight: 700 }}>{totalBoards}</div>
        </div>
        <div className="card" style={{ padding: '1.5rem', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
          <h3 style={{ fontSize: '0.875rem', color: 'var(--text-3)', marginBottom: '0.5rem' }}>Indexed Vacancies</h3>
          <div style={{ fontSize: '2rem', fontWeight: 700 }}>{totalVacancies}</div>
        </div>
      </section>

      <section style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.5rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>System Health (pg-boss)</h2>
        {queueState ? (
          <pre style={{ background: 'var(--bg-3)', padding: '1rem', borderRadius: 'var(--radius-sm)', overflowX: 'auto', fontSize: '0.875rem', color: 'var(--text-2)' }}>
            {JSON.stringify(queueState, null, 2)}
          </pre>
        ) : (
          <p style={{ color: '#e57373', fontSize: '0.875rem' }}>Could not load pg-boss metrics. Make sure database is reachable.</p>
        )}
      </section>

      <section style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '1.5rem', opacity: 0.7 }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>Coming soon: Talent & Demand Matchmaking</h2>
        <p style={{ color: 'var(--text-2)', fontSize: '0.875rem' }}>
          This section will soon allow querying overlapping skills between the {totalUsers} registered users and the {totalVacancies} indexed jobs to surface perfect B2B candidate shortlists.
        </p>
      </section>
    </div>
  );
}

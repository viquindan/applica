import { loadEnvLocal } from '../src/lib/loadEnvLocal';
loadEnvLocal();
async function main() {
  const { db } = await import('../src/db/client');
  const { sql } = await import('drizzle-orm');

  // Failed apps on platforms we can't auto-apply: reset to pending_review and
  // drop the failed submission so the user can mark them applied / apply manually.
  const failed = (await db.execute(sql`
    SELECT a.id FROM applications a JOIN vacancies v ON v.id = a.vacancy_id
    WHERE a.status = 'failed' AND v.platform NOT IN ('greenhouse','lever','ashby')
  `)).rows as any[];

  for (const a of failed) {
    await db.execute(sql`DELETE FROM application_submissions WHERE application_id = ${a.id}`);
    await db.execute(sql`UPDATE applications SET status = 'pending_review', updated_at = now() WHERE id = ${a.id}`);
  }
  // Also reset the linked vacancies back to pending_review.
  await db.execute(sql`
    UPDATE vacancies SET status = 'pending_review'
    WHERE status = 'applying' AND platform NOT IN ('greenhouse','lever','ashby')
  `);
  console.log(`Reset ${failed.length} failed application(s) on manual platforms to pending_review.`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });

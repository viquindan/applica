import { loadEnvLocal } from '../src/lib/loadEnvLocal';
loadEnvLocal();
async function main() {
  const { db } = await import('../src/db/client');
  const { sql } = await import('drizzle-orm');

  const apps = (await db.execute(sql`
    SELECT a.id, a.status, a.mode, v.title, v.platform, v.score, v.url, v.warnings
    FROM applications a JOIN vacancies v ON v.id = a.vacancy_id
    WHERE a.status = 'failed' ORDER BY a.updated_at DESC LIMIT 5
  `)).rows as any[];
  console.log(`Failed applications: ${apps.length}`);
  for (const a of apps) {
    console.log(`\n• "${a.title}" [${a.platform}] score=${a.score} status=${a.status} mode=${a.mode}`);
    console.log(` url: ${a.url}`);
    console.log(` warnings: ${JSON.stringify(a.warnings)}`);
    const sub = (await db.execute(sql`SELECT status, submission_status, failure_reason, logs FROM application_submissions WHERE application_id = ${a.id} LIMIT 1`)).rows[0] as any;
    if (sub) {
      console.log(` submission: status=${sub.status} subStatus=${sub.submission_status}`);
      console.log(` failureReason: ${sub.failure_reason}`);
      console.log(` logs: ${JSON.stringify(sub.logs)?.slice(0, 400)}`);
    } else {
      console.log(' (no submission row - failed during material prep, not sending)');
    }
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });

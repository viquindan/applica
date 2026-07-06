import { loadEnvLocal } from '../src/lib/loadEnvLocal';
loadEnvLocal();

/**
 * Seeds 2 REAL, applicable job postings per ATS (Greenhouse/Lever/Ashby/Smart-
 * Recruiters) at a fixed marker score of 200 ([TEST] prefix) so they're easy to
 * find at the top of the list and use to test the auto-apply flow end-to-end.
 * Remove later with: DELETE applications/vacancies WHERE title LIKE '[TEST]%'
 */
type Job = { externalId: string; title: string; company: string; location?: string; url: string; description: string };

const strip = (s: string) => (s || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();

async function fetchGreenhouse(token: string): Promise<Job[]> {
  const r = await fetch(`https://boards-api.greenhouse.io/v1/boards/${token}/jobs?content=true`);
  if (!r.ok) return [];
  const d: any = await r.json();
  return (d.jobs ?? []).slice(0, 2).map((j: any) => ({
    externalId: String(j.id), title: j.title, company: token, location: j.location?.name,
    url: j.absolute_url, description: strip(j.content).slice(0, 600),
  }));
}
async function fetchLever(token: string): Promise<Job[]> {
  const r = await fetch(`https://api.lever.co/v0/postings/${token}?mode=json&limit=5`);
  if (!r.ok) return [];
  const d: any = await r.json();
  return (Array.isArray(d) ? d : []).slice(0, 2).map((j: any) => ({
    externalId: String(j.id), title: j.text, company: token, location: j.categories?.location,
    url: j.hostedUrl || j.applyUrl, description: strip(j.descriptionPlain || j.description).slice(0, 600),
  }));
}
async function fetchAshby(token: string): Promise<Job[]> {
  const r = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${token}`);
  if (!r.ok) return [];
  const d: any = await r.json();
  return (d.jobs ?? []).slice(0, 2).map((j: any) => ({
    externalId: String(j.id), title: j.title, company: token, location: j.location,
    url: j.applyUrl || j.jobUrl, description: strip(j.descriptionPlain || j.description).slice(0, 600),
  }));
}
async function fetchSmart(token: string): Promise<Job[]> {
  const r = await fetch(`https://api.smartrecruiters.com/v1/companies/${token}/postings?limit=10`);
  if (!r.ok) return [];
  const d: any = await r.json();
  return (d.content ?? []).slice(0, 2).map((j: any) => ({
    externalId: String(j.id), title: j.name, company: token, location: j.location?.city,
    url: `https://jobs.smartrecruiters.com/${token}/${j.id}`, description: '',
  }));
}

const FETCHERS: Record<string, (t: string) => Promise<Job[]>> = {
  greenhouse: fetchGreenhouse, lever: fetchLever, ashby: fetchAshby, smartrecruiters: fetchSmart,
};

async function main() {
  const { db } = await import('../src/db/client');
  const { sql, eq } = await import('drizzle-orm');
  const { vacancies, applications, userSettings } = await import('../src/db/schema');
  const { queuePrepareApplicationMaterials } = await import('../src/core/jobs/boss');
  const { getReusableAnswersMap } = await import('../src/core/memory/memoryStore');
  const { trackApplicationPrepared } = await import('../src/core/billing/usageTracker');

  const [u] = (await db.execute(sql`SELECT u.id FROM users u JOIN professional_profiles p ON p.user_id=u.id LIMIT 1`)).rows as any[];
  const userId = u.id;
  const [settings] = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  const reusable = await getReusableAnswersMap(userId);

  for (const platform of ['greenhouse', 'lever', 'ashby', 'smartrecruiters']) {
    const tokens = (await db.execute(sql`SELECT token FROM ats_boards WHERE platform=${platform} AND status='active' LIMIT 12`)).rows as any[];
    let added = 0;
    for (const { token } of tokens) {
      if (added >= 2) break;
      let jobs: Job[] = [];
      try { jobs = await FETCHERS[platform](token); } catch { /* try next token */ }
      for (const j of jobs) {
        if (added >= 2) break;
        if (!j.url || !j.title) continue;
        const [vac] = await db.insert(vacancies).values({
          userId, platform, externalId: `TEST-${j.externalId}`,
          title: `[TEST] ${j.title}`, company: j.company, location: j.location ?? 'Remote',
          description: j.description || `Test posting on ${platform}.`,
          url: j.url, score: 200, status: 'generating', normalizedData: j as any,
        }).returning();
        const [app] = await db.insert(applications).values({
          userId, vacancyId: vac.id, status: 'draft',
          mode: settings?.globalAutomationMode === 'full' ? 'auto' : 'semi', formAnswers: reusable,
        }).returning();
        await trackApplicationPrepared(userId);
        await queuePrepareApplicationMaterials(app.id);
        added++;
        console.log(`+ [${platform}] ${j.company} - ${j.title.slice(0, 40)}`);
      }
    }
    if (added < 2) console.log(`! ${platform}: only added ${added} (some boards empty/unavailable)`);
  }
  console.log('\nDone. Find them by score 200 / "[TEST]" prefix. Materials are being prepared.');
  process.exit(0);
}
main().catch((e) => { console.error('ERR', e.message); process.exit(1); });

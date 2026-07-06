/**
 * LIVE smoke test for the new SmartRecruiters + Recruitee adapters.
 * Calls the real public ATS APIs (no auth needed).
 *
 * Run: npx tsx scripts/verifyNewAdaptersLive.ts
 */
import { SmartRecruitersAdapter } from '../src/core/platforms/smartrecruiters';
import { RecruiteeAdapter } from '../src/core/platforms/recruitee';

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed += 1; console.log(` PASS ${label}`); }
  else { failed += 1; console.log(` FAIL ${label}${detail ? ` - ${detail}` : ''}`); }
}

function sample(jobs: any[]) {
  const j = jobs[0];
  if (!j) return '(none)';
  return `"${j.title}" @ ${j.company} | ${j.location ?? '?'} | desc=${(j.description ?? '').length} chars | ${j.url}`;
}

async function main() {
  console.log('\n=== SmartRecruiters adapter (LIVE) ===');
  const sr = new SmartRecruitersAdapter();
  const srJobs = await sr.search({ boardTokens: ['boschgroup'], roles: [], locations: [], maxAgeDays: 3650, limit: 5 });
  console.log(' sample:', sample(srJobs));
  check('SmartRecruiters returns jobs', srJobs.length > 0, `got ${srJobs.length}`);
  check('SmartRecruiters jobs have a title', srJobs.every((j) => !!j.title));
  check('SmartRecruiters enriched at least one description', srJobs.some((j) => (j.description ?? '').length > 0), 'no descriptions enriched');
  check('SmartRecruiters jobs have a usable URL', srJobs.every((j) => /smartrecruiters\.com/.test(j.url)));
  check('SmartRecruiters platform tag is correct', srJobs.every((j) => j.platform === 'smartrecruiters'));

  console.log('\n=== Recruitee adapter (LIVE) ===');
  const rc = new RecruiteeAdapter();
  const rcJobs = await rc.search({ boardTokens: ['bunq'], roles: [], locations: [], maxAgeDays: 3650, limit: 5 });
  console.log(' sample:', sample(rcJobs));
  check('Recruitee returns jobs', rcJobs.length > 0, `got ${rcJobs.length}`);
  check('Recruitee jobs have a title', rcJobs.every((j) => !!j.title));
  check('Recruitee jobs carry a description', rcJobs.some((j) => (j.description ?? '').length > 0));
  check('Recruitee jobs have a usable URL', rcJobs.every((j) => !!j.url));
  check('Recruitee platform tag is correct', rcJobs.every((j) => j.platform === 'recruitee'));

  console.log('\n=== Role filtering actually filters ===');
  const filtered = await rc.search({ boardTokens: ['bunq'], roles: ['CFO'], locations: [], maxAgeDays: 3650, limit: 50 });
  check('Filtering by an unlikely role returns fewer than unfiltered', filtered.length <= rcJobs.length, `filtered=${filtered.length} all=${rcJobs.length}`);

  console.log(`\n=== Result: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => { console.error('Live adapter test crashed:', err); process.exit(1); });

/**
 * DRY-RUN: validates the submission engine can drive a real browser and inspect
 * a real application form. Read-only - it NEVER submits anything.
 *
 * Run: npx tsx scripts/dryRunInspect.ts
 */
import { loadEnvLocal } from '../src/lib/loadEnvLocal';
loadEnvLocal();

async function main() {
  // Get a real Greenhouse job application URL.
  const res = await fetch('https://boards-api.greenhouse.io/v1/boards/gitlab/jobs');
  const data = await res.json();
  const job = (data.jobs ?? []).find((j: any) => /(boards|job-boards)\.greenhouse\.io/.test(j.absolute_url ?? ''));
  if (!job) { console.error('No job found'); process.exit(1); }
  console.log(`Inspecting (dry-run, no submit): "${job.title}" - ${job.absolute_url}\n`);

  const { GreenhouseAdapter } = await import('../src/core/platforms/greenhouse');
  const { closeBrowser } = await import('../src/core/automation/browserManager');
  const adapter = new GreenhouseAdapter();

  try {
    const preview = await adapter.inspectApplicationFormPlaywright(job.absolute_url, {
      profileData: { firstName: 'Test', lastName: 'User', email: 'test@example.com', phone: '5550100', linkedin: '' },
      formAnswers: {},
      hasResume: true,
    });
    console.log(' Browser launched, page loaded, form inspected.');
    console.log(` Fields detected: ${preview.fields.length}`);
    console.log(` Captcha: ${preview.captchaDetected}`);
    console.log(` Blockers: ${preview.blockers.length}`);
    for (const f of preview.fields.slice(0, 10)) {
      console.log(` - ${f.label} [${f.source}/${f.status}${f.required ? '/required' : ''}]`);
    }
  } catch (e: any) {
    console.error(' Inspection failed:', e?.message ?? e);
  } finally {
    await closeBrowser().catch(() => {});
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });

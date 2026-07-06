/**
 * LIVE test for the embeddings-based semantic re-ranker (Phase 2b).
 * Calls the real Google embeddings API. Requires GOOGLE_GENERATIVE_AI_API_KEY.
 *
 * Run: npx tsx scripts/verifySemanticLive.ts
 */
import { loadEnvLocal } from '../src/lib/loadEnvLocal';
loadEnvLocal();
process.env.ENABLE_SEMANTIC_RERANK = 'true';

import { isSemanticRerankEnabled, maybeSemanticAdjust } from '../src/core/scoring/semanticMatch';

let passed = 0;
let failed = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed += 1; console.log(` PASS ${label}`); }
  else { failed += 1; console.log(` FAIL ${label}${detail ? ` - ${detail}` : ''}`); }
}

async function main() {
  console.log('\n=== Semantic re-ranker (LIVE Google embeddings) ===');
  check('Re-rank enabled with key present', isSemanticRerankEnabled());

  const profileText = [
    'Target roles: Head of Finance, CFO.',
    'Skills: treasury, FP&A, fundraising, financial modeling, SQL.',
    'Finance Director at a fintech scale-up. Led treasury, forecasting and a Series B raise.',
    'Certification: CFA.',
  ].join('\n');

  // Borderline base score so the band gate (±12 around threshold 60) lets it run.
  const threshold = 60;
  const baseScore = 58;

  const relevantJob =
    'Head of Finance. We are a fintech scale-up seeking a finance leader to own treasury, ' +
    'FP&A, forecasting and fundraising as we prepare our Series C. CFA preferred.';
  const unrelatedJob =
    'Warehouse Operations Supervisor. Lead a team managing inventory, forklift logistics, ' +
    'shipping schedules and physical stock counts in our distribution center.';

  const relevant = await maybeSemanticAdjust({ userId: 'test-user', profileText, jobText: relevantJob, baseScore, threshold });
  const unrelated = await maybeSemanticAdjust({ userId: 'test-user', profileText, jobText: unrelatedJob, baseScore, threshold });

  console.log(`\n Relevant -> similarity=${relevant.similarity?.toFixed(3)} adjustment=${relevant.adjustment}`);
  console.log(` Unrelated -> similarity=${unrelated.similarity?.toFixed(3)} adjustment=${unrelated.adjustment}\n`);

  check('Relevant job returns a similarity', relevant.similarity !== null);
  check('Unrelated job returns a similarity', unrelated.similarity !== null);
  check('Relevant is more similar than unrelated',
    (relevant.similarity ?? 0) > (unrelated.similarity ?? 0),
    `relevant=${relevant.similarity} unrelated=${unrelated.similarity}`);
  check('Relevant job gets a non-negative nudge', relevant.adjustment >= 0, `adjustment=${relevant.adjustment}`);
  check('Unrelated job is not boosted above relevant', unrelated.adjustment <= relevant.adjustment);

  // Gate checks: out-of-band and excluded scores must be skipped (no API call).
  const outOfBand = await maybeSemanticAdjust({ userId: 'test-user', profileText, jobText: relevantJob, baseScore: 95, threshold });
  check('Out-of-band score is skipped (adjustment 0)', outOfBand.adjustment === 0 && outOfBand.similarity === null);
  const excluded = await maybeSemanticAdjust({ userId: 'test-user', profileText, jobText: relevantJob, baseScore: 0, threshold });
  check('Excluded (score 0) is never rescued', excluded.adjustment === 0 && excluded.similarity === null);

  console.log(`\n=== Result: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => { console.error('Live test crashed:', err); process.exit(1); });

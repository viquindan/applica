/**
 * LIVE test for the aggressive ATS discovery (Phase 3.5). Hits real search
 * engines (DuckDuckGo + Bing) and counts how many distinct company board tokens
 * we extract per platform - WITHOUT touching the database.
 *
 * Run: npx tsx scripts/verifyDiscoveryLive.ts
 */
import { loadEnvLocal } from '../src/lib/loadEnvLocal';
loadEnvLocal();

async function main() {
  // Dynamic import so loadEnvLocal runs before db/client initializes.
  const { collectBoardTokensFromWeb } = await import('../src/core/platforms/atsAutoDiscovery');

  // A representative cross-platform query set (what a run would draw from).
  const queries = [
    '"boards.greenhouse.io" remote',
    '"jobs.lever.co" startup',
    '"jobs.ashbyhq.com" hiring',
    '"jobs.smartrecruiters.com" careers',
    '"recruitee.com" jobs',
    '"boards.greenhouse.io" Latam',
  ];

  console.log(`\nRunning ${queries.length} discovery queries across DuckDuckGo + Bing (2 pages each)...\n`);
  const { total, byPlatform, htmlLength } = await collectBoardTokensFromWeb(queries);

  console.log(`Fetched ~${(htmlLength / 1000).toFixed(0)}KB of result HTML.`);
  console.log(`Distinct board tokens found: ${total}\n`);

  const platforms = Object.keys(byPlatform).sort();
  for (const platform of platforms) {
    const tokens = [...byPlatform[platform]];
    console.log(` ${platform.padEnd(16)} ${tokens.length} tokens e.g. ${tokens.slice(0, 8).join(', ')}`);
  }

  const distinctPlatforms = platforms.length;
  console.log('\n=== Assessment ===');
  console.log(total > 0 ? ' PASS Discovery extracts real company tokens from the open web' : ' FAIL No tokens found');
  console.log(distinctPlatforms >= 2 ? ` PASS Tokens span ${distinctPlatforms} platforms` : ' WARN Tokens from a single platform only');
  console.log('');
  process.exit(total > 0 ? 0 : 1);
}

main().catch((err) => { console.error('Discovery live test crashed:', err); process.exit(1); });

import { loadEnvLocal } from '../src/lib/loadEnvLocal';
loadEnvLocal();

async function main() {
  const { db } = await import('../src/db/client');
  const { professionalProfiles } = await import('../src/db/schema');
  const { refreshJobCache, isJobCacheFresh, gatherSearchCandidates, jobCacheSize } = await import('../src/core/platforms/jobCache');

  console.log('Refreshing shared job cache (one central fetch of all boards)...');
  const t0 = Date.now();
  const result = await refreshJobCache();
  console.log(` cached ${result.total} jobs in ${((Date.now() - t0) / 1000).toFixed(1)}s`, result.byPlatform);
  console.log(' cache fresh:', isJobCacheFresh(), '| size:', jobCacheSize());

  const [profile] = await db.select().from(professionalProfiles).limit(1);

  // Simulate two users scoring against the SAME cache - should be fast (local).
  for (let i = 1; i <= 2; i++) {
    const t = Date.now();
    const candidates = await gatherSearchCandidates({
      roles: profile.targetRoles ?? [],
      locations: profile.targetCountries ?? [],
      maxAgeDays: 30,
      limit: 200,
      smartRecruitersTokens: [],
    });
    console.log(` user#${i}: matched ${candidates.length} candidates from cache in ${Date.now() - t}ms (no board refetch)`);
  }

  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });

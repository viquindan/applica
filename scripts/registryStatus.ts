import { loadEnvLocal } from '../src/lib/loadEnvLocal';
loadEnvLocal();

async function main() {
  const { getActiveBoardCount, getAtsRegistryMetrics } = await import('../src/core/platforms/atsRegistry');
  const platforms = ['greenhouse', 'lever', 'ashby', 'smartrecruiters', 'recruitee'];
  let total = 0;
  console.log('\nActive boards in registry by platform:');
  for (const p of platforms) {
    const c = await getActiveBoardCount(p);
    total += c;
    console.log(` ${p.padEnd(16)} ${c}`);
  }
  console.log(` ${'TOTAL'.padEnd(16)} ${total}`);
  console.log('\nOverall metrics:', await getAtsRegistryMetrics());
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });

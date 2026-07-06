/**
 * LIVE test of the LinkedIn scraper with description enrichment.
 * Gentle single run. Run: npx tsx scripts/testLinkedinScraper.ts
 */
import { scrapeLinkedInRemoteLatAm } from '../src/core/automation/linkedinScraper';

async function main() {
  const jobs = await scrapeLinkedInRemoteLatAm({
    roles: ['Head of Sales', 'Regional Director'],
    locations: ['Mexico'],
  });

  console.log(`\nGot ${jobs.length} jobs.\n`);
  const withDesc = jobs.filter((j) => j.description && !j.description.includes('Stealth Scraper'));
  console.log(`With REAL description: ${withDesc.length}/${jobs.length}\n`);
  for (const j of jobs.slice(0, 5)) {
    const real = j.description && !j.description.includes('Stealth Scraper');
    console.log(`• "${j.title}" @ ${j.company} | ${j.location}`);
    console.log(` desc: ${real ? `${j.description.length} chars - ${j.description.slice(0, 120)}…` : '(placeholder only)'}`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });

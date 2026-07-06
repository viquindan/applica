// Ad-hoc check of urlLiveness against real URLs. Usage: npx tsx scripts/_liveness.ts [url...]
import { checkVacancyUrlGone } from '../src/core/automation/urlLiveness';

const urls = process.argv.slice(2).length ? process.argv.slice(2) : [
  'https://boards.greenhouse.io/6sense/jobs/6605149?gh_jid=6605149', // dead (Texas BDR)
  'https://boards.greenhouse.io/6sense/jobs/7997213?gh_jid=7997213', // live (NYC BDR)
  'https://jobs.lever.co/dlocal', // live board
];

(async () => {
  for (const u of urls) {
    const r = await checkVacancyUrlGone(u);
    console.log(r.gone ? 'GONE ' : 'ALIVE', JSON.stringify(r), '<-', u);
  }
})();

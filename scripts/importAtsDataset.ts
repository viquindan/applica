/**
 * Bulk ATS registry importer.
 *
 * Validates a large candidate list of company tokens directly against each ATS
 * public API (which has no anti-bot), then inserts the live ones into the
 * `atsBoards` registry. This is the reliable way to grow company coverage when
 * no global directory exists and search-engine discovery is rate-limited.
 *
 * Run: npx tsx scripts/importAtsDataset.ts
 */
import { loadEnvLocal } from '../src/lib/loadEnvLocal';
loadEnvLocal();

type Platform = 'greenhouse' | 'lever' | 'ashby' | 'smartrecruiters' | 'recruitee';

const CANDIDATES: Record<Platform, string[]> = {
  greenhouse: [
    'stripe', 'affirm', 'brex', 'gusto', 'datadog', 'figma', 'airtable', 'asana', 'mongodb',
    'cloudflare', 'robinhood', 'reddit', 'duolingo', 'samsara', 'twilio', 'airbnb', 'dropbox',
    'lyft', 'doordash', 'instacart', 'coinbase', 'databricks', 'gitlab', 'discord', 'pinterest',
    'sofi', 'chime', 'webflow', 'vercel', 'mixpanel', 'amplitude', 'faire', 'scaleai', 'calm',
    'flexport', 'gemini', 'benchling', 'plaid', 'hashicorp', 'retool', 'segment', 'opensea',
    'betterup', 'ro', 'getro', 'whoop', 'patreon', 'thumbtack', 'cruise', 'nuro', 'rappi',
    'nubank', 'mercadolibre', 'wise', 'gopuffhq', 'celonis', 'gohighlevel', 'pricefx',
    'cohereinc', 'anthropic', 'openai', 'huggingfaceinc', 'snyk', 'gitpod', 'monzo', 'starling',
    'deliveroo', 'bolt', 'wayve', 'checkout', 'gocardless', 'paddle', 'truelayer', 'pleo',
    'remote', 'deelinc', 'mural', 'loom', 'miro', 'pomelo', 'kueski',
  ],
  lever: [
    'kushki', 'kavak', 'cornershop', 'platanus', 'uala', 'vtex', 'xepelin', 'clip', 'creditas',
    'truora', 'fintual', 'houm', 'valoreo', 'belvo', 'frubana', 'palantir', 'spotify', 'mistral',
    'gopuff', 'netflix', 'plaid', 'attentive', 'verkada', 'getaround', 'box', 'yelp', 'fivetran',
    'cohesity', 'gitlab', 'mercadolibre', 'nubank', 'rappi', 'addi', 'nuvocargo', 'jeeves',
    'clara', 'mendel', 'tul', 'kovi', 'merama', 'leadsales', 'kushki',
  ],
  ashby: [
    'deel', 'ontop', 'mural', 'ycombinator', 'carta', 'notion', 'airtable', 'canva', 'brex',
    'ramp', 'rippling', 'linear', 'replit', 'runway', 'watershed', 'posthog', 'cohere', 'middesk',
    'mercury', 'openstore', 'modernhealth', 'gem', 'tecton', 'baseten', 'clipboardhealth',
    'vanta', 'sardine', 'render', 'supabase', 'neon', 'turing', 'instabase', 'flock', 'levels',
    'pinecone', 'weaviate', 'modal', 'together', 'perplexityai', 'harvey', 'sierra',
  ],
  smartrecruiters: [
    'visa', 'boschgroup', 'lvmh', 'wabtec', 'experian', 'square', 'ikea', 'mcdonalds', 'marriott',
    'equinix', 'skechers', 'foundever', 'concentrix', 'globant', 'telefonica', 'ubisoft', 'avis',
    'bbc', 'wpp', 'publicisgroupe', 'sephora', 'nestleoperationalservicesworldwide', 'kraftheinz',
    'sap', 'bayer', 'allianz', 'siemens', 'vodafone', 'adecco', 'randstad',
  ],
  recruitee: [
    'bunq', 'channable', 'sympower', 'personio', 'matera', 'mews', 'backbase', 'catawiki',
    'aircall', 'spendesk', 'alan', 'payfit', 'sorare', 'ankorstore', 'pennylane', 'lydia',
    'swile', 'qonto', 'dawnbreaker', 'studocu', 'framer', 'bitvavo', 'castor', 'luminovo',
    'tradler', 'otrium', 'tellow', 'homerun', 'recruitee',
  ],
};

function validatorUrl(platform: Platform, token: string): string {
  switch (platform) {
    case 'greenhouse': return `https://boards-api.greenhouse.io/v1/boards/${token}/jobs`;
    case 'lever': return `https://api.lever.co/v0/postings/${token}?mode=json`;
    case 'ashby': return `https://api.ashbyhq.com/posting-api/job-board/${token}`;
    case 'smartrecruiters': return `https://api.smartrecruiters.com/v1/companies/${token}/postings?limit=1`;
    case 'recruitee': return `https://${token}.recruitee.com/api/offers/`;
  }
}

function jobCount(platform: Platform, payload: any): number {
  if (platform === 'greenhouse') return Array.isArray(payload.jobs) ? payload.jobs.length : 0;
  if (platform === 'lever') return Array.isArray(payload) ? payload.length : 0;
  if (platform === 'ashby') return Array.isArray(payload.jobs) ? payload.jobs.length : 0;
  if (platform === 'smartrecruiters') return payload.totalFound ?? (Array.isArray(payload.content) ? payload.content.length : 0);
  if (platform === 'recruitee') return Array.isArray(payload.offers) ? payload.offers.length : 0;
  return 0;
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, fn: (i: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let idx = 0;
  const worker = async () => {
    while (idx < items.length) {
      const i = idx++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return out;
}

async function validate(platform: Platform, token: string): Promise<{ token: string; jobs: number } | null> {
  try {
    const r = await fetch(validatorUrl(platform, token), { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (r.status !== 200) return null;
    const jobs = jobCount(platform, await r.json());
    return jobs > 0 ? { token, jobs } : null;
  } catch {
    return null;
  }
}

async function main() {
  const { seedAtsBoards } = await import('../src/core/platforms/atsRegistry');
  const platforms = Object.keys(CANDIDATES) as Platform[];
  let grandTotal = 0;

  for (const platform of platforms) {
    const candidates = [...new Set(CANDIDATES[platform])];
    const results = await mapWithConcurrency(candidates, 15, (t) => validate(platform, t));
    const winners = results.filter((w): w is { token: string; jobs: number } => w !== null);
    winners.sort((a, b) => b.jobs - a.jobs);

    if (winners.length > 0) {
      await seedAtsBoards(winners.map((w) => ({ token: w.token, source: 'dataset' })), platform);
    }
    grandTotal += winners.length;
    const totalJobs = winners.reduce((s, w) => s + w.jobs, 0);
    console.log(`\n[${platform}] ${winners.length}/${candidates.length} valid, ~${totalJobs} jobs`);
    console.log(' ' + winners.map((w) => `${w.token}(${w.jobs})`).join(', '));
  }

  console.log(`\n=== Imported ${grandTotal} verified companies into the registry ===`);
  process.exit(0);
}

main().catch((e) => { console.error('Import failed:', e); process.exit(1); });

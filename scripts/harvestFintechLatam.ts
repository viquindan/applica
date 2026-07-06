/**
 * Targeted harvest of fintech / LATAM / Spain companies. Each candidate name is
 * probed against ALL five ATS APIs (we don't know which ATS a company uses), and
 * every live hit is inserted into the registry under the right platform.
 *
 * Run: npx tsx scripts/harvestFintechLatam.ts
 */
import { loadEnvLocal } from '../src/lib/loadEnvLocal';
loadEnvLocal();

type Platform = 'greenhouse' | 'lever' | 'ashby' | 'smartrecruiters' | 'recruitee';

// Fintech / LATAM / Spain-focused candidates (lowercased board tokens).
const CANDIDATES = [
  'nubank', 'mercadolibre', 'mercadopago', 'rappi', 'dlocal', 'ebanx', 'clip', 'konfio',
  'stori', 'jeeves', 'clara', 'addi', 'bitso', 'ripio', 'pomelo', 'kueski', 'uala', 'uala',
  'creditas', 'belvo', 'xepelin', 'kushki', 'kavak', 'truora', 'fintual', 'nuvocargo',
  'mendel', 'tul', 'kovi', 'merama', 'wise', 'remitly', 'plata', 'lulobank', 'nequi',
  'tpaga', 'minka', 'palenca', 'yuno', 'simetrik', 'habi', 'lapieza', 'runa', 'fairplay',
  'klar', 'baubap', 'finkargo', 'kapital', 'r2', 'mozper', 'frubana', 'cobre', 'moni',
  // Spain / EU fintech
  'bnext', 'fintonic', 'ebury', 'bitpanda', 'paysera', 'sumup', 'tide', 'revolut', 'n26',
  'qonto', 'lydia', 'pennylane', 'spendesk', 'payfit', 'swile', 'bunq', 'mollie', 'gocardless',
  'truelayer', 'pleo', 'wagestream', 'curve', 'zilch', 'soldo',
  // Broader LatAm tech / ecommerce / logistics / health / SaaS
  'globant', 'mercadolibre', 'despegar', 'platzi', 'hotmart', 'loft', 'quintoandar',
  'gympass', 'wildlifestudios', 'vtex', 'olist', 'madeiramadeira', 'ifood', 'loggi',
  'gupy', 'pismo', 'dock', 'cloudwalk', 'recargapay', 'picpay', 'bancointer', 'omie',
  'contaazul', 'rdstation', 'takeblip', 'sympla', 'idwall', 'unico', 'clearsale',
  'justos', 'neon', 'c6bank', 'quintoandar', 'cargox', 'merqueo', 'chiper', 'laika',
  'mensajerosurbanos', 'rappi', 'justo', 'ben', 'gbm', 'clara', 'konfio',
  // Spain
  'cabify', 'glovo', 'travelperk', 'factorialhr', 'redpoints', 'typeform', 'holaluz',
  'fever', 'wallapop', 'idealista', 'seedtag', 'capchase', 'lingokids', 'exoticca',
  'jobandtalent', 'paack', 'cobeehq', 'genially', 'landbot', 'jobandtalent', 'bipi',
];

function url(p: Platform, t: string): string {
  switch (p) {
    case 'greenhouse': return `https://boards-api.greenhouse.io/v1/boards/${t}/jobs`;
    case 'lever': return `https://api.lever.co/v0/postings/${t}?mode=json`;
    case 'ashby': return `https://api.ashbyhq.com/posting-api/job-board/${t}`;
    case 'smartrecruiters': return `https://api.smartrecruiters.com/v1/companies/${t}/postings?limit=1`;
    case 'recruitee': return `https://${t}.recruitee.com/api/offers/`;
  }
}
function count(p: Platform, j: any): number {
  if (p === 'greenhouse') return Array.isArray(j.jobs) ? j.jobs.length : 0;
  if (p === 'lever') return Array.isArray(j) ? j.length : 0;
  if (p === 'ashby') return Array.isArray(j.jobs) ? j.jobs.length : 0;
  if (p === 'smartrecruiters') return j.totalFound ?? 0;
  if (p === 'recruitee') return Array.isArray(j.offers) ? j.offers.length : 0;
  return 0;
}

const PLATFORMS: Platform[] = ['greenhouse', 'lever', 'ashby', 'smartrecruiters', 'recruitee'];

async function probe(p: Platform, t: string): Promise<number> {
  try {
    const r = await fetch(url(p, t), { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (r.status !== 200) return 0;
    return count(p, await r.json());
  } catch { return 0; }
}

async function mapConc<T, R>(items: T[], n: number, fn: (i: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []; let idx = 0;
  const w = async () => { while (idx < items.length) { const i = idx++; out[i] = await fn(items[i]); } };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, w));
  return out;
}

async function main() {
  const { seedAtsBoards } = await import('../src/core/platforms/atsRegistry');
  const candidates = [...new Set(CANDIDATES)];

  const hits = await mapConc(candidates, 12, async (token) => {
    const found: Array<{ platform: Platform; token: string; jobs: number }> = [];
    for (const p of PLATFORMS) {
      const jobs = await probe(p, token);
      if (jobs > 0) found.push({ platform: p, token, jobs });
    }
    return found;
  });

  const flat = hits.flat();
  const byPlatform: Record<string, Array<{ token: string; jobs: number }>> = {};
  for (const h of flat) (byPlatform[h.platform] ??= []).push({ token: h.token, jobs: h.jobs });

  let inserted = 0;
  for (const platform of PLATFORMS) {
    const winners = (byPlatform[platform] ?? []).sort((a, b) => b.jobs - a.jobs);
    if (winners.length) {
      await seedAtsBoards(winners.map((w) => ({ token: w.token, source: 'fintech-latam' })), platform);
      inserted += winners.length;
      console.log(`\n[${platform}] ${winners.length} fintech/LATAM boards, ~${winners.reduce((s, w) => s + w.jobs, 0)} jobs`);
      console.log(' ' + winners.map((w) => `${w.token}(${w.jobs})`).join(', '));
    }
  }
  console.log(`\n=== Inserted ${inserted} fintech/LATAM boards into the registry ===`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });

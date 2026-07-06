import { extractAtsBoardTokens } from '../src/core/platforms/atsTokenPatterns';

const SOURCES = [
  'https://raw.githubusercontent.com/poteto/hiring-without-whiteboards/master/README.md',
];

async function main() {
  let text = '';
  for (const url of SOURCES) {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (r.ok) text += '\n' + (await r.text());
    console.log(`fetched ${url} -> ${r.status}`);
  }
  const tokens = extractAtsBoardTokens(text);
  const by: Record<string, Set<string>> = {};
  for (const t of tokens) (by[t.platform] ??= new Set()).add(t.token);
  console.log('Total distinct tokens:', tokens.length);
  for (const p of Object.keys(by).sort()) {
    console.log(` ${p.padEnd(16)} ${by[p].size} e.g. ${[...by[p]].slice(0, 12).join(', ')}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

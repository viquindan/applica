import { loadEnvLocal } from '../src/lib/loadEnvLocal';
loadEnvLocal();
async function main() {
  const { growRegistryFromCompanies } = await import('../src/core/platforms/atsRegistry');
  // Messy, LinkedIn-style names. Some have ATS boards, some don't.
  const names = [
    'Remote.com',
    'Deel Inc',
    'Mercado Libre S.A.',
    'Postman Inc',
    'Vercel Inc',
    'A Totally Made Up Company XYZ',
    'Modern Treasury',
    'Whatnot Inc',
  ];
  console.log('Probing companies ATS boards...');
  const r = await growRegistryFromCompanies(names);
  console.log(`Probed ${r.probed} new tokens, added ${r.added} live ATS board(s) to the registry.`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });

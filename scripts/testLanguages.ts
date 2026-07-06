import { loadEnvLocal } from '../src/lib/loadEnvLocal';
loadEnvLocal();

const CV = `Daniel Pérez
Senior Finance Leader

WORK EXPERIENCE
Finance Director - FintechCo (2018 - Present)
Led treasury and FP&A.

LANGUAGES
Spanish (Native), English (C2), French (B2), Portuguese (B1)`;

async function main() {
  const { extractProfileFromCv } = await import('../src/core/profile/extractProfileFromCv');
  const profile = await extractProfileFromCv(CV);
  console.log('Languages extracted:');
  console.log(JSON.stringify(profile.languages, null, 2));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });

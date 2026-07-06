import { geoPriority } from '../src/core/scoring/geography';

const HOME = 'Panama';
const TARGETS = ['Norteamérica', 'LATAM', 'Europa', 'Asia', 'África', 'Oceanía', 'Remoto Global'];

const SAMPLES = [
  'Panama City, Panama',
  'Remote - LATAM',
  'Remote - Latin America',
  'Bogota, Colombia',
  'Mexico City, Mexico',
  'Remote - Worldwide',
  'New York, NY',
  'San Francisco, CA, United States',
  'London, UK',
  'Berlin, Germany',
  'Remote - US only',
  'Bangalore, India',
];

console.log(`Home: ${HOME}\n`);
const ranked = SAMPLES
  .map((loc) => ({ loc, ...geoPriority(loc, HOME, TARGETS) }))
  .sort((a, b) => b.score - a.score);

console.log('Priority (high -> low):');
for (const r of ranked) {
  console.log(` ${String(r.score).padStart(2)} ${r.tier.padEnd(14)} ${r.loc}`);
}

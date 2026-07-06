/**
 * Phase 2a of relevance: a deterministic equivalence layer so token matching
 * stops missing obvious variants. We collapse every known alias of a concept to
 * a single canonical token BEFORE tokenization, so "k8s" and "kubernetes", or
 * "líder financiero" and "finance leader", land on the same term.
 *
 * Each group's first entry is the canonical phrase; the rest are aliases.
 * Spanish/English equivalences are intentionally included because the product
 * serves LatAm/Spain users applying to English-language postings.
 */
const SYNONYM_GROUPS: string[][] = [
  // ── Tech / infra ──
  ['kubernetes', 'k8s'],
  ['machine learning', 'ml'],
  ['artificial intelligence', 'ai'],
  ['google cloud', 'gcp', 'google cloud platform'],
  ['amazon web services', 'aws'],
  ['microsoft azure', 'azure'],
  ['javascript', 'js'],
  ['typescript', 'ts'],
  ['postgresql', 'postgres'],
  ['continuous integration', 'ci'],
  ['continuous delivery', 'cd'],
  ['infrastructure as code', 'iac'],

  // ── Finance / business ──
  ['financial planning and analysis', 'fpa', 'fp&a', 'fp and a'],
  ['mergers and acquisitions', 'm&a', 'mna', 'mergers acquisitions'],
  ['profit and loss', 'p&l', 'pnl'],
  ['key performance indicator', 'kpi', 'kpis'],
  ['business development', 'bizdev', 'biz dev', 'desarrollo de negocio'],
  ['go to market', 'gtm'],
  ['search engine optimization', 'seo'],
  ['customer relationship management', 'crm'],
  ['return on investment', 'roi'],

  // ── ES EN equivalences ──
  ['human resources', 'hr', 'recursos humanos', 'rrhh'],
  ['finance', 'finanzas'],
  ['finance leader', 'lider financiero', 'financial leader'],
  ['sales', 'ventas'],
  ['marketing', 'mercadeo'],
  ['operations', 'operaciones'],
  ['engineering', 'ingenieria'],
  ['accounting', 'contabilidad'],
  ['treasury', 'tesoreria'],
  ['growth', 'crecimiento'],
  ['fundraising', 'levantamiento de capital'],
];

function stripAccents(value: string): string {
  return value.normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

type Replacement = { pattern: RegExp; canonical: string };

// Precompute alias -> canonical-token replacements, longest alias first so we
// never replace a substring of a longer alias.
const REPLACEMENTS: Replacement[] = (() => {
  const entries: Array<{ alias: string; canonical: string }> = [];
  for (const group of SYNONYM_GROUPS) {
    const canonical = stripAccents(group[0]).toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const alias of group) {
      entries.push({ alias: stripAccents(alias).toLowerCase(), canonical });
    }
  }
  entries.sort((a, b) => b.alias.length - a.alias.length);
  return entries.map(({ alias, canonical }) => ({
    // Boundaries that also work around non-word chars like "&".
    pattern: new RegExp(`(?<![a-z0-9])${escapeRegExp(alias)}(?![a-z0-9])`, 'g'),
    canonical,
  }));
})();

/**
 * Rewrites text so every known alias becomes its canonical single token.
 * Accent-insensitive and case-insensitive. Safe to apply to any text before
 * tokenization.
 */
export function canonicalizeText(text: string): string {
  let result = stripAccents(text).toLowerCase();
  for (const { pattern, canonical } of REPLACEMENTS) {
    result = result.replace(pattern, canonical);
  }
  return result;
}

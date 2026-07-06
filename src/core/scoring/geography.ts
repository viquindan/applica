export type RemoteScope = 'global' | 'country_restricted' | 'regional' | 'unknown' | 'not_remote';

const COUNTRY_ALIASES: Record<string, string[]> = {
  'estados unidos': ['united states', 'usa', 'us', 'u.s.', 'u.s'],
  'united states': ['estados unidos', 'usa', 'us', 'u.s.', 'u.s'],
  'panama': ['panamá', 'panama'],
  'panamá': ['panama', 'panamá'],
  'colombia': ['colombia'],
  'mexico': ['méxico', 'mexico'],
  'méxico': ['mexico', 'méxico'],
  'canada': ['canada', 'canadá'],
  'canadá': ['canada', 'canadá'],
  'spain': ['spain', 'españa'],
  'españa': ['spain', 'españa'],
  'united kingdom': ['uk', 'united kingdom', 'reino unido', 'great britain'],
  'germany': ['germany', 'alemania', 'deutschland'],
  'france': ['france', 'francia'],
  'brazil': ['brazil', 'brasil'],
  'argentina': ['argentina'],
  'chile': ['chile'],
  'peru': ['peru', 'perú'],
  'india': ['india'],
  'australia': ['australia'],
  'ireland': ['ireland', 'irlanda'],
  'netherlands': ['netherlands', 'holanda', 'países bajos'],
  'portugal': ['portugal'],
  'italy': ['italy', 'italia'],
};

// Patterns that signal a specific country context in a location string
const COUNTRY_SIGNALS: Array<{ pattern: RegExp; country: string }> = [
  { pattern: /\b(united states|usa|\bus\b|u\.s\.?)\b/i, country: 'united states' },
  { pattern: /\b(canada|canadá)\b/i, country: 'canada' },
  { pattern: /\b(united kingdom|\buk\b|great britain)\b/i, country: 'united kingdom' },
  { pattern: /\b(germany|alemania|deutschland)\b/i, country: 'germany' },
  { pattern: /\b(france|francia)\b/i, country: 'france' },
  { pattern: /\b(spain|españa)\b/i, country: 'spain' },
  { pattern: /\b(india)\b/i, country: 'india' },
  { pattern: /\b(australia)\b/i, country: 'australia' },
  { pattern: /\b(ireland|irlanda)\b/i, country: 'ireland' },
  { pattern: /\b(brazil|brasil)\b/i, country: 'brazil' },
  { pattern: /\b(mexico|méxico)\b/i, country: 'mexico' },
  { pattern: /\b(colombia)\b/i, country: 'colombia' },
  { pattern: /\b(panama|panamá)\b/i, country: 'panama' },
  { pattern: /\b(argentina)\b/i, country: 'argentina' },
  { pattern: /\b(chile)\b/i, country: 'chile' },
  { pattern: /\b(peru|perú)\b/i, country: 'peru' },
  { pattern: /\b(netherlands|holanda)\b/i, country: 'netherlands' },
  { pattern: /\b(portugal)\b/i, country: 'portugal' },
  { pattern: /\b(italy|italia)\b/i, country: 'italy' },
  // US state abbreviations - strong signal the job is US-only
  { pattern: /\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY),?\s/i, country: 'united states' },
];

export function normalizeGeo(value?: string | null) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

// Region / continent targets (common in profiles, often in Spanish) mapped to
// their member countries + the textual signals that identify them in a location.
const REGIONS: Record<string, { signals: RegExp; countries: string[] }> = {
  latam: {
    signals: /(latam|latin america|america latina|sudamerica|south america|central america|caribbean)/,
    countries: ['mexico', 'brazil', 'argentina', 'colombia', 'chile', 'peru', 'panama', 'uruguay', 'ecuador', 'bolivia', 'paraguay', 'venezuela', 'guatemala', 'costa rica', 'dominican republic', 'honduras', 'nicaragua', 'el salvador'],
  },
  norteamerica: {
    signals: /(north america|norteamerica)/,
    countries: ['united states', 'canada', 'mexico'],
  },
  europa: {
    signals: /(europe|europa|emea|european union)/,
    countries: ['spain', 'germany', 'france', 'united kingdom', 'netherlands', 'portugal', 'italy', 'ireland', 'poland', 'sweden', 'switzerland', 'belgium', 'denmark', 'norway', 'finland', 'austria', 'romania'],
  },
  asia: {
    signals: /(asia|apac)/,
    countries: ['india', 'singapore', 'japan', 'china', 'indonesia', 'philippines', 'vietnam', 'thailand', 'malaysia', 'south korea'],
  },
  africa: {
    signals: /(africa|mena)/,
    countries: ['nigeria', 'south africa', 'kenya', 'egypt', 'morocco', 'ghana'],
  },
  oceania: {
    signals: /(oceania|australia|new zealand)/,
    countries: ['australia', 'new zealand'],
  },
};

// Targets that mean "I want truly global remote work" (any country is fine).
const GLOBAL_REMOTE_REQUESTS = ['remoto global', 'remote global', 'global', 'remoto', 'remote', 'worldwide', 'anywhere'];

function resolveRegionKey(normalizedRequested: string): keyof typeof REGIONS | undefined {
  if (/(latam|latin america|america latina|sudamerica|south america)/.test(normalizedRequested)) return 'latam';
  if (/(norteamerica|north america)/.test(normalizedRequested)) return 'norteamerica';
  if (/(europa|europe|emea)/.test(normalizedRequested)) return 'europa';
  if (/^asia$|apac/.test(normalizedRequested)) return 'asia';
  if (/africa|mena/.test(normalizedRequested)) return 'africa';
  if (/oceania/.test(normalizedRequested)) return 'oceania';
  return undefined;
}

export function matchesCountry(location: string, requestedCountry: string) {
  const normalizedLocation = normalizeGeo(location);
  const normalizedRequested = normalizeGeo(requestedCountry);
  if (!normalizedRequested) return true;

  // "Remoto Global" / "Remote" target: only truly-global remote jobs qualify.
  if (GLOBAL_REMOTE_REQUESTS.includes(normalizedRequested)) {
    return detectRemoteScope(location) === 'global';
  }

  // Region / continent target: match the region signal, a global-remote job, or
  // a job whose resolved country belongs to that region.
  const region = resolveRegionKey(normalizedRequested);
  if (region) {
    const { signals, countries } = REGIONS[region];
    if (signals.test(normalizedLocation)) return true;
    if (detectRemoteScope(location) === 'global') return true;
    const jobCountry = detectCountryFromLocation(location);
    if (jobCountry && countries.includes(jobCountry)) return true;
    return countries.some((c) => normalizedLocation.includes(c));
  }

  // Plain country target.
  if (normalizedLocation.includes(normalizedRequested)) return true;
  return COUNTRY_ALIASES[normalizedRequested]?.some((alias) => normalizedLocation.includes(normalizeGeo(alias))) ?? false;
}

/**
 * Detects whether a "Remote" job is truly global or restricted to a specific country/region.
 *
 * CRITICAL RULE: "Remote" without an explicit global qualifier (worldwide, anywhere, global)
 * is assumed to be country-restricted. This prevents showing "Remote - San Francisco, CA"
 * jobs to users in LATAM who cannot legally work in the US.
 */
export function detectRemoteScope(location?: string | null): RemoteScope {
  const normalized = normalizeGeo(location);

  if (!normalized.includes('remote')) return 'not_remote';

  // Explicit global signals - only these qualify as truly global. Tolerant of any
  // separator between "remote" and the qualifier ("Remote - Worldwide", "Remote, Global").
  if (/\b(worldwide|globally|global|anywhere|international)\b/i.test(normalized)) return 'global';

  // Explicit regional signals
  if (/(latam|latin america|americas|north america|central america|caribbean|emea|apac|europe|mena|asia)/i.test(normalized)) {
    return 'regional';
  }

  // Check for country signals in the location string
  const detectedCountry = detectCountryFromLocation(normalized);
  if (detectedCountry) return 'country_restricted';

  // If it's just "Remote" with no other context, assume country-restricted (conservative)
  // This is the safest default - truly global jobs almost always say so explicitly
  return 'country_restricted';
}

/**
 * Tries to identify which country a location string refers to.
 * Returns the country name or undefined.
 */
/** Which region a home country belongs to (e.g. Panama -> latam). */
export function homeRegionOf(country?: string | null): keyof typeof REGIONS | undefined {
  const c = normalizeGeo(country);
  if (!c) return undefined;
  for (const [region, { countries }] of Object.entries(REGIONS)) {
    if (countries.some((mc) => c.includes(mc) || mc.includes(c))) return region as keyof typeof REGIONS;
  }
  return undefined;
}

export type GeoTier = 'home' | 'region_remote' | 'region' | 'global_remote' | 'foreign' | 'none';

/**
 * Geographic priority of a job for a candidate, local-first. Local roles hire
 * local candidates, so they rank highest; foreign onsite (US/Europe) ranks last.
 * Returns a 0-15 score (usable directly as a location score) plus the tier.
 */
export function geoPriority(
  jobLocation: string | undefined | null,
  homeCountry?: string | null,
  targetCountries?: string[],
): { score: number; tier: GeoTier } {
  const loc = normalizeGeo(jobLocation);
  const scope = detectRemoteScope(jobLocation);
  const homeRegion = homeRegionOf(homeCountry);

  // 1. Local - job in the candidate's own country (best odds).
  if (homeCountry && matchesCountry(jobLocation ?? '', homeCountry)) return { score: 15, tier: 'home' };

  // 2. Remote role explicitly open to the candidate's region (e.g. "Remote - LATAM").
  if (homeRegion && scope === 'regional' && REGIONS[homeRegion].signals.test(loc)) return { score: 13, tier: 'region_remote' };

  // 3. Another country within the candidate's region (e.g. Panama -> Colombia/Mexico).
  if (homeRegion) {
    const jobCountry = detectCountryFromLocation(jobLocation);
    if (jobCountry && REGIONS[homeRegion].countries.includes(jobCountry)) return { score: 11, tier: 'region' };
  }

  // 4. Truly global remote - workable from anywhere.
  if (scope === 'global') return { score: 10, tier: 'global_remote' };

  // 5. Foreign, but inside the candidate's stated targets (US/Europe) - last.
  if (targetCountries?.some((c) => matchesCountry(jobLocation ?? '', c))) return { score: 4, tier: 'foreign' };

  return { score: 2, tier: 'none' };
}

export function detectCountryFromLocation(location?: string | null): string | undefined {
  const normalized = normalizeGeo(location);
  for (const { pattern, country } of COUNTRY_SIGNALS) {
    if (pattern.test(normalized)) return country;
  }
  return undefined;
}

/**
 * Which region a job location belongs to - broader than detectCountryFromLocation
 * because it also matches region signals (apac, emea…) and every member country in
 * REGIONS (so Singapore, Japan, etc. resolve even without a dedicated signal).
 */
export function detectRegionFromLocation(location?: string | null): keyof typeof REGIONS | undefined {
  const loc = normalizeGeo(location);
  if (!loc) return undefined;
  for (const [region, { signals, countries }] of Object.entries(REGIONS)) {
    if (signals.test(loc)) return region as keyof typeof REGIONS;
    if (countries.some((c) => loc.includes(c))) return region as keyof typeof REGIONS;
  }
  return undefined;
}

/**
 * Checks whether a job description contains explicit geographic restriction phrases.
 * Use this for a secondary check against the full description text.
 */
// Strong signals that a posting is effectively US-residents-only, even when it
// says "Remote". 401k, US state-law references, W-2, "Remote US", etc.
const US_ONLY_PATTERNS: RegExp[] = [
  /\b401\s*\(?k\)?\b/i,
  /\bw-?2\b/i,
  /\blaws?\s+of\s+the\s+state\s+of\b/i,
  /\b(california|texas|new york|florida|washington|colorado|illinois|massachusetts|new jersey)\s+(state\s+)?(law|labor|equal pay|pay transparency)/i,
  /\bremote\s*[---(,]?\s*(us|usa|u\.s\.?|united states)\b/i,
  /\b(us|usa|u\.s\.?|united states)[\s-]*(only|based|remote)\b/i,
  /\bmust\s+(reside|be\s+located|be\s+based|live|be\s+authorized)\s+(in\s+)?(the\s+)?(us|u\.s\.?|united states)\b/i,
  /\b(authorized|eligible|legally\s+authorized)\s+to\s+work\s+in\s+the\s+(us|u\.s\.?|united states)\b/i,
  /\bmust\s+be\s+a\s+(us|u\.s\.?)\s+(citizen|resident)\b/i,
];

/** True if the posting text is effectively restricted to US residents. */
export function detectUsOnlyEligibility(text?: string | null): boolean {
  const t = text ?? '';
  if (!t) return false;
  return US_ONLY_PATTERNS.some((pattern) => pattern.test(t));
}

/** Whether the candidate's home country is the United States. */
export function isUsHome(country?: string | null): boolean {
  return matchesCountry(country ?? '', 'united states');
}

export function hasExplicitGeoRestriction(text: string): boolean {
  const restrictionPatterns = [
    /must be (based|located|residing) in/i,
    /candidates must reside in/i,
    /eligible to work in/i,
    /authorized to work in/i,
    /work authorization.{0,30}(required|needed|must)/i,
    /this (role|position) is (only )?(open|available) (to|for)/i,
    /open only to (candidates|applicants) (in|from|based)/i,
    /must (have|hold|possess).{0,30}(work permit|visa|authorization)/i,
  ];
  return restrictionPatterns.some((pattern) => pattern.test(text));
}

export function inferModality(location?: string | null, explicit?: string | null) {
  const normalizedExplicit = normalizeGeo(explicit);
  const normalizedLocation = normalizeGeo(location);
  if (normalizedExplicit.includes('remote') || normalizedLocation.includes('remote')) return 'remote';
  if (normalizedExplicit.includes('hybrid') || normalizedLocation.includes('hybrid')) return 'hybrid';
  if (normalizedExplicit.includes('onsite') || normalizedExplicit.includes('on-site') || normalizedLocation.includes('onsite') || normalizedLocation.includes('on-site')) return 'onsite';
  return undefined;
}

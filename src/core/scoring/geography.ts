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

// Patterns that signal a specific country context in a location string.
// Split in two: full country names are safe to scan inside prose (description
// windows), while the US state-abbreviation pattern is NOT (case-insensitive
// "IN"/"OR"/"ME"/"HI" would match ordinary English words) and must only ever
// run against short location strings.
const COUNTRY_NAME_SIGNALS: Array<{ pattern: RegExp; country: string }> = [
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
];

// US state abbreviations - strong signal the job is US-only. Requires a
// trailing separator OR end-of-string - a location that's simply "City, ST"
// with nothing after the state code (very common on Greenhouse/Lever, e.g.
// the real "Raleigh, NC" that started this fix) previously needed a comma
// AND whitespace after the code, so it silently never matched.
const US_STATE_SIGNAL: { pattern: RegExp; country: string } = {
  pattern: /\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)(?:,?\s|$)/i,
  country: 'united states',
};

// Full US state names - the dominant ATS formatting is "San Jose, California"
// / "Bellevue, Washington", which the abbreviation pattern never matched, so
// detectCountryFromLocation returned undefined for most US onsite postings
// (real prod rows from the dev.peru.qa account reached the feed at 61-71 that
// way). Listed BEFORE the country names so "New Mexico" resolves to the US
// instead of the "mexico" substring. Location strings only - not window-safe.
const US_STATE_NAME_SIGNAL: { pattern: RegExp; country: string } = {
  pattern: /\b(alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|new hampshire|new jersey|new mexico|new york|north carolina|north dakota|ohio|oklahoma|oregon|pennsylvania|rhode island|south carolina|south dakota|tennessee|texas|utah|vermont|virginia|washington|west virginia|wisconsin|wyoming)\b/i,
  country: 'united states',
};

const COUNTRY_SIGNALS: Array<{ pattern: RegExp; country: string }> = [
  US_STATE_NAME_SIGNAL,
  ...COUNTRY_NAME_SIGNALS,
  US_STATE_SIGNAL,
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
    // "americas" belongs to BOTH latam and norteamerica: "Remote - Americas"
    // is a very common ATS wording that DOES include LATAM candidates, but it
    // used to resolve to no region at all for a LATAM user (tier 'none',
    // location score 2), silently filtering genuinely-eligible postings.
    signals: /(latam|latin america|america latina|sudamerica|south america|central america|caribbean|americas)/,
    countries: ['mexico', 'brazil', 'argentina', 'colombia', 'chile', 'peru', 'panama', 'uruguay', 'ecuador', 'bolivia', 'paraguay', 'venezuela', 'guatemala', 'costa rica', 'dominican republic', 'honduras', 'nicaragua', 'el salvador'],
  },
  norteamerica: {
    signals: /(north america|norteamerica|americas)/,
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

  // "Home Based - Americas" (real Recruitee/SmartRecruiters wording) means
  // remote too - it used to fall through as not_remote and lose its region.
  if (!normalized.includes('remote') && !/home[\s-]?based|work from home|teletrabajo/.test(normalized)) return 'not_remote';

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

// ── Hiring-scope extraction (location + description) ────────────────────────
// "Remote" almost never means "we hire in any country". Most remote postings
// are remote-LOCAL (Remote US, Remote EMEA, "open to candidates in Europe") and
// the restriction very often lives in the DESCRIPTION, not the short location
// string. This extracts the employer's actual hiring footprint from both, as a
// structured result the eligibility gate and the scorer can compare against the
// candidate's own country - in BOTH directions (exclude a Peru candidate from
// "Remote - EMEA", but also stop penalizing "Remote - Americas" for them).

export type GeoScope = {
  scope: 'global' | 'restricted' | 'unknown';
  regions: Array<keyof typeof REGIONS>;
  countries: string[];
  /** Wording is explicit/mandatory ("must be based in", "only open to") - safe to hard-exclude on. */
  restrictive: boolean;
};

// Phrases that introduce WHERE the employer hires for this role. The text
// window right after each match is scanned for region/country names; a match
// with no geography in its window is simply ignored (cheap and safe).
// All patterns run against normalizeGeo()'d text (lowercase, accents stripped).
const SCOPE_INTRO_RX: Array<{ rx: RegExp; restrictive: boolean; windowChars?: number }> = [
  { rx: /\b(?:open|available)\s+(?:only\s+)?to\s+(?:candidates|applicants|those|people)\s*(?:based|located|residing|living)?\s*(?:in|from|within|across)\b/g, restrictive: false },
  { rx: /\b(?:role|position|opportunity|job)\s+is\s+(?:only\s+)?(?:open|available)\s+(?:to|in|for|within)\b/g, restrictive: true },
  { rx: /\bmust\s+(?:be\s+)?(?:based|located|reside|residing|live|living)\s+(?:in|within)\b/g, restrictive: true },
  { rx: /\beligible\s+(?:locations?|countries|regions?)\b/g, restrictive: true },
  { rx: /\bhir(?:e|ing)\s+(?:in|across|from|within)\b/g, restrictive: false },
  // "Remote (EMEA)" / "Remote - LATAM" / "remote in Spain" inside prose. Needs
  // an explicit separator or preposition and only a SHORT window, so ordinary
  // sentences like "remote-first company with hubs in Spain" don't register.
  { rx: /\bremote\b\s*(?:[(\-,:]|\b(?:in|within|across)\b)\s*/g, restrictive: false, windowChars: 20 },
  { rx: /\b(?:work\s+from\s+|located\s+)?anywhere\s+(?:in|within)\b/g, restrictive: false },
];

// Inside a scope window, these mean "truly global" and win outright.
const GLOBAL_WINDOW_RX = /(the\s+world|the\s+globe|worldwide|globally|any\s+country|any\s+location|internationally)/;

// Window-safe country patterns: the bare "us" alias matches ordinary prose
// ("join us", "about us") so it's excluded here - full names/"usa"/"u.s." only.
const WINDOW_COUNTRY_SIGNALS: Array<{ pattern: RegExp; country: string }> = COUNTRY_NAME_SIGNALS.map((s) =>
  s.country === 'united states'
    ? { pattern: /\b(united states|usa|u\.s\.)/i, country: 'united states' }
    : s,
);

const SCOPE_WINDOW_CHARS = 60;

function normalizedAliasForms(country: string): string[] {
  const c = normalizeGeo(country);
  if (!c) return [];
  return [c, ...(COUNTRY_ALIASES[c] ?? []).map(normalizeGeo)];
}

export function detectGeoScopeFromText(location?: string | null, text?: string | null): GeoScope {
  const regions = new Set<keyof typeof REGIONS>();
  const countries = new Set<string>();
  let restrictive = false;
  let global = false;

  // 1. The location string. Regions and countries are read for EVERY non-global
  // location, including plain city/country ones ("San Jose, California") - an
  // onsite US posting is just as much a US-scoped role as "Remote - US" is,
  // and it used to reach the feed at 60+ for candidates who could never take it.
  const locScope = detectRemoteScope(location);
  const normalizedLoc = normalizeGeo(location);
  if (locScope === 'global') global = true;
  else if (normalizedLoc) {
    for (const [region, { signals }] of Object.entries(REGIONS)) {
      if (signals.test(normalizedLoc)) regions.add(region as keyof typeof REGIONS);
    }
    const c = detectCountryFromLocation(location);
    if (c) countries.add(c);
  }

  // 2. Description/requirements windows after each scope-introducing phrase.
  const normalizedText = normalizeGeo(text);
  if (normalizedText) {
    for (const { rx, restrictive: strict, windowChars } of SCOPE_INTRO_RX) {
      rx.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = rx.exec(normalizedText)) !== null) {
        const window = normalizedText.slice(m.index + m[0].length, m.index + m[0].length + (windowChars ?? SCOPE_WINDOW_CHARS));
        if (GLOBAL_WINDOW_RX.test(window)) { global = true; continue; }
        let found = false;
        for (const [region, { signals }] of Object.entries(REGIONS)) {
          if (signals.test(window)) { regions.add(region as keyof typeof REGIONS); found = true; }
        }
        for (const { pattern, country } of WINDOW_COUNTRY_SIGNALS) {
          if (pattern.test(window)) { countries.add(country); found = true; }
        }
        if (found && (strict || /\bonly\b/.test(window))) restrictive = true;
        if (rx.lastIndex === m.index) rx.lastIndex++;
      }
    }
  }

  if (global) return { scope: 'global', regions: [], countries: [], restrictive: false };
  if (regions.size || countries.size) return { scope: 'restricted', regions: [...regions], countries: [...countries], restrictive };
  return { scope: 'unknown', regions: [], countries: [], restrictive: false };
}

/**
 * Whether a detected hiring scope covers the candidate's country.
 * Returns undefined when there's nothing to judge (unknown scope / no country) -
 * callers must treat undefined as "no signal", never as exclusion.
 */
export function geoScopeIncludesCountry(geo: GeoScope, country?: string | null): boolean | undefined {
  if (geo.scope === 'global') return true;
  if (geo.scope === 'unknown') return undefined;
  const forms = normalizedAliasForms(country ?? '');
  if (!forms.length) return undefined;
  // Short alias forms ("us", "uk") must match exactly - as substrings they hit
  // inside unrelated country names ("us" is inside "austria").
  const matchesForm = (candidate: string) => forms.some((f) =>
    f.length <= 3 || candidate.length <= 3
      ? f === candidate
      : f.includes(candidate) || candidate.includes(f),
  );
  if (geo.countries.some(matchesForm)) return true;
  for (const region of geo.regions) {
    if (REGIONS[region].countries.some(matchesForm)) return true;
  }
  return false;
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

import { detectCountryFromLocation, detectRegionFromLocation, detectRemoteScope, homeRegionOf, matchesCountry, normalizeGeo } from './geography';
import type { NormalizedVacancy } from './fitScorer';

/**
 * HARD eligibility gate - separate from the soft 0-100 fit score.
 *
 * Some postings are not just a weak fit, they are simply not applicable for this
 * candidate (you can't physically be onsite in a country you don't live in, you
 * can't be a Country Manager for a market whose language you don't speak, etc.).
 * These should never reach the user's list, regardless of role/skill overlap.
 *
 * This is the seed of a growable rule set: rules are explicit and centralized
 * here so they can be tuned, extended, and (via the learning layer) augmented
 * from the user's own discards over time - instead of being scattered magic
 * numbers the next agent forgets about.
 */

type EligibilityProfile = {
  homeCountry?: string | null;
  targetCountries?: string[] | null;
  languages?: Array<{ language: string; proficiency: string } | string> | null;
  // Both collected in Perfil/Preferencias but previously never consulted here -
  // the hard onsite/work-auth gates below used to assume "home country only",
  // ignoring a candidate who declared they'd relocate or already holds work
  // authorization somewhere else (e.g. a visa, dual citizenship, PR).
  relocationAvailable?: boolean | null;
  workAuthorization?: Array<{ country: string; status: string }> | null;
};

export type EligibilityResult = { eligible: boolean; reasons: string[] };

// Foreign languages whose *required* (not "nice to have") presence makes a role
// unviable for a candidate who doesn't speak them. English/Spanish are assumed.
const FOREIGN_LANGUAGES: Array<{ key: string; rx: RegExp }> = [
  { key: 'japanese', rx: /\b(japanese|nihongo)\b/i },
  { key: 'mandarin', rx: /\b(mandarin|chinese|cantonese)\b/i },
  { key: 'korean', rx: /\bkorean\b/i },
  { key: 'german', rx: /\b(german|deutsch)\b/i },
  { key: 'french', rx: /\b(french|français)\b/i },
  { key: 'dutch', rx: /\bdutch\b/i },
  { key: 'italian', rx: /\bitalian\b/i },
  { key: 'arabic', rx: /\barabic\b/i },
  { key: 'russian', rx: /\brussian\b/i },
  { key: 'thai', rx: /\bthai\b/i },
  { key: 'vietnamese', rx: /\bvietnamese\b/i },
  { key: 'hebrew', rx: /\bhebrew\b/i },
  { key: 'polish', rx: /\bpolish\b/i },
];

// Words that, near a language mention, mean it's genuinely required.
const REQUIRE_NEAR = /\b(fluent|fluency|fluently|native|proficien\w*|bilingual|mother\s*tongue|business[-\s]?level|professional working|must speak|required|mandatory|essential)\b/i;
// Words that downgrade it to optional - if present near the language, don't exclude.
const OPTIONAL_NEAR = /\b(a plus|nice to have|preferred|bonus|advantage|desirable|is a plus|would be)\b/i;

// "This role is based in our Raleigh office" / "is based out of our NYC HQ" -
// a common phrasing that plain "on-site"/"in-office" word matching missed
// entirely (real case: Pendo's Director, People Partner GTM said exactly
// this while also boasting a "globally distributed team", which wrongly won
// out and scored the onsite-only role 82% for a remote-only candidate).
const EXPLICIT_OFFICE_BASED_RX = /\bis\s+based\s+(in|at|out of)\s+(our|the|a)\b/i;

// Market-leadership roles that are inherently local (you must know the market).
const LOCAL_LEADERSHIP_RX = /\b(country manager|general manager|regional (director|manager|lead|vp|vice president)|market (lead|manager|director)|managing director|head of (sales|growth|operations|country|region|market))\b/i;

// ── Hireability signals (geography-agnostic) ────────────────────────────────
// The point is NOT "is this job in my region" but "would this employer actually
// hire someone like me". A US/Europe role that hires globally is great; a local
// role that needs work authorization there is useless. We detect both explicitly.

// Explicit signals the employer hires internationally / from anywhere.
const GLOBAL_FRIENDLY_RX: RegExp[] = [
  /\bwork from anywhere\b/i,
  /\bhir(e|ing)\s+(globally|internationally|worldwide|anywhere|across the (globe|world))/i,
  /\b(fully|100%|globally)\s+remote\b/i,
  /\bremote[^.\n]{0,30}\b(worldwide|globally|across the (globe|world))\b/i,
  /\bemployer of record\b|\beor\b/i,
  /\b(deel|remote\.com|oyster|globalization partners|g-?p|multiplier|rippling eor)\b/i,
  /\bopen to (candidates|applicants)[^.\n]{0,50}\b(anywhere in the world|any country|multiple countries)\b/i,
  /\bno (location|geographic|geographical|country)\s+(restriction|requirement|limitation)/i,
  // "team" deliberately excluded here: "you'll lead a globally distributed
  // team" describes the reports, not where THIS role can be performed - a
  // real posting (Pendo, Director People Partner GTM) said exactly that while
  // also saying "this role is based in our Raleigh office" a few lines above,
  // and the "team" match wrongly overrode the onsite signal, scoring an
  // onsite-only US role 82% for a Peru-based candidate seeking remote-global.
  /\b(globally distributed|fully distributed)\s+(company|workforce)\b/i,
  /\b(any|all)\s+time\s*zones?\b/i,
  /\bwe (hire|employ)\s+(people\s+)?(from|in)\s+(over|more than|\d+\+?)\s+countries\b/i,
  /\bregardless of (where|your) (you('?re| are)? )?(located|location)\b/i,
];

// Hard blockers - the posting requires legal authorization/residency/clearance in
// a country the candidate doesn't have. These make a foreign candidate ineligible.
const HARD_FOREIGN_AUTH_RX: RegExp[] = [
  /\b(authorized|authorization|eligible|legally authorized)\s+to\s+work\s+in\s+the\s+(us|u\.s\.?|united states)\b/i,
  /\b(us|u\.s\.?|united states)\s+work\s+authorization\b/i,
  /\bmust\s+(be|reside|live|be located|be based)\s+.{0,20}(in\s+the\s+)?(us|u\.s\.?|united states)\b/i,
  /\bmust\s+be\s+a\s+(us|u\.s\.?)\s+(citizen|resident|national|person)\b/i,
  /\bsecurity\s+clearance\b/i,
  /\bmust\s+have\s+(the\s+)?(right to work|work permit|valid work visa)\s+in\b/i,
  /\bwork authorization in [a-z ]+ (is\s+)?required\b/i,
];

// Soft blockers - strongly US-local-flavored but not definitive (benefits, payroll
// type, state-law clauses). Cap the score; keep visible in "discarded".
const SOFT_FOREIGN_BLOCK_RX: RegExp[] = [
  /\b401\s*\(?k\)?\b/i,
  /\bw-?2\b/i,
  /\blaws?\s+of\s+the\s+state\s+of\b/i,
  /\bno\s+(visa\s+)?sponsorship\b/i,
  /\bremote\s*[---(,]?\s*(us|usa|u\.s\.?|united states)\b/i,
  /\b(us|usa|u\.s\.?|united states)[\s-]*(only|based)\b/i,
];

/**
 * Strong disqualifier detected in the actual APPLICATION FORM (not the job text):
 * a question requiring legal work authorization in a country the candidate isn't
 * based in (e.g. Affirm's "Are you legally authorized to work in the US?"). These
 * never appear in the description, so we read them from the inspected form.
 */
export function formRequiresForeignWorkAuth(blockerTexts: string[], homeCountry?: string | null): boolean {
  if (!blockerTexts?.length) return false;
  const blob = blockerTexts.join(' \n ').toLowerCase();
  const isUS = !!homeCountry && /\b(united states|usa|u\.s|estados unidos)\b/i.test(homeCountry);
  // US work-authorization question + candidate not US-based effectively excluded.
  if (!isUS && /\b(legally )?authoriz(ed|ation) to work in (the )?(united states|us\b|u\.s)/i.test(blob)) return true;
  if (!isUS && /\b(us|u\.s\.?|united states)\s+work authorization\b/i.test(blob)) return true;
  if (!isUS && /\bmust be (legally )?authorized to work in the (us|united states)\b/i.test(blob)) return true;
  return false;
}

export type HireabilitySignals = {
  globalFriendly: boolean;
  hardForeignBlock: boolean;
  softForeignBlock: boolean;
  signals: string[];
};

/**
 * Geography-agnostic read on whether this employer would hire the candidate.
 * globalFriendly always wins over blockers (an EOR/"work from anywhere" role that
 * also mentions 401k is still hireable as an international contractor/EOR).
 */
export function detectHiringSignals(vacancy: NormalizedVacancy): HireabilitySignals {
  const text = `${vacancy.title}\n${vacancy.description ?? ''}\n${vacancy.requirements ?? ''}\n${vacancy.location ?? ''}`;
  const signals: string[] = [];
  // Explicit employment restrictions trump generic "global company" branding -
  // a US-only role can call itself "global" but still won't hire a foreigner.
  const restrictionOverride =
    /\bremote\s*[---(,]?\s*(us|usa|u\.s\.?|united states|canada)\b/i.test(text)
    || /\b(us|usa|u\.s\.?|united states)[\s-]*(only|based)\b/i.test(text)
    || /\bmust\s+(be\s+)?(located|reside|residing|based)\s+in\b/i.test(text)
    || EXPLICIT_OFFICE_BASED_RX.test(text)
    || HARD_FOREIGN_AUTH_RX.some((r) => r.test(text));
  const globalFriendly = !restrictionOverride && GLOBAL_FRIENDLY_RX.some((r) => r.test(text));
  if (globalFriendly) signals.push('Contrata internacionalmente / desde cualquier país');
  const hardForeignBlock = !globalFriendly && HARD_FOREIGN_AUTH_RX.some((r) => r.test(text));
  if (hardForeignBlock) signals.push('Exige autorización legal para trabajar en su país');
  const softForeignBlock = !globalFriendly && !hardForeignBlock && SOFT_FOREIGN_BLOCK_RX.some((r) => r.test(text));
  if (softForeignBlock) signals.push('Señales de empleo local (401k, leyes estatales, "Remote US"…)');
  return { globalFriendly, hardForeignBlock, softForeignBlock, signals };
}

function knownLanguages(profile: EligibilityProfile): Set<string> {
  const set = new Set<string>(['spanish', 'espanol', 'english', 'ingles']);
  for (const l of profile.languages ?? []) {
    const name = normalizeGeo(typeof l === 'string' ? l : l?.language);
    if (name) set.add(name);
  }
  return set;
}

function requiresForeignLanguage(text: string, known: Set<string>): string | null {
  for (const { key, rx } of FOREIGN_LANGUAGES) {
    if (known.has(key)) continue;
    const m = rx.exec(text);
    if (!m) continue;
    const window = text.slice(Math.max(0, m.index - 70), m.index + 70);
    if (REQUIRE_NEAR.test(window) && !OPTIONAL_NEAR.test(window)) return key;
  }
  return null;
}

function hasNegativeStatus(status?: string): boolean {
  return !status?.trim() || /^(no|none|ninguna|sin autorizaci[oó]n|not authorized|denied|pending|en tr[aá]mite)$/i.test(status.trim());
}

/** Any declared workAuthorization entry for `country` with a real (non-negative) status. */
function hasWorkAuthFor(country: string | undefined, profile: EligibilityProfile): boolean {
  if (!country) return false;
  const target = normalizeGeo(country);
  return (profile.workAuthorization ?? []).some((w) => {
    const c = normalizeGeo(w?.country);
    if (!c || !(target.includes(c) || c.includes(target))) return false;
    return !hasNegativeStatus(w?.status);
  });
}

/** HARD_FOREIGN_AUTH_RX is specifically US-worded - check work auth for the US directly
 * rather than relying on the job's `location` field resolving to a country. */
function hasUsWorkAuth(profile: EligibilityProfile): boolean {
  return (profile.workAuthorization ?? []).some((w) => {
    const c = normalizeGeo(w?.country);
    return !!c && /\b(united states|usa|u s)\b/.test(c) && !hasNegativeStatus(w?.status);
  });
}

/**
 * Decide whether a vacancy is fundamentally applicable for this candidate.
 * Returns eligible:false with human reasons when it should be hidden entirely.
 */
export function evaluateEligibility(vacancy: NormalizedVacancy, profile: EligibilityProfile): EligibilityResult {
  const reasons: string[] = [];
  const loc = vacancy.location ?? '';
  const text = `${vacancy.title}\n${vacancy.description ?? ''}\n${vacancy.requirements ?? ''}`;

  const scope = detectRemoteScope(loc);
  const jobCountry = detectCountryFromLocation(loc);
  const homeRegion = homeRegionOf(profile.homeCountry);
  // Region from country (US/Canada/etc.) OR from the broader region map (Singapore,
  // Japan, APAC…) so far-away markets resolve even without a dedicated signal.
  const jobRegion = (jobCountry ? homeRegionOf(jobCountry) : undefined) ?? detectRegionFromLocation(loc);
  const isHome = !!(profile.homeCountry && matchesCountry(loc, profile.homeCountry));
  const inHomeRegion = !!(homeRegion && jobRegion && homeRegion === jobRegion);
  // A specific far market is identified if we know either its country or its region
  // and it's not the candidate's own country/region.
  const foreignFar = !isHome && !inHomeRegion && (!!jobCountry || !!jobRegion);
  // Any identifiable foreign place (even within the region) - you still can't
  // commute to an office in another country (e.g. Mexico City from Panama).
  const foreignPlace = !isHome && (!!jobCountry || !!jobRegion);
  const place = jobCountry ?? (jobRegion ? String(jobRegion).toUpperCase() : 'el extranjero');

  const modality = (vacancy.modality ?? '').toLowerCase();
  // Only treat as onsite when there's an EXPLICIT signal - an unknown modality
  // with a city in the location is often a remote role that just named a city,
  // so we don't hide those (avoids over-filtering).
  const explicitOnsite = modality === 'onsite' || modality === 'hybrid'
    || /\b(on-?site|in-?office|in[-\s]person|presencial|h[íi]brid[oa]|days?\s+(a|per)\s+week\s+in|d[íi]as?\s+(a la semana|por semana)\s+en|relocat)\b/i.test(text)
    || EXPLICIT_OFFICE_BASED_RX.test(text);
  const mentionsRemote = /\bremot[eo]\b|\bwork from home\b|\bteletrabajo\b/i.test(`${text}\n${loc}`);
  const onsiteForeign = explicitOnsite || (scope === 'not_remote' && !mentionsRemote);
  const { globalFriendly, hardForeignBlock } = detectHiringSignals(vacancy);

  // R1 - Onsite/hybrid in ANY foreign country. You'd have to physically be at an
  // office abroad, which isn't viable even within your region (Mexico City from
  // Panama) and even for a "global" employer. (Brex Seattle, Adyen CDMX 3x/wk.)
  // EXCEPT when the candidate said they'd relocate, already holds work
  // authorization there (visa, PR, dual citizenship), or explicitly listed that
  // country as a target - all three are collected in onboarding/Perfil but were
  // previously ignored here, so this always hard-excluded regardless.
  const targetsThisCountry = !!jobCountry && (profile.targetCountries ?? []).some((c) => matchesCountry(jobCountry, c));
  const canBeAbroad = (profile.relocationAvailable ?? false) || hasWorkAuthFor(jobCountry, profile) || targetsThisCountry;
  if (onsiteForeign && foreignPlace && scope !== 'global' && !canBeAbroad) {
    reasons.push(`Presencial/híbrida en ${place} - tendrías que asistir a una oficina en otro país, no es viable.`);
  }

  // R2 - Requires fluency in a foreign language the candidate doesn't speak.
  // (Datadog/Notion Country Manager Japan requiring Japanese.)
  const missingLang = requiresForeignLanguage(text, knownLanguages(profile));
  if (missingLang) {
    reasons.push(`Exige dominio de ${missingLang} (fluido/nativo), idioma que no figura en tu perfil.`);
  }

  // R3 - A local market-leadership role tied to a far foreign market, UNLESS the
  // employer explicitly hires internationally (then it's worth surfacing).
  if (LOCAL_LEADERSHIP_RX.test(vacancy.title) && foreignFar && scope !== 'global' && !globalFriendly) {
    reasons.push(`Liderazgo de mercado (${vacancy.title}) en ${place}, un mercado fuera de tu región - requiere conocimiento local del país.`);
  }

  // R4 - Explicitly requires legal work authorization the candidate can't obtain
  // (e.g. "must be authorized to work in the US"). A hard "won't hire a foreigner"
  // signal not worth showing. Global-friendly postings are exempt by definition.
  // EXCEPT when the candidate actually declared US work authorization in Perfil
  // (previously ignored - this always hard-excluded regardless of that field).
  if (hardForeignBlock && !isHome && !hasUsWorkAuth(profile)) {
    reasons.push('Exige autorización legal para trabajar en su país (no aceptan candidatos extranjeros).');
  }

  return { eligible: reasons.length === 0, reasons };
}

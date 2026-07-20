import type { ProfessionalProfile } from '@/db/schema';
import { getRoleFamily, roleMatches, seniorityMatches } from './roleTaxonomy';
import { matchesCountry, normalizeGeo, hasExplicitGeoRestriction, geoPriority, isUsHome, detectRemoteScope, detectGeoScopeFromText, geoScopeIncludesCountry } from './geography';
import { detectHiringSignals } from './eligibility';
import { getSemanticRoleWarnings, isLikelyFalsePositiveRole } from './semanticRole';
import { toMonthlyAmount } from './salary';
import { buildExpertiseProfile, expertiseMatchRatio } from './expertise';
import { canonicalizeText } from './synonyms';

export type ScoringProfile = ProfessionalProfile & {
  homeCountry?: string | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  workModality?: 'remote' | 'hybrid' | 'onsite' | 'any' | null;
  workModalityPrefs?: {
    acceptsRemote: boolean;
    remoteScope: 'worldwide' | 'regions';
    remoteRegions: string[];
    acceptsHybrid: boolean;
    hybridLocations: string[];
    acceptsOnsite: boolean;
    onsiteLocations: string[];
  } | null;
  // Lives on `users` (like homeCountry/salary) - passed in by the pipeline so
  // the declared English level can be compared against the posting's demands.
  languages?: Array<{ language: string; proficiency: string } | string> | null;
};

export interface NormalizedVacancy {
  id: string;
  platform: string;
  externalId?: string;
  title: string;
  company: string;
  location?: string;
  modality?: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  salaryPeriod?: 'year' | 'month';
  description: string;
  requirements?: string;
  url: string;
  postedAt?: Date;
}

export interface ScoreBreakdown {
  roleMatch: number;
  industryMatch: number;
  locationMatch: number;
  seniorityMatch: number;
  salaryMatch: number;
  skillMatch: number;
  expertiseMatch: number;
  companyAdjustment: number;
  keywordBoost: number;
  learnedOutcomeAdjustment: number;
  learnedPreferenceAdjustment: number;
  alertPenalty: number;
  languagePenalty: number;
  total: number;
}

export interface ScoreResult {
  score: number;
  breakdown: ScoreBreakdown;
  redFlags: string[];
  warnings: string[];
}

function normalizeText(text: string): string[] {
  return text.toLowerCase().split(/[\s,;.\/\-_\(\)]+/).filter(w => w.length > 2);
}

function overlap(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const setB = new Set(b.map(s => s.toLowerCase()));
  const matches = a.filter(s => setB.has(s.toLowerCase())).length;
  return Math.min(matches / Math.min(a.length, b.length), 1);
}

/**
 * Role match is the heaviest-weighted signal (30pts) and, without it, every
 * vacancy scores near zero on that component - a user who never explicitly
 * picked target roles (onboarding skipped/abandoned, or a past bug that
 * dropped the field on save) gets 100% of vacancies filtered out regardless
 * of how good a fit they'd actually be. We must not depend on the user
 * completing that step: fall back to inferring likely target roles from
 * their most recent job titles (they're presumably still looking for
 * similar work) so scoring degrades gracefully instead of collapsing.
 * Explicit targetRoles from the user always take priority when present.
 */
function inferImplicitTargetRoles(profile: ScoringProfile, limit = 2): string[] {
  const experience = (profile.experience ?? []) as Array<{ role?: string | null; current?: boolean | null; endDate?: string | null; startDate?: string | null }>;
  if (!experience.length) return [];
  const sorted = [...experience].sort((a, b) => {
    if (a.current && !b.current) return -1;
    if (b.current && !a.current) return 1;
    return (b.endDate || b.startDate || '').localeCompare(a.endDate || a.startDate || '');
  });
  const roles = sorted
    .map((e) => e.role?.trim())
    .filter((r): r is string => Boolean(r));
  return [...new Set(roles)].slice(0, limit);
}

/**
 * The roles a search should actually look for: the user's explicit target
 * roles PLUS roles their CV/experience plausibly qualifies them for. Target
 * roles are a guide, not a hard filter - a candidate who lists fintech
 * leadership roles but has run operations and P&L should still see strong
 * "Director of Operations" matches even if they never typed that title. The
 * experience-derived roles are deduped against the explicit ones and returned
 * separately so the scorer can weight them slightly below an explicit pick.
 */
export function buildSearchRoles(profile: ScoringProfile): { explicit: string[]; fromExperience: string[]; all: string[] } {
  const explicit = profile.targetRoles ?? [];
  const explicitFamilies = new Set(explicit.map((r) => getRoleFamily(r)).filter(Boolean));
  const fromExperience = inferImplicitTargetRoles(profile, 5).filter((role) => {
    // Drop an experience role that's already covered by an explicit target
    // (same normalized title or same role family) to avoid double-counting.
    if (explicit.some((e) => e.trim().toLowerCase() === role.trim().toLowerCase())) return false;
    const fam = getRoleFamily(role);
    if (fam && explicitFamilies.has(fam)) return false;
    return true;
  });
  return { explicit, fromExperience, all: [...explicit, ...fromExperience] };
}

function includesNormalizedPhrase(haystack: string, needle: string): boolean {
  const normalizedHaystack = normalizePhrase(haystack);
  const normalizedNeedle = normalizePhrase(needle);
  if (['cfo', 'coo'].includes(normalizedNeedle) && new RegExp(`\\b(of|to|for)\\s+the\\s+${normalizedNeedle}\\b`, 'i').test(normalizedHaystack)) {
    return false;
  }
  const escapedNeedle = normalizedNeedle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|\\b)${escapedNeedle}(\\b|$)`, 'i').test(normalizedHaystack);
}

export type LearnedScoringSignals = {
  outcomeAdjustment?: number;
  preferenceAdjustment?: number;
  warnings?: string[];
  redFlags?: string[];
};

export function scoreVacancy(
  vacancy: NormalizedVacancy,
  profile: ScoringProfile,
  learnedSignals: LearnedScoringSignals = {},
): ScoreResult {
  const desc = (vacancy.description + ' ' + (vacancy.requirements || '')).toLowerCase();
  const descWords = normalizeText(desc);
  const titleWords = normalizeText(vacancy.title);
  const redFlags: string[] = [];
  const warnings: string[] = [];

  // Role match (30pts). Target roles are a GUIDE, not a hard filter: an
  // explicit target match wins (30/26), but a vacancy the candidate's own
  // experience qualifies them for - even a title they never typed - still
  // scores well (22/20) instead of collapsing to the overlap floor. Example:
  // a fintech-leadership candidate who has run operations/P&L sees strong
  // "Director of Operations" matches even though it isn't in their targets.
  const { explicit: explicitTargetRoles, fromExperience: experienceRoles } = buildSearchRoles(profile);
  const usingInferredRoles = explicitTargetRoles.length === 0;
  // When no explicit targets exist, the experience roles ARE the targets
  // (previous behavior); otherwise experience roles are a secondary, lower-
  // weight signal on top of the explicit ones.
  const primaryRoles = usingInferredRoles ? inferImplicitTargetRoles(profile) : explicitTargetRoles;
  if (usingInferredRoles && primaryRoles.length > 0) {
    warnings.push(`Sin roles objetivo definidos en tu perfil - usando tu experiencia reciente (${primaryRoles.join(', ')}) como referencia.`);
  }
  const roleTargets = primaryRoles.flatMap(r => normalizeText(r));
  const exactTitleRoleMatch = primaryRoles.some((role) => roleMatches(vacancy.title, role));
  const familyRoleMatch = primaryRoles.some((role) =>
    getRoleFamily(role) && getRoleFamily(role) === getRoleFamily(vacancy.title),
  );
  const matchedFamily = primaryRoles
    .map((role) => getRoleFamily(role))
    .find((family) => family && family === getRoleFamily(vacancy.title));
  // Only checked when the explicit targets didn't match - a role the CV
  // qualifies for but the user never listed.
  const experienceExactMatch = !usingInferredRoles && !exactTitleRoleMatch && !familyRoleMatch
    && experienceRoles.some((role) => roleMatches(vacancy.title, role));
  const experienceFamilyMatch = !usingInferredRoles && !exactTitleRoleMatch && !familyRoleMatch && !experienceExactMatch
    && experienceRoles.some((role) => getRoleFamily(role) && getRoleFamily(role) === getRoleFamily(vacancy.title));
  const titleRoleOverlap = overlap(titleWords, roleTargets);
  const contextualRoleOverlap = overlap([...titleWords, ...descWords.slice(0, 50)], roleTargets);
  const roleScore = exactTitleRoleMatch
    ? 30
    : familyRoleMatch
      ? 26
    : experienceExactMatch
      ? 22
    : experienceFamilyMatch
      ? 20
    : Math.max(
        Math.round(titleRoleOverlap * 25),
        Math.round(contextualRoleOverlap * 30),
      );
  if (experienceExactMatch || experienceFamilyMatch) {
    const matched = experienceRoles.find((role) => roleMatches(vacancy.title, role) || (getRoleFamily(role) && getRoleFamily(role) === getRoleFamily(vacancy.title)));
    warnings.push(`Rol relacionado con tu experiencia (${matched}) aunque no está en tus roles objetivo - podría valer la pena considerarlo.`);
  }
  const effectiveMatchedFamily = matchedFamily ?? (experienceFamilyMatch ? getRoleFamily(vacancy.title) : undefined);
  if (isLikelyFalsePositiveRole(vacancy.title, effectiveMatchedFamily)) {
    redFlags.push(...getSemanticRoleWarnings(vacancy.title, effectiveMatchedFamily));
  }

  // Industry match (15pts)
  const industryTargets = (profile.targetIndustries || []).flatMap(i => normalizeText(i));
  const industryScore = industryTargets.length > 0
    ? Math.round(overlap(descWords, industryTargets) * 15) : 10;

  // Location match (15pts) - LOCAL-FIRST: a job in the candidate's own country
  // scores highest (local hiring), then regional remote, then global remote, and
  // foreign onsite (US/Europe) ranks lowest.
  // Hireability signals are geography-agnostic: a US/Europe role that hires
  // globally is a GREAT fit; a local role that needs work authorization there is
  // useless. So we let these signals override the raw geographic priority.
  const hiring = detectHiringSignals(vacancy);
  // Structured hiring footprint from location AND description ("open to
  // candidates in the Americas", "must be based in EMEA", "Remote - LATAM").
  // Cuts both ways: includes the candidate's country -> boost (don't punish
  // "Remote - Americas" for a Peru candidate); excludes it -> cap below.
  const geoScope = detectGeoScopeFromText(vacancy.location, `${vacancy.title}\n${vacancy.description ?? ''}\n${vacancy.requirements ?? ''}`);
  const inHiringScope = geoScopeIncludesCountry(geoScope, profile.homeCountry);

  let locationScore = 10;
  let restrictedForeignRemote = false;
  let geoTier: ReturnType<typeof geoPriority>['tier'] = 'none';
  if ((profile.targetCountries && profile.targetCountries.length > 0) || profile.homeCountry) {
    const geo = geoPriority(vacancy.location, profile.homeCountry, profile.targetCountries ?? []);
    locationScore = geo.score;
    geoTier = geo.tier;
    // "Remote - <foreign country>" (e.g. Remote US / Remote Canada) means remote
    // but legally tied to that country - not reachable from home.
    const scope = detectRemoteScope(vacancy.location);
    restrictedForeignRemote = !hiring.globalFriendly && inHiringScope !== true && scope === 'country_restricted'
      && (geo.tier === 'foreign' || geo.tier === 'none');
    if (inHiringScope === true && (geo.tier === 'foreign' || geo.tier === 'none')) {
      // The posting's own hiring scope covers the candidate's country even
      // though the raw location string didn't resolve to their region.
      locationScore = Math.max(locationScore, 13);
      warnings.push('La vacante declara contratación en tu región/país - elegible desde donde estás.');
    }
    if (hiring.globalFriendly) {
      // Employer explicitly hires internationally - treat like global remote,
      // regardless of which country the listing is nominally in.
      locationScore = Math.max(locationScore, 13);
      warnings.push(' Contrata internacionalmente / desde cualquier país - elegible aunque sea fuera de tu región.');
    } else if ((geo.tier === 'foreign' || geo.tier === 'none') && inHiringScope !== true) {
      if (hiring.softForeignBlock || hiring.hardForeignBlock) {
        warnings.push('Fuera de tu región y con señales de empleo local - difícil que acepten un perfil extranjero.');
      } else {
        warnings.push('Fuera de tu región. No confirma si aceptan candidatos extranjeros/remotos - verifícalo antes de invertir tiempo.');
      }
    }
  }

  // Modality match (rich prefs or simple fallback)
  const prefs = profile.workModalityPrefs;
  if (prefs && vacancy.modality) {
    const mod = normalizePhrase(vacancy.modality);
    const loc = normalizeGeo(vacancy.location || '');
    if (mod === 'remote') {
      if (!prefs.acceptsRemote) {
        warnings.push('La vacante es remota pero no aceptas trabajo remoto');
        locationScore = Math.min(locationScore, 3);
      } else if (prefs.remoteScope === 'regions' && (prefs.remoteRegions ?? []).length > 0) {
        const regionMatch = prefs.remoteRegions.some(r => matchesCountry(loc, r) || loc.includes(normalizeGeo(r)));
        if (!regionMatch) {
          warnings.push('La vacante remota puede estar fuera de tus regiones aceptadas');
          locationScore = Math.min(locationScore, 5);
        }
      }
    } else if (mod === 'hybrid') {
      if (!prefs.acceptsHybrid) {
        warnings.push('La vacante es híbrida pero no aceptas trabajo híbrido');
        locationScore = Math.min(locationScore, 3);
      } else if ((prefs.hybridLocations ?? []).length > 0) {
        const hybridMatch = prefs.hybridLocations.some(c => matchesCountry(loc, c));
        if (!hybridMatch) {
          warnings.push('La vacante híbrida puede estar fuera de tus países aceptados para híbrido');
          locationScore = Math.min(locationScore, 5);
        }
      }
    } else if (mod === 'onsite') {
      if (!prefs.acceptsOnsite) {
        warnings.push('La vacante es presencial pero no aceptas trabajo presencial');
        locationScore = Math.min(locationScore, 3);
      } else if ((prefs.onsiteLocations ?? []).length > 0) {
        const onsiteMatch = prefs.onsiteLocations.some(c => matchesCountry(loc, c));
        if (!onsiteMatch) {
          warnings.push('La vacante presencial puede estar fuera de tus países aceptados');
          locationScore = Math.min(locationScore, 5);
        }
      }
    }
  } else if (
    profile.workModality &&
    profile.workModality !== 'any' &&
    vacancy.modality &&
    vacancy.modality !== profile.workModality
  ) {
    warnings.push('La modalidad puede no coincidir con tu preferencia');
    locationScore = Math.min(locationScore, 5);
  }

  // Check for explicit geographic restrictions in the description - unless the
  // extracted hiring scope already confirmed it covers the candidate's country
  // ("open to candidates in the Americas" IS a restriction phrase, but one that
  // includes them).
  if (hasExplicitGeoRestriction(desc) && inHiringScope !== true) {
    const countryMatch = profile.targetCountries?.some(c => matchesCountry(desc, c));
    if (!countryMatch) {
      warnings.push('La descripción menciona restricciones geográficas que podrían no incluir tus países objetivo');
      locationScore = Math.min(locationScore, 3);
    }
  }

  // Seniority match (10pts)
  let seniorityScore = 7;
  if (profile.targetSeniority && profile.targetSeniority.length > 0) {
    seniorityScore = seniorityMatches(vacancy.title, profile.targetSeniority) ? 10 : 4;
    if (seniorityScore < 10) warnings.push('La seniority puede no coincidir con tu objetivo');
  }

  // Salary match (10pts)
  let salaryScore = 8;
  if (vacancy.salaryMin && profile.salaryMin) {
    const monthlyVacancyMin = toMonthlyAmount(vacancy.salaryMin, (vacancy as any).salaryPeriod);
    const monthlyVacancyMax = toMonthlyAmount(vacancy.salaryMax, (vacancy as any).salaryPeriod);
    if (monthlyVacancyMax && monthlyVacancyMax < profile.salaryMin) {
      salaryScore = 0;
      warnings.push('El rango salarial puede ser inferior a tu expectativa mínima');
    } else if (monthlyVacancyMin && monthlyVacancyMin >= profile.salaryMin) {
      salaryScore = 10;
    }
  }

  // Skill match (up to +10): overlap between the user's skills and the job description
  const skillList = (profile.skills || [])
    .map((s) => (typeof s === 'string' ? s : s?.skill))
    .filter((s): s is string => Boolean(s));
  const skillWords = skillList.flatMap((s) => normalizeText(canonicalizeText(s)));
  const canonicalDescWords = normalizeText(canonicalizeText(desc));
  const skillMatch = skillWords.length > 0
    ? Math.min(Math.round(overlap(canonicalDescWords, skillWords) * 10), 10)
    : 0;

  // Expertise match (up to +12): how much of the user's real background
  // (experience, certifications, weighted skills) the job actually mentions.
  const expertise = buildExpertiseProfile(profile);
  const expertiseMatch = Math.round(expertiseMatchRatio(expertise, desc) * 12);

  // Priority keyword boost (up to +10)
  const priorityWords = (profile.priorityKeywords || []).flatMap(k => normalizeText(k));
  const keywordBoost = Math.min(Math.round(overlap(descWords, priorityWords) * 10), 10);

  // Company preferences: boost targets, hard-exclude blacklist
  const vacancyCompany = normalizeCompany(vacancy.company);
  let companyAdjustment = 0;
  let hardExclude = false;
  if (vacancyCompany) {
    const isTarget = (profile.targetCompanies || []).some((c) => companyMatches(vacancyCompany, c));
    const isExcluded = (profile.excludedCompanies || []).some((c) => companyMatches(vacancyCompany, c));
    if (isExcluded) {
      redFlags.push('La empresa está en tu lista de exclusión');
      hardExclude = true;
    } else if (isTarget) {
      companyAdjustment = 8;
    }
  }

  // Excluded industries: hard-exclude if the description matches an industry the user
  // opted out of. Word-boundary + accent-normalized match (like role matching below),
  // not a raw substring - "gas" must not match inside "organizational".
  if ((profile.excludedIndustries || []).some((ind) => ind && includesNormalizedPhrase(desc, ind))) {
    redFlags.push('La vacante coincide con una industria que excluiste');
    hardExclude = true;
  }

  // Alert keyword penalty - same word-boundary matching, not a raw substring
  // ("ad" must not match inside "advisor").
  const alertWords = profile.alertKeywords || [];
  let alertPenalty = 0;
  for (const kw of alertWords) {
    if (kw && includesNormalizedPhrase(desc, kw)) {
      alertPenalty += 5;
      redFlags.push(`Alerta: "${kw}" encontrado en la descripción`);
    }
  }

  // English-level gap (-10): the posting demands native/fluent English but the
  // candidate DECLARED a basic/intermediate level. English used to be assumed
  // universally, so e.g. "native-level English required" never even warned a
  // profile that says "ingles intermedio". Warning + penalty, never a hard
  // exclude (self-reported levels and posting wording are both fuzzy). If the
  // user didn't declare English at all we stay silent (nothing to judge).
  let languagePenalty = 0;
  const ENGLISH_DEMAND_RX = /\b(native|fluent|bilingual|c1|c2|full professional)[^.\n]{0,30}\benglish\b|\benglish\b[^.\n]{0,40}\b(native|fluent|fluency|bilingual|c1|c2|full professional)\b/i;
  const declaredEnglish = (profile.languages ?? [])
    .map((l) => (typeof l === 'string' ? { language: l, proficiency: '' } : l))
    .find((l) => /\b(english|ingles|inglés)\b/i.test(l?.language ?? ''));
  const lowEnglish = !!declaredEnglish && /(basic|básico|basico|beginner|elementary|intermediate|intermedio|a1|a2|b1)/i.test(declaredEnglish.proficiency ?? '');
  if (lowEnglish && ENGLISH_DEMAND_RX.test(desc)) {
    languagePenalty = 10;
    warnings.push(`La vacante exige inglés fluido/nativo y tu perfil declara inglés ${declaredEnglish!.proficiency} - puede ser una barrera real.`);
  }

  // Excluded checks
  const excludedRoles = (profile.excludedRoles || []).map(r => r.toLowerCase());
  if (excludedRoles.some(r => vacancy.title.toLowerCase().includes(r))) {
    redFlags.push('El rol está en tu lista de exclusión');
    hardExclude = true;
  }

  if (redFlags.some((flag) => flag.includes('otra función distinta'))) {
    redFlags.push('Posible falso positivo semántico');
  }

  redFlags.push(...(learnedSignals.redFlags ?? []));
  warnings.push(...(learnedSignals.warnings ?? []));
  const learnedOutcomeAdjustment = learnedSignals.outcomeAdjustment ?? 0;
  const learnedPreferenceAdjustment = learnedSignals.preferenceAdjustment ?? 0;

  let total = hardExclude ? 0 : Math.max(0, Math.min(100,
    roleScore + industryScore + locationScore + seniorityScore + salaryScore + skillMatch
    + expertiseMatch + companyAdjustment + keywordBoost
    + learnedOutcomeAdjustment + learnedPreferenceAdjustment - alertPenalty - languagePenalty
  ));

  // Local-employer cap: soft signals that the posting is really for local hires
  // (401k, state laws, "Remote US", "no sponsorship") - cap at 50 so it stays
  // visible but ranks below genuinely-reachable roles. Global-friendly postings
  // are exempt (detectHiringSignals already cleared softForeignBlock for them).
  const LOCAL_ONLY_CAP = 50;
  // Scope-based cap: the posting's own hiring footprint (regions/countries,
  // read from location AND description) excludes the candidate's country -
  // e.g. "Remote - EMEA" or "hiring across Europe" for a LATAM candidate.
  // Home-country agnostic on purpose (a US candidate is just as ineligible for
  // an EMEA-only role). The restrictive-worded variant is hard-excluded in
  // eligibility.ts R5; this cap covers the ambiguous rest.
  // Never cap in-region matches (home/region/region_remote tiers): a
  // "Remote - Argentina" posting for a Peru candidate is a legitimate
  // regional match by design (LATAM employers hire across LATAM), even though
  // its country set doesn't literally include Peru. Also never cap when the
  // user's own declared targets/modality countries reach the posting's scope.
  const userReachesScope = [
    ...(profile.targetCountries ?? []),
    ...(prefs?.remoteRegions ?? []),
    ...(prefs?.hybridLocations ?? []),
    ...(prefs?.onsiteLocations ?? []),
  ].some((c) => geoScopeIncludesCountry(geoScope, c) === true);
  const scopeExcludesHome = inHiringScope === false && !hiring.globalFriendly
    && (geoTier === 'foreign' || geoTier === 'none') && !userReachesScope;
  if (!hardExclude && profile.homeCountry && total > LOCAL_ONLY_CAP && scopeExcludesHome) {
    total = LOCAL_ONLY_CAP;
    const where = [...geoScope.regions.map((r) => String(r).toUpperCase()), ...geoScope.countries].join(', ');
    warnings.push(`Contratan en ${where} y tu país no aparece incluido - desde tu país no es elegible. Si confirmas que contratan internacional, ignóralo.`);
  } else if (!hardExclude && profile.homeCountry && !isUsHome(profile.homeCountry) && total > LOCAL_ONLY_CAP && inHiringScope !== true && (hiring.softForeignBlock || restrictedForeignRemote)) {
    total = LOCAL_ONLY_CAP;
    warnings.push('Remota pero atada a un país extranjero (ej. "Remote US/Canada") o con señales de empleo local - desde tu país no es elegible. Si confirmas que contratan internacional, ignóralo.');
  }

  return {
    score: total,
    breakdown: {
      roleMatch: roleScore,
      industryMatch: industryScore,
      locationMatch: locationScore,
      seniorityMatch: seniorityScore,
      salaryMatch: salaryScore,
      skillMatch,
      expertiseMatch,
      companyAdjustment,
      keywordBoost,
      learnedOutcomeAdjustment,
      learnedPreferenceAdjustment,
      alertPenalty,
      languagePenalty,
      total,
    },
    redFlags,
    warnings,
  };
}

function normalizeCompany(value: string) {
  return value
    .normalize('NFD')
    .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function companyMatches(normalizedVacancyCompany: string, candidate: string) {
  const normalizedCandidate = normalizeCompany(candidate);
  if (!normalizedCandidate || !normalizedVacancyCompany) return false;
  return (
    normalizedVacancyCompany.includes(normalizedCandidate) ||
    normalizedCandidate.includes(normalizedVacancyCompany)
  );
}

function normalizePhrase(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

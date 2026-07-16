import type { ProfessionalProfile } from '@/db/schema';
import { getRoleFamily, roleMatches, seniorityMatches } from './roleTaxonomy';
import { matchesCountry, normalizeGeo, hasExplicitGeoRestriction, geoPriority, isUsHome, detectRemoteScope } from './geography';
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

  // Role match (30pts)
  const targetRoles = profile.targetRoles || [];
  const roleTargets = targetRoles.flatMap(r => normalizeText(r));
  const exactTitleRoleMatch = targetRoles.some((role) => roleMatches(vacancy.title, role));
  const familyRoleMatch = targetRoles.some((role) =>
    getRoleFamily(role) && getRoleFamily(role) === getRoleFamily(vacancy.title),
  );
  const matchedFamily = targetRoles
    .map((role) => getRoleFamily(role))
    .find((family) => family && family === getRoleFamily(vacancy.title));
  const titleRoleOverlap = overlap(titleWords, roleTargets);
  const contextualRoleOverlap = overlap([...titleWords, ...descWords.slice(0, 50)], roleTargets);
  const roleScore = exactTitleRoleMatch
    ? 30
    : familyRoleMatch
      ? 26
    : Math.max(
        Math.round(titleRoleOverlap * 25),
        Math.round(contextualRoleOverlap * 30),
      );
  if (isLikelyFalsePositiveRole(vacancy.title, matchedFamily)) {
    redFlags.push(...getSemanticRoleWarnings(vacancy.title, matchedFamily));
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

  let locationScore = 10;
  let restrictedForeignRemote = false;
  if ((profile.targetCountries && profile.targetCountries.length > 0) || profile.homeCountry) {
    const geo = geoPriority(vacancy.location, profile.homeCountry, profile.targetCountries ?? []);
    locationScore = geo.score;
    // "Remote - <foreign country>" (e.g. Remote US / Remote Canada) means remote
    // but legally tied to that country - not reachable from home.
    const scope = detectRemoteScope(vacancy.location);
    restrictedForeignRemote = !hiring.globalFriendly && scope === 'country_restricted'
      && (geo.tier === 'foreign' || geo.tier === 'none');
    if (hiring.globalFriendly) {
      // Employer explicitly hires internationally - treat like global remote,
      // regardless of which country the listing is nominally in.
      locationScore = Math.max(locationScore, 13);
      warnings.push(' Contrata internacionalmente / desde cualquier país - elegible aunque sea fuera de tu región.');
    } else if (geo.tier === 'foreign' || geo.tier === 'none') {
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

  // Check for explicit geographic restrictions in the description
  if (hasExplicitGeoRestriction(desc)) {
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
    + learnedOutcomeAdjustment + learnedPreferenceAdjustment - alertPenalty
  ));

  // Local-employer cap: soft signals that the posting is really for local hires
  // (401k, state laws, "Remote US", "no sponsorship") - cap at 50 so it stays
  // visible but ranks below genuinely-reachable roles. Global-friendly postings
  // are exempt (detectHiringSignals already cleared softForeignBlock for them).
  const LOCAL_ONLY_CAP = 50;
  if (!hardExclude && profile.homeCountry && !isUsHome(profile.homeCountry) && total > LOCAL_ONLY_CAP && (hiring.softForeignBlock || restrictedForeignRemote)) {
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

import type { ProfessionalProfile } from '@/db/schema';
import { canonicalizeText } from './synonyms';

/**
 * Phase 1 of relevance: turn the user's *actual background* (experience,
 * education, certifications and weighted skills) into a competency signal, so
 * scoring reflects what the person can genuinely do - not only the keywords
 * they typed as targets.
 */

export interface ExpertiseProfile {
  /** Weighted competency terms: term -> accumulated weight. */
  weightedTerms: Map<string, number>;
  /** Sum of all weights, used to normalize the overlap into 0..1. */
  totalWeight: number;
  /** Approximate total years of professional experience. */
  totalYears: number;
}

const STOPWORDS = new Set([
  'and', 'the', 'for', 'with', 'que', 'con', 'los', 'las', 'del', 'una', 'por',
  'our', 'you', 'your', 'will', 'are', 'has', 'have', 'this', 'that', 'from',
  'team', 'work', 'role', 'company', 'experience', 'years', 'year', 'about',
]);

function tokenize(text: string): string[] {
  return canonicalizeText(text)
    .split(/[\s,;.:/\-_()[\]{}'"!?]+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

function skillWeight(level: string | undefined): number {
  switch ((level ?? '').toLowerCase()) {
    case 'expert':
    case 'experto':
    case 'native':
    case 'nativo':
      return 3;
    case 'advanced':
    case 'avanzado':
    case 'fluent':
      return 2;
    default:
      return 1.5;
  }
}

function addTerms(map: Map<string, number>, terms: string[], weight: number) {
  for (const term of terms) {
    map.set(term, (map.get(term) ?? 0) + weight);
  }
}

function parseYear(value?: string): number | null {
  if (!value) return null;
  const match = value.match(/(\d{4})/);
  if (!match) return null;
  const year = Number(match[1]);
  return year >= 1950 && year <= 2100 ? year : null;
}

function estimateTotalYears(experience: ProfessionalProfile['experience'] | undefined): number {
  const entries = experience ?? [];
  let earliest: number | null = null;
  let latest: number | null = null;
  const currentYear = new Date().getFullYear();

  for (const exp of entries) {
    const start = parseYear(exp.startDate);
    const end = exp.current ? currentYear : parseYear(exp.endDate) ?? currentYear;
    if (start !== null) earliest = earliest === null ? start : Math.min(earliest, start);
    if (end !== null) latest = latest === null ? end : Math.max(latest, end);
  }

  if (earliest === null || latest === null) return 0;
  return Math.max(0, latest - earliest);
}

export function buildExpertiseProfile(profile: Partial<ProfessionalProfile>): ExpertiseProfile {
  const weightedTerms = new Map<string, number>();

  // Skills weighted by declared level (strongest signal of competency).
  for (const entry of profile.skills ?? []) {
    const skill = typeof entry === 'string' ? entry : entry?.skill;
    if (!skill) continue;
    addTerms(weightedTerms, tokenize(skill), skillWeight(typeof entry === 'string' ? undefined : entry?.level));
  }

  // Past roles carry a strong signal about the domain the person operates in.
  for (const exp of profile.experience ?? []) {
    addTerms(weightedTerms, tokenize(exp.role ?? ''), 2);
    addTerms(weightedTerms, tokenize(exp.description ?? ''), 1);
    for (const achievement of exp.achievements ?? []) {
      addTerms(weightedTerms, tokenize(achievement), 1);
    }
  }

  // Certifications and field of study are lighter but still relevant.
  for (const cert of profile.certifications ?? []) {
    addTerms(weightedTerms, tokenize(cert.name ?? ''), 1.5);
  }
  for (const edu of profile.education ?? []) {
    addTerms(weightedTerms, tokenize(edu.field ?? ''), 1);
  }

  // Free-text "Logros" (profile.achievements, distinct from each experience
  // entry's own achievements[] above) was collected but never fed into
  // matching - only used for cover-letter prompts. Whatever the user chose to
  // highlight there is a real competency signal too.
  if (profile.achievements) {
    addTerms(weightedTerms, tokenize(profile.achievements), 1);
  }

  let totalWeight = 0;
  for (const weight of weightedTerms.values()) totalWeight += weight;

  return {
    weightedTerms,
    totalWeight,
    totalYears: estimateTotalYears(profile.experience),
  };
}

/**
 * Returns 0..1: how much of the user's weighted competency footprint is
 * actually mentioned in the job text. Requires a minimum amount of signal so a
 * thin profile doesn't produce noisy matches.
 */
export function expertiseMatchRatio(expertise: ExpertiseProfile, jobText: string): number {
  if (expertise.totalWeight <= 0 || expertise.weightedTerms.size < 3) return 0;
  const haystack = ` ${canonicalizeText(jobText)} `;

  let matched = 0;
  for (const [term, weight] of expertise.weightedTerms) {
    // Word-boundary match ONLY (both sides are canonicalized and the haystack
    // is space-padded, so this also covers terms at the edges). The old
    // `|| haystack.includes(term)` fallback silently voided the boundary
    // check: short generic skills matched INSIDE unrelated words ("web" in
    // "webinar", "app" in "application") - measured live at up to 0.75 match
    // ratio against pure noise text (audit 2026-07-23, M1), leaking ~+5 pts
    // of the +12 expertise component into irrelevant vacancies.
    if (haystack.includes(` ${term} `)) {
      matched += weight;
    }
  }

  return Math.min(matched / expertise.totalWeight, 1);
}

/**
 * Builds a compact natural-language summary of the user's background, used as
 * the query side of the semantic (embeddings) matcher.
 */
export function buildProfileText(profile: Partial<ProfessionalProfile>): string {
  const parts: string[] = [];

  if (profile.targetRoles?.length) parts.push(`Target roles: ${profile.targetRoles.join(', ')}.`);
  if (profile.targetIndustries?.length) parts.push(`Industries: ${profile.targetIndustries.join(', ')}.`);

  const skills = (profile.skills ?? [])
    .map((s) => (typeof s === 'string' ? s : s?.skill))
    .filter(Boolean);
  if (skills.length) parts.push(`Skills: ${skills.join(', ')}.`);

  for (const exp of (profile.experience ?? []).slice(0, 6)) {
    const role = exp.role ?? '';
    const company = exp.company ?? '';
    const desc = (exp.description ?? '').slice(0, 280);
    parts.push(`${role} at ${company}. ${desc}`.trim());
  }

  for (const cert of (profile.certifications ?? []).slice(0, 5)) {
    if (cert.name) parts.push(`Certification: ${cert.name}.`);
  }

  if (profile.achievements) parts.push(`Achievements: ${profile.achievements}`);

  return parts.join('\n').slice(0, 4000);
}

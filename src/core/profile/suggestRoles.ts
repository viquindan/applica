import { z } from 'zod';
import type { ProfessionalProfile } from '@/db/schema';
import { getInternalAiConfig } from '../ai/config';

/**
 * Suggests REALISTIC target roles grounded in the candidate's actual CV /
 * experience - the roles they would plausibly get interviews/offers for - rather
 * than aspirational titles. These are registered as the profile's targetRoles
 * (the user can then remove suggestions or add their own).
 */
export interface RoleSuggestion {
  title: string;
  seniority?: string;
  rationale?: string;
}

function buildCandidateSummary(profile: Partial<ProfessionalProfile>, resumeText?: string | null): string {
  const parts: string[] = [];

  const experience = profile.experience ?? [];
  if (experience.length) {
    parts.push('EXPERIENCE:');
    for (const exp of experience.slice(0, 8)) {
      const period = `${exp.startDate ?? '?'}${exp.current ? '-present' : exp.endDate ? `-${exp.endDate}` : ''}`;
      parts.push(`- ${exp.role ?? ''} @ ${exp.company ?? ''} (${period}): ${(exp.description ?? '').slice(0, 240)}`);
    }
  }

  const skills = (profile.skills ?? []).map((s) => (typeof s === 'string' ? s : s?.skill)).filter(Boolean);
  if (skills.length) parts.push(`SKILLS: ${skills.join(', ')}`);

  if (profile.targetIndustries?.length) parts.push(`INDUSTRIES: ${profile.targetIndustries.join(', ')}`);
  if (profile.achievements) parts.push(`ACHIEVEMENTS: ${profile.achievements.slice(0, 600)}`);
  if (resumeText) parts.push(`RESUME (excerpt):\n${resumeText.slice(0, 6000)}`);

  return parts.join('\n');
}

function dedupeRoles(roles: RoleSuggestion[]): RoleSuggestion[] {
  const seen = new Set<string>();
  const out: RoleSuggestion[] = [];
  for (const r of roles) {
    const key = r.title.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ ...r, title: r.title.trim() });
  }
  return out;
}

/** Fallback when no AI is available: reuse the candidate's actual past titles. */
function heuristicSuggestions(profile: Partial<ProfessionalProfile>): RoleSuggestion[] {
  const titles = (profile.experience ?? [])
    .map((e) => e.role)
    .filter((r): r is string => Boolean(r));
  return dedupeRoles(titles.map((title) => ({ title, rationale: 'Cargo desempeñado previamente' })));
}

export async function suggestTargetRoles(input: {
  profile: Partial<ProfessionalProfile>;
  resumeText?: string | null;
}): Promise<RoleSuggestion[]> {
  const ai = getInternalAiConfig();
  const summary = buildCandidateSummary(input.profile, input.resumeText);
  if (!ai || !summary.trim()) return heuristicSuggestions(input.profile);

  try {
    const { generateObject } = await import('ai');
    const { google } = await import('@ai-sdk/google');
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = ai.apiKey;

    const schema = z.object({
      roles: z.array(z.object({
        title: z.string(),
        seniority: z.string().optional(),
        rationale: z.string().optional(),
      })),
    });

    const { object } = await generateObject({
      model: google(ai.model),
      schema,
      // gemini-2.5-flash is a thinking model; reasoning tokens were truncating the
      // JSON. Disable thinking and give headroom so the full object is emitted.
      maxOutputTokens: 16384,
      providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } },
      prompt: `You are a senior executive recruiter. Based ONLY on the candidate's real
experience, seniority, skills and industry below, list 6-10 specific job TITLES this
person would realistically be a strong candidate for and likely receive interviews or
offers - the way those titles actually appear in job postings.

Rules:
- CRITICAL: return every job TITLE in ENGLISH (the language of most international job
  postings), even if the CV is written in Spanish. e.g. "Head of Growth", not
  "Jefe de Crecimiento"; "Country Manager", not "Gerente de País".
- Be realistic, not aspirational. Match their demonstrated level and trajectory
  (do not jump several levels, e.g. from Manager to CEO).
- Use concrete posting titles (e.g. "VP of Sales", "Head of Growth", "Country Manager
  LATAM"), NOT vague catch-alls like "Partner", "Consultant" or "Leader".
- Include close variants that appear in real postings (e.g. both "Head of Growth" and
  "VP Growth").
- Favor their strongest domain and most recent roles.
- Each role: a one-line rationale grounded in their actual experience (rationale in Spanish, title in English).

CANDIDATE:
${summary}`,
    });

    const cleaned = dedupeRoles(object.roles.filter((r) => r.title?.trim()));
    return cleaned.length ? cleaned : heuristicSuggestions(input.profile);
  } catch (error) {
    console.error('[suggestRoles] AI suggestion failed, using heuristic fallback:', error);
    return heuristicSuggestions(input.profile);
  }
}

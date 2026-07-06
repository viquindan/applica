import { NormalizedVacancy } from '../scoring/fitScorer';
import type { ProfessionalProfile, User } from '@/db/schema';
import { buildProfileText } from '../scoring/expertise';
import type { FormFieldPreview } from '../platforms/PlatformAdapter';

/**
 * AI-personalized answers for open-ended application questions.
 *
 * Factual questions (relocation, notice period, years) are handled by
 * standardAnswers.ts. This module covers the free-text "tell us about your
 * experience in X / why this role" prompts, tailoring each answer to BOTH the
 * candidate's real background AND what the vacancy asks for - so the answers are
 * ready to submit (auto) or download (manual), not left blank.
 */

type AiConfig = { provider: string; apiKey: string; model: string };

// Generic open questions to prepare when the form doesn't expose its own
// (e.g. LinkedIn Easy Apply, which we can't inspect without logging in).
export const DEFAULT_OPEN_QUESTIONS = [
  '¿Por qué te interesa este rol y esta empresa?',
  'Describe brevemente la experiencia que te hace un buen candidato para esta posición.',
];

// Never auto-write prose for sensitive topics - those keep pausing for review.
const SENSITIVE_RX = /visa|sponsor|salary|compensation|expected pay|gender|race|ethnic|disabilit|veteran|pronoun|date of birth|authori[sz]ed to work|right to work/i;

/** Whether a detected form field is a free-text prompt worth AI-answering. */
export function isOpenEndedQuestion(field: FormFieldPreview): boolean {
  const kind = (field.kind || '').toLowerCase();
  const looksFreeText = /textarea|paragraph|long|multiline|essay|text$/.test(kind) || field.label.trim().endsWith('?');
  return looksFreeText && !SENSITIVE_RX.test(field.label);
}

async function callLLM(prompt: string, ai: AiConfig): Promise<string> {
  const { generateText } = await import('ai');
  const { withAiRateLimit } = await import('../ai/limiter');
  if (ai.provider === 'openai') {
    const { openai } = await import('@ai-sdk/openai');
    process.env.OPENAI_API_KEY = ai.apiKey;
    const { text } = await withAiRateLimit(() => generateText({ model: openai(ai.model || 'gpt-4o'), prompt, maxOutputTokens: 2200 }));
    return text;
  }
  if (ai.provider === 'anthropic') {
    const { anthropic } = await import('@ai-sdk/anthropic');
    process.env.ANTHROPIC_API_KEY = ai.apiKey;
    const { text } = await withAiRateLimit(() => generateText({ model: anthropic(ai.model || 'claude-3-5-sonnet-20241022'), prompt, maxOutputTokens: 2200 }));
    return text;
  }
  // google (default) - gemini-2.5-flash is a thinking model; disable thinking so
  // the delimited output isn't truncated.
  const { google } = await import('@ai-sdk/google');
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = ai.apiKey;
  const { text } = await withAiRateLimit(() => generateText({
    model: google(ai.model || 'gemini-2.5-flash'),
    prompt,
    maxOutputTokens: 4096,
    providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } } as any,
  }));
  return text;
}

function buildPrompt(questions: string[], profileText: string, cvText: string, vacancy: NormalizedVacancy): string {
  const numbered = questions.map((q, i) => `${i + 1}. ${q}`).join('\n');
  return `You write first-person answers to job-application screening questions for a candidate.

CANDIDATE BACKGROUND (this is the ONLY source of truth about the candidate):
${profileText}

${cvText ? `RESUME EXCERPT:\n${cvText.slice(0, 1800)}\n` : ''}
JOB:
Title: ${vacancy.title}
Company: ${vacancy.company}
Description: ${(vacancy.description ?? '').slice(0, 1800)}
${vacancy.requirements ? `Requirements: ${vacancy.requirements.slice(0, 800)}` : ''}

QUESTIONS:
${numbered}

RULES:
- Answer in the same language as the question.
- Be specific: connect the candidate's REAL experience (companies, achievements, skills above) to what THIS job asks for.
- 60-120 words per answer, first person, confident but truthful.
- NEVER invent experience, employers, metrics or credentials not present in the background. If the candidate lacks direct experience for a question (e.g. "experience in hospitals / raising capital / road engineering"), say so honestly and pivot to the closest transferable experience - do not fabricate.
- No preamble, no markdown, no quotes.

Output EXACTLY this delimited format, one block per question, nothing else:
###1
<answer to question 1>
###2
<answer to question 2>
(continue for every question)`;
}

function parseDelimited(raw: string, questions: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  // Split on ###<n> markers.
  const parts = raw.split(/###\s*(\d+)\s*\n/);
  // parts = ['', '1', answer1, '2', answer2, ...]
  for (let i = 1; i < parts.length; i += 2) {
    const idx = Number(parts[i]) - 1;
    const answer = (parts[i + 1] ?? '').trim();
    if (idx >= 0 && idx < questions.length && answer) out[questions[idx]] = answer;
  }
  return out;
}

/**
 * Generate tailored answers for the given open-ended questions. Returns a map of
 * question answer (only the ones the model produced). Safe: returns {} on any
 * failure so the caller can fall back to manual review.
 */
export async function generateTailoredAnswers(
  questions: string[],
  ctx: { user: Partial<User>; profile: Partial<ProfessionalProfile>; cvText?: string },
  vacancy: NormalizedVacancy,
  ai: AiConfig | null,
): Promise<Record<string, string>> {
  const cleaned = Array.from(new Set(questions.map((q) => q.trim()).filter(Boolean)));
  if (!cleaned.length || !ai) return {};
  try {
    const profileText = buildProfileText(ctx.profile);
    const raw = await callLLM(buildPrompt(cleaned, profileText, ctx.cvText ?? '', vacancy), ai);
    return parseDelimited(raw, cleaned);
  } catch {
    return {};
  }
}

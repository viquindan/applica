import { NormalizedVacancy } from '../scoring/fitScorer';

export interface TailoringResult {
  tailoredCV: string;
  coverLetter: string;
  changes: Array<{ section: string; original: string; modified: string; reason: string }>;
  truthfulnessScore: number;
  passed: boolean;
}

function buildCVTailoringPrompt(cvText: string, vacancy: NormalizedVacancy, level: string, tone: string, memoryContext?: string): string {
  return `You are an expert CV writer and career coach. Your job is to tailor the following CV for a specific job opening.

TAILORING LEVEL: ${level}
- light: Only reorder sections and emphasize relevant experience. No rewrites.
- medium: Rewrite bullet points to better match the job requirements. Keep all facts true.
- deep: Restructure sections, rewrite descriptions, optimize for ATS keywords. Keep all facts true.

TONE: ${tone}

JOB POSTING:
Title: ${vacancy.title}
Company: ${vacancy.company}
Location: ${vacancy.location || 'Not specified'}
Description: ${vacancy.description}
${vacancy.requirements ? `Requirements: ${vacancy.requirements}` : ''}

CURRENT CV:
${cvText}

USER MEMORY:
${memoryContext || 'No additional memory available.'}

CRITICAL RULES:
1. NEVER add experience, skills, or achievements that are not in the original CV.
2. NEVER change dates, company names, job titles, or quantified metrics.
3. Only reframe, emphasize, and reorder existing information.
4. Use keywords from the job posting where naturally applicable.
5. Maintain professional formatting.

Return a JSON object with this exact structure:
{
  "tailoredCV": "The complete tailored CV text",
  "changes": [
    {
      "section": "section name",
      "original": "original text snippet",
      "modified": "modified text snippet",
      "reason": "why this change improves fit"
    }
  ],
  "truthfulnessScore": 95
}`;
}

function buildCoverLetterPrompt(cvText: string, vacancy: NormalizedVacancy, tone: string, achievements: string, memoryContext?: string): string {
  return `Write a compelling cover letter for the following job application.

TONE: ${tone}
JOB: ${vacancy.title} at ${vacancy.company}
LOCATION: ${vacancy.location || 'Not specified'}

JOB DESCRIPTION:
${vacancy.description}

CANDIDATE BACKGROUND (from CV):
${cvText.substring(0, 2000)}

KEY ACHIEVEMENTS:
${achievements || 'See CV'}

USER MEMORY:
${memoryContext || 'No additional memory available.'}

Write a 3-4 paragraph cover letter that:
1. Opens with a compelling hook specific to ${vacancy.company}
2. Connects candidate's top 2-3 achievements to the job requirements
3. Shows cultural fit and genuine interest in the role
4. Closes with a clear call to action

Return only the cover letter text, no extra formatting.`;
}

async function callLLM(prompt: string, settings: { provider: string; apiKey: string; model: string }): Promise<string> {
  const { generateText } = await import('ai');
  const { withAiRateLimit } = await import('../ai/limiter');
  if (settings.provider === 'openai') {
    const { openai } = await import('@ai-sdk/openai');
    process.env.OPENAI_API_KEY = settings.apiKey;
    const { text } = await withAiRateLimit(() => generateText({ model: openai(settings.model || 'gpt-4o'), prompt, maxOutputTokens: 4000 }));
    return text;
  }
  if (settings.provider === 'anthropic') {
    const { anthropic } = await import('@ai-sdk/anthropic');
    process.env.ANTHROPIC_API_KEY = settings.apiKey;
    const { text } = await withAiRateLimit(() => generateText({ model: anthropic(settings.model || 'claude-3-5-sonnet-20241022'), prompt, maxOutputTokens: 4000 }));
    return text;
  }
  if (settings.provider === 'google') {
    const { google } = await import('@ai-sdk/google');
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = settings.apiKey;
    const { text } = await withAiRateLimit(() => generateText({ model: google(settings.model || 'gemini-2.5-flash'), prompt, maxOutputTokens: 4000 }));
    return text;
  }
  throw new Error(`Unknown provider: ${settings.provider}`);
}

export async function tailorCV(
  cvText: string,
  vacancy: NormalizedVacancy,
  level: string,
  tone: string,
  aiSettings: { provider: string; apiKey: string; model: string },
  memoryContext?: string,
): Promise<TailoringResult> {
  const prompt = buildCVTailoringPrompt(cvText, vacancy, level, tone, memoryContext);
  const raw = await callLLM(prompt, aiSettings);

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found');
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      tailoredCV: parsed.tailoredCV || cvText,
      coverLetter: '',
      changes: parsed.changes || [],
      truthfulnessScore: parsed.truthfulnessScore || 100,
      passed: (parsed.truthfulnessScore || 100) >= 80,
    };
  } catch {
    return { tailoredCV: cvText, coverLetter: '', changes: [], truthfulnessScore: 100, passed: true };
  }
}

export async function generateCoverLetter(
  cvText: string,
  vacancy: NormalizedVacancy,
  tone: string,
  achievements: string,
  aiSettings: { provider: string; apiKey: string; model: string },
  memoryContext?: string,
): Promise<string> {
  const prompt = buildCoverLetterPrompt(cvText, vacancy, tone, achievements, memoryContext);
  return callLLM(prompt, aiSettings);
}

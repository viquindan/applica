import { getInternalAiConfig } from '../ai/config';
import { z } from 'zod';

type ExtractedProfile = {
  name?: string;
  phone?: string;
  linkedin?: string;
  portfolio?: string;
  location?: string;
  country?: string;
  languages?: Array<{ language: string; proficiency: string }>;
  experience?: Array<{ company: string; role: string; startDate: string; endDate?: string; current: boolean; description: string; achievements: string[] }>;
  education?: Array<{ institution: string; degree: string; field: string; year?: number; gpa?: string }>;
  certifications?: Array<{ name: string; issuer: string; year?: number; url?: string }>;
  skills?: Array<{ skill: string; level: string }>;
  achievements?: string;
};

function fallbackExtract(text: string): ExtractedProfile {
  const emailLikeLinkedin = text.match(/https?:\/\/(?:www\.)?linkedin\.com\/[^\s)]+/i)?.[0];
  const firstLine = text.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  const location = text.match(/Location:\s*([^\n]+)/i)?.[1]?.trim();
  const languageLine = text.match(/Languages:\s*([^\n]+)/i)?.[1];
  const languages = languageLine?.split(',').map((item) => {
    const match = item.trim().match(/^(.+?)\s+\(([^)]+)\)$/);
    return match ? { language: match[1].trim(), proficiency: match[2].trim() } : null;
  }).filter(Boolean) as Array<{ language: string; proficiency: string }> | undefined;
  const achievementsMatch = text.match(/ACHIEVEMENTS\s+([\s\S]*?)(?:SKILLS AND INTERESTS|$)/i)?.[1]?.trim();
  const workSection = text.match(/WORK EXPERIENCE\s+([\s\S]*?)(?:EDUCATION|$)/i)?.[1] ?? '';
  const experience = parseExperience(workSection);
  const educationSection = text.match(/EDUCATION\s+([\s\S]*?)(?:ACHIEVEMENTS|$)/i)?.[1] ?? '';
  const education = Array.from(educationSection.matchAll(
    /^(.+?)\s+(France|Colombia|USA|Panama|México|Mexico)\s+(\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{4})\s*\n([^\n]+)/gim,
  )).map((match) => ({
    degree: match[1].trim(),
    field: match[1].trim(),
    institution: match[5].trim(),
    year: Number(match[4].slice(-4)),
  }));
  const skillLine = text.match(/IT:\s*([^\n]+)/i)?.[1];
  const skills = skillLine?.split(',').map((skill) => ({ skill: skill.trim(), level: 'unspecified' })).filter((item) => item.skill);
  return {
    name: firstLine,
    linkedin: emailLikeLinkedin,
    location,
    country: location,
    languages,
    experience,
    education,
    skills,
    achievements: achievementsMatch,
  };
}

function normalizeCvDate(value: string) {
  const [month, year] = value.split('/');
  return `${year}-${month}`;
}

function parseHeaderWithDates(line: string) {
  const match = line.match(/^(.+?)\s+(Colombia|USA|France|Panama|México|Mexico)\s+(\d{2}\/\d{4})-\s*(Present|\d{2}\/\d{4})$/i);
  if (!match) return null;
  return {
    leadingText: match[1].trim(),
    startDate: normalizeCvDate(match[3]),
    endDate: match[4].toLowerCase() === 'present' ? undefined : normalizeCvDate(match[4]),
    current: match[4].toLowerCase() === 'present',
  };
}

function parseExperience(section: string): ExtractedProfile['experience'] {
  const lines = section.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const rows: NonNullable<ExtractedProfile['experience']> = [];
  let index = 0;
  while (index < lines.length) {
    let role = '';
    let company = '';
    let header = parseHeaderWithDates(lines[index]);

    if (header) {
      role = header.leadingText;
      company = lines[index + 1] ?? '';
      index += 2;
    } else {
      const nextHeader = parseHeaderWithDates(lines[index + 1] ?? '');
      if (!nextHeader) {
        index += 1;
        continue;
      }
      role = lines[index];
      company = nextHeader.leadingText;
      header = nextHeader;
      index += 2;
    }

    const bulletLines: string[] = [];
    while (
      index < lines.length &&
      !parseHeaderWithDates(lines[index]) &&
      !(isLikelyRoleLine(lines[index]) && parseHeaderWithDates(lines[index + 1] ?? ''))
    ) {
      bulletLines.push(lines[index]);
      index += 1;
    }
    rows.push({
      role,
      company,
      startDate: header.startDate,
      endDate: header.endDate,
      current: header.current,
      description: bulletLines.join(' ').replace(/\s+/g, ' ').trim(),
      achievements: bulletLines.filter((line) => line.startsWith('•')),
    });
  }
  return rows;
}

function isLikelyRoleLine(line: string) {
  return !line.startsWith('•') && !/[.!?]$/.test(line) && line.split(/\s+/).length <= 8;
}

async function runAiExtraction(text: string, ai: { apiKey: string; model: string }): Promise<ExtractedProfile> {
    const { generateObject } = await import('ai');
    const { google } = await import('@ai-sdk/google');
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = ai.apiKey;
    const schema = z.object({
      name: z.string().optional(),
      phone: z.string().optional(),
      linkedin: z.string().optional(),
      portfolio: z.string().optional(),
      location: z.string().optional(),
      country: z.string().optional(),
      languages: z.array(z.object({ language: z.string(), proficiency: z.string() })).optional(),
      experience: z.array(z.object({
        company: z.string(),
        role: z.string(),
        startDate: z.string(),
        endDate: z.string().optional(),
        current: z.boolean(),
        description: z.string(),
        achievements: z.array(z.string()),
      })).optional(),
      education: z.array(z.object({
        institution: z.string(),
        degree: z.string(),
        field: z.string(),
        year: z.number().optional(),
        gpa: z.string().optional(),
      })).optional(),
      certifications: z.array(z.object({
        name: z.string(),
        issuer: z.string(),
        year: z.number().optional(),
        url: z.string().optional(),
      })).optional(),
      skills: z.array(z.object({ skill: z.string(), level: z.string() })).optional(),
      achievements: z.string().optional(),
    });
    const { object } = await generateObject({
      model: google(ai.model),
      schema,
      // gemini-2.5-flash is a "thinking" model; reasoning tokens were eating the
      // budget and truncating the JSON right at `experience`. Disable thinking
      // and give plenty of room so the full structured object is emitted.
      maxOutputTokens: 16384,
      providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } },
      prompt: `Extract only factual candidate information from this CV.
If a field is absent, omit it. Never infer facts that are not present.
Use YYYY-MM for month-level dates when present.
Put general technologies/tools in skills.
For languages, return each language NAME in English (e.g. "Spanish", "English",
"French", "German", "Portuguese") and proficiency as one of: Native, C2, C1, B2, B1, A2, A1.
If a current role says Present, set current=true and omit endDate.

CV:
${text.slice(0, 18000)}`,
    });
    const fallback = fallbackExtract(text);
    return {
      ...fallback,
      ...Object.fromEntries(Object.entries(object).filter(([, value]) => {
        if (typeof value === 'string') return value.trim().length > 0;
        if (Array.isArray(value)) return value.length > 0;
        return value !== undefined && value !== null;
      })),
      experience: object.experience?.length ? object.experience : fallback.experience,
      education: object.education?.length ? object.education : fallback.education,
      languages: object.languages?.length ? object.languages : fallback.languages,
      achievements: object.achievements?.trim() ? object.achievements : fallback.achievements,
    };
}

// Real bug found in QA (2026-07-21/22): reproduced 2/2 times on the same real
// CV - experience/education/location/country came back completely empty
// despite being clearly present in the raw extracted text (skills/name/phone
// extracted fine in the same run, so this isn't the maxOutputTokens
// truncation already fixed above - it's model non-determinism already
// documented in this file's git history: "the same CV can return 0
// experiences one run and 5 the next"). One retry is cheap and matches that
// documented behavior; if it happens twice in a row the log below is what a
// future session needs to actually calibrate the prompt with real data
// instead of guessing.
export async function extractProfileFromCv(text: string): Promise<ExtractedProfile> {
  const ai = getInternalAiConfig();
  if (!ai) return fallbackExtract(text);

  try {
    let result = await runAiExtraction(text, ai);
    const substantialText = text.trim().length > 500;
    const cameBackEmpty = !result.experience?.length && !result.education?.length;
    if (substantialText && cameBackEmpty) {
      console.warn('[profile-extract] experience/education both empty on a substantial CV - retrying once.');
      const retry = await runAiExtraction(text, ai);
      if (retry.experience?.length || retry.education?.length) {
        result = retry;
      } else {
        console.warn('[profile-extract] Retry also came back empty - likely a genuine prompt/format gap, not a one-off flake.');
      }
    }
    return result;
  } catch (error) {
    console.error('[profile-extract] AI extraction failed, using fallback:', error);
    return fallbackExtract(text);
  }
}

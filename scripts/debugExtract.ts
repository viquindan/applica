import { loadEnvLocal } from '../src/lib/loadEnvLocal';
loadEnvLocal();

const TEXT = `Daniel Pérez
Mexico City, Mexico | daniel@example.com

WORK EXPERIENCE
Finance Director - FintechCo (2018 - Present)
Led treasury, FP&A and a Series B fundraising round for a LATAM fintech scale-up.
Head of Growth - SaaSStartup (2015 - 2018)
Drove B2B growth through partnerships across the Americas.

EDUCATION
MSc Finance - IE Business School (2014)

SKILLS
Treasury, FP&A, Financial Modeling, SQL`;

async function main() {
  const { generateObject } = await import('ai');
  const { google } = await import('@ai-sdk/google');
  const { z } = await import('zod');

  // Exact full schema from extractProfileFromCv
  const schema = z.object({
    name: z.string().optional(),
    phone: z.string().optional(),
    linkedin: z.string().optional(),
    portfolio: z.string().optional(),
    location: z.string().optional(),
    country: z.string().optional(),
    languages: z.array(z.object({ language: z.string(), proficiency: z.string() })).optional(),
    experience: z.array(z.object({
      company: z.string(), role: z.string(), startDate: z.string(),
      endDate: z.string().optional(), current: z.boolean(),
      description: z.string(), achievements: z.array(z.string()),
    })).optional(),
    education: z.array(z.object({
      institution: z.string(), degree: z.string(), field: z.string(),
      year: z.number().optional(), gpa: z.string().optional(),
    })).optional(),
    certifications: z.array(z.object({
      name: z.string(), issuer: z.string(), year: z.number().optional(), url: z.string().optional(),
    })).optional(),
    skills: z.array(z.object({ skill: z.string(), level: z.string() })).optional(),
    achievements: z.string().optional(),
  });

  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  try {
    const result = await generateObject({
      model: google(model), schema, maxOutputTokens: 16384,
      providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } },
      prompt: `Extract only factual candidate information from this CV.
If a field is absent, omit it. Never infer facts that are not present.
Use YYYY-MM for month-level dates when present.

CV:
${TEXT}`,
    });
    console.log('finishReason:', result.finishReason);
    console.log('experience count:', result.object.experience?.length ?? 0);
    console.log('education count:', result.object.education?.length ?? 0);
    console.log('experience:', JSON.stringify(result.object.experience));
  } catch (e: any) {
    console.log('THREW:', e?.name, '-', e?.message);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });

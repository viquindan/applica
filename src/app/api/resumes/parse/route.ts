import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { db } from '@/db/client';
import { resumes } from '@/db/schema';
import { generateObject } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const fd = await req.formData();
    const file = fd.get('file') as File;
    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Extract text from PDF, Word (.docx) or plain text.
    const { extractResumeText } = await import('@/core/profile/extractResumeText');
    let text: string;
    try {
      text = await extractResumeText(buffer, file.name);
    } catch (error) {
      return NextResponse.json({ error: (error as Error).message }, { status: 400 });
    }

    // Save file
    const uploadDir = process.env.UPLOAD_DIR || './uploads';
    await mkdir(uploadDir, { recursive: true });
    const filename = `${session.user.id}_${Date.now()}_${file.name}`;
    const filepath = path.join(uploadDir, filename);
    await writeFile(filepath, buffer);

    // Extract structured data with Gemini
    const { object: extracted } = await generateObject({
      model: google(process.env.GEMINI_MODEL || 'gemini-2.5-flash'),
      maxOutputTokens: 16384,
      providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } },
      schema: z.object({
        personal: z.object({
          name: z.string().optional(),
          email: z.string().optional(),
          phone: z.string().optional(),
          linkedin: z.string().optional(),
          portfolio: z.string().optional(),
          location: z.string().optional(),
          country: z.string().optional(),
          languages: z.array(z.object({
            language: z.string().optional(),
            proficiency: z.string().describe("Must be one of: Native, C2, C1, B2, B1, A2, A1").optional()
          })).optional(),
        }).optional(),
        profile: z.object({
          experience: z.array(z.object({
            company: z.string().optional(),
            role: z.string().optional(),
            startDate: z.string().optional(),
            endDate: z.string().optional(),
            current: z.boolean().optional(),
            description: z.string().optional(),
            achievements: z.array(z.string()).optional()
          })).optional(),
          education: z.array(z.object({
            institution: z.string().optional(),
            degree: z.string().optional(),
            field: z.string().optional(),
            year: z.string().optional()
          })).optional(),
          skills: z.array(z.string()).optional(),
          suggestedRoles: z.array(z.string()).optional(),
        }).optional()
      }),
      prompt: `You are an expert technical recruiter. Extract personal and professional data from the following resume text.
CRITICAL INSTRUCTIONS:
- For 'experience', you MUST extract the full description and all bullet points/achievements. Combine them into a single comprehensive, well-formatted string in the 'description' field. Do not leave the description empty.
- For dates, use YYYY-MM format if possible. For current jobs, set current: true and endDate: "".
- For languages, return each language NAME in English (e.g. "Spanish", "English", "French", "German", "Portuguese"), and proficiency as one of: Native, C2, C1, B2, B1, A2, A1.
- Suggest 3 to 5 highly relevant job titles (suggestedRoles) based on their profile.

RESUME TEXT:
${text}`
    });

    return NextResponse.json({ text, filename, filePath: filepath, extracted });
  } catch (err) {
    console.error('PDF parse error:', err);
    return NextResponse.json({ error: 'Failed to parse PDF' }, { status: 500 });
  }
}

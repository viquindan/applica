import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/mobileAuth';
import { db } from '@/db/client';
import { professionalProfiles, resumes, users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { extractProfileFromCv } from '@/core/profile/extractProfileFromCv';
import { extractResumeText } from '@/core/profile/extractResumeText';
import { suggestTargetRoles } from '@/core/profile/suggestRoles';
import { refreshCoreMemory } from '@/core/memory/memoryStore';
import { queueImmediateSearch } from '@/core/jobs/boss';

export async function POST(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const fd = await req.formData();
  const file = fd.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

  const bytes = Buffer.from(await file.arrayBuffer());
  let resumeText: string;
  try {
    resumeText = await extractResumeText(bytes, file.name);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
  const extracted = await extractProfileFromCv(resumeText);

  const uploadDir = process.env.UPLOAD_DIR || './uploads';
  await mkdir(uploadDir, { recursive: true });
  const filePath = path.join(uploadDir, `${userId}_${Date.now()}_${file.name}`);
  await writeFile(filePath, bytes);

  const [profile] = await db.select().from(professionalProfiles)
    .where(eq(professionalProfiles.userId, userId)).limit(1);
  if (!profile) return NextResponse.json({ error: 'Professional profile missing' }, { status: 409 });

  // Unset isBase for previous resumes
  await db.update(resumes)
    .set({ isBase: false })
    .where(eq(resumes.userId, userId));

  const [resume] = await db.insert(resumes).values({
    userId,
    // Some pickers (content:// URIs without display-name metadata, e.g. a
    // file surfaced from a bare device cache path) hand back a raw UUID
    // instead of the name the user actually sees - that reads as "a resume I
    // didn't upload" even though it's a real, unmodified upload. Fall back to
    // a clean generated name when the filename looks machine-generated.
    label: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.\w+$/i.test(file.name)
      ? `CV subido ${new Date().toLocaleDateString('es')}.pdf`
      : file.name,
    filePath,
    textContent: resumeText,
    isBase: true,
  }).returning();

  await db.update(professionalProfiles).set({
    baseResumeId: resume.id,
    updatedAt: new Date(),
  }).where(eq(professionalProfiles.userId, userId));

  // Real bug found in production (2026-07-20): Gemini's structured extraction
  // is NOT deterministic - re-running it against the exact same CV text
  // returned 0 experience entries once, then 5 correct ones the next run.
  // `extracted.experience || undefined` never caught this because an empty
  // array is truthy in JS - a flaky run silently wiped a user's real,
  // previously-populated experience/education/certifications/skills. These
  // array fields now only overwrite when the new extraction actually found
  // something; an empty/sparse AI run leaves the existing DB value alone
  // instead of erasing it.
  await Promise.all([
    db.update(users).set({
      name: extracted.name || undefined,
      phone: extracted.phone && !extracted.phone.includes('@') ? extracted.phone : undefined,
      linkedin: extracted.linkedin || undefined,
      portfolio: extracted.portfolio || undefined,
      location: extracted.location || undefined,
      country: extracted.country || undefined,
      languages: extracted.languages?.length ? extracted.languages : undefined,
      updatedAt: new Date(),
    }).where(eq(users.id, userId)),
    db.update(professionalProfiles).set({
      experience: extracted.experience?.length ? extracted.experience : undefined,
      education: extracted.education?.length ? extracted.education : undefined,
      certifications: extracted.certifications?.length ? extracted.certifications : undefined,
      skills: extracted.skills?.length ? extracted.skills : undefined,
      achievements: extracted.achievements || undefined,
      updatedAt: new Date(),
    }).where(eq(professionalProfiles.userId, userId)),
  ]);

  // Chain the rest of the pipeline so a CV upload "just works":
  // 1) suggest realistic roles from the CV and register them,
  // 2) refresh agent memory, 3) kick off a search immediately.
  let suggestedRoles: string[] = [];
  try {
    const [updatedProfile] = await db.select().from(professionalProfiles)
      .where(eq(professionalProfiles.userId, userId)).limit(1);
    const suggestions = await suggestTargetRoles({ profile: updatedProfile, resumeText });
    suggestedRoles = suggestions.map((s) => s.title);
    if (suggestedRoles.length) {
      await db.update(professionalProfiles)
        .set({ targetRoles: suggestedRoles, updatedAt: new Date() })
        .where(eq(professionalProfiles.userId, userId));
    }
  } catch (error) {
    console.warn('[resumes/base] Role suggestion failed:', (error as Error)?.message ?? error);
  }

  await refreshCoreMemory(userId).catch(() => {});
  await queueImmediateSearch(userId).catch((error) =>
    console.warn('[resumes/base] Could not queue search (is the worker running?):', (error as Error)?.message ?? error),
  );

  return NextResponse.json({
    success: true,
    resume: {
      id: resume.id,
      label: resume.label,
      filePath: resume.filePath,
      createdAt: resume.createdAt,
    },
    extracted,
    suggestedRoles,
    searchQueued: true,
  });
}

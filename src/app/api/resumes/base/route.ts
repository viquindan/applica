import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
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
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = session.user.id;

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
    label: file.name,
    filePath,
    textContent: resumeText,
    isBase: true,
  }).returning();

  await db.update(professionalProfiles).set({
    baseResumeId: resume.id,
    updatedAt: new Date(),
  }).where(eq(professionalProfiles.userId, userId));

  await Promise.all([
    db.update(users).set({
      name: extracted.name || undefined,
      phone: extracted.phone && !extracted.phone.includes('@') ? extracted.phone : undefined,
      linkedin: extracted.linkedin || undefined,
      portfolio: extracted.portfolio || undefined,
      location: extracted.location || undefined,
      country: extracted.country || undefined,
      languages: extracted.languages || undefined,
      updatedAt: new Date(),
    }).where(eq(users.id, userId)),
    db.update(professionalProfiles).set({
      experience: extracted.experience || undefined,
      education: extracted.education || undefined,
      certifications: extracted.certifications || undefined,
      skills: extracted.skills || undefined,
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

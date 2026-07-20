import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/mobileAuth';
import { db } from '@/db/client';
import { professionalProfiles, resumes, users } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { refreshCoreMemory } from '@/core/memory/memoryStore';
import { suggestTargetRoles } from '@/core/profile/suggestRoles';
import { queueImmediateSearch } from '@/core/jobs/boss';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  // First verify the resume belongs to the user
  const resume = await db.query.resumes.findFirst({
    where: and(eq(resumes.id, id), eq(resumes.userId, userId))
  });
  if (!resume) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await db.delete(resumes).where(eq(resumes.id, id));

  // If it was the base resume, unset it
  if (resume.isBase) {
    await db.update(professionalProfiles)
      .set({ baseResumeId: null })
      .where(eq(professionalProfiles.userId, userId));
  }

  return NextResponse.json({ success: true });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  // Verify the resume belongs to the user
  const resume = await db.query.resumes.findFirst({
    where: and(eq(resumes.id, id), eq(resumes.userId, userId))
  });
  if (!resume) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Mark all user resumes as not base
  await db.update(resumes).set({ isBase: false }).where(eq(resumes.userId, userId));
  // Mark target resume as base
  await db.update(resumes).set({ isBase: true }).where(eq(resumes.id, id));

  // Re-extract data from the new active resume
  const { extractProfileFromCv } = await import('@/core/profile/extractProfileFromCv');
  let extracted = null;
  if (resume.textContent) {
    try {
      extracted = await extractProfileFromCv(resume.textContent);

      // Update profile with extracted data. Gemini's extraction is NOT
      // deterministic - the exact same CV text can come back with 0
      // experience entries on one run and 5 correct ones on the next (found
      // in production, 2026-07-20). `?? []` always overwrote regardless, so
      // a flaky run silently wiped real, previously-populated data. Only
      // overwrite these fields when the new extraction actually found
      // something.
      if (extracted) {
        await db.update(professionalProfiles)
          .set({
            baseResumeId: id,
            ...(extracted.experience?.length ? { experience: extracted.experience } : {}),
            ...(extracted.education?.length ? { education: extracted.education } : {}),
            ...(extracted.certifications?.length ? { certifications: extracted.certifications } : {}),
            ...(extracted.skills?.length ? { skills: extracted.skills } : {}),
          })
          .where(eq(professionalProfiles.userId, userId));

        if (extracted.languages?.length) {
           await db.update(users).set({ languages: extracted.languages }).where(eq(users.id, userId));
        }
      }
    } catch (e) {
       console.error("Failed to re-extract on activate:", e);
    }
  }

  if (!extracted) {
     // Fallback if no text or extraction fails
     await db.update(professionalProfiles)
       .set({ baseResumeId: id })
       .where(eq(professionalProfiles.userId, userId));
  }

  // Make activating an old CV behave like uploading a new one: re-suggest roles
  // from this CV, refresh memory, and kick off a search so applications run with
  // the now-active version.
  let suggestedRoles: string[] = [];
  try {
    const [updatedProfile] = await db.select().from(professionalProfiles)
      .where(eq(professionalProfiles.userId, userId)).limit(1);
    const suggestions = await suggestTargetRoles({ profile: updatedProfile, resumeText: resume.textContent });
    suggestedRoles = suggestions.map((s) => s.title);
    if (suggestedRoles.length) {
      await db.update(professionalProfiles)
        .set({ targetRoles: suggestedRoles, updatedAt: new Date() })
        .where(eq(professionalProfiles.userId, userId));
    }
  } catch (e) {
    console.error('Role suggestion on activate failed:', e);
  }

  await refreshCoreMemory(userId);
  await queueImmediateSearch(userId).catch((e) =>
    console.warn('Could not queue search on activate:', (e as Error)?.message ?? e),
  );

  return NextResponse.json({ success: true, extracted, suggestedRoles, searchQueued: true });
}

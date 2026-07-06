import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/db/client';
import { professionalProfiles, users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { refreshCoreMemory } from '@/core/memory/memoryStore';

type ModalityPrefs = {
  acceptsRemote?: boolean;
  acceptsHybrid?: boolean;
  acceptsOnsite?: boolean;
} | null | undefined;

function deriveWorkModality(prefs: ModalityPrefs): 'remote' | 'hybrid' | 'onsite' | 'any' {
  if (!prefs) return 'any';
  const { acceptsRemote, acceptsHybrid, acceptsOnsite } = prefs;
  const count = [acceptsRemote, acceptsHybrid, acceptsOnsite].filter(Boolean).length;
  if (count === 0 || count > 1) return 'any';
  if (acceptsRemote) return 'remote';
  if (acceptsHybrid) return 'hybrid';
  return 'onsite';
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = session.user.id;
  const body = await req.json();
  await Promise.all([
    db.update(users).set({
      name: body.name?.trim() || '',
      ...(body.email?.trim() && /.+@.+\..+/.test(body.email.trim()) ? { email: body.email.trim() } : {}),
      phone: body.phone?.trim() || null,
      linkedin: body.linkedin?.trim() || null,
      portfolio: body.portfolio?.trim() || null,
      location: body.location?.trim() || null,
      country: body.country?.trim() || null,
      languages: body.languages ?? [],
      workAuthorization: body.workAuthorization ?? [],
      relocationAvailable: Boolean(body.relocationAvailable),
      workModalityPrefs: body.workModalityPrefs ?? null,
      workModality: deriveWorkModality(body.workModalityPrefs),
      noticePeriod: body.noticePeriod?.trim() || null,
      salaryMin: body.salaryMin ? Number(body.salaryMin) : null,
      salaryCurrency: body.salaryCurrency || 'USD',
      updatedAt: new Date(),
    }).where(eq(users.id, userId)),
    db.update(professionalProfiles).set({
      experience: body.experience ?? [],
      education: body.education ?? [],
      certifications: body.certifications ?? [],
      skills: body.skills ?? [],
      achievements: body.achievements ?? null,
      targetRoles: body.targetRoles ?? [],
      updatedAt: new Date(),
    }).where(eq(professionalProfiles.userId, userId)),
  ]);
  await refreshCoreMemory(userId);
  return NextResponse.json({ success: true });
}

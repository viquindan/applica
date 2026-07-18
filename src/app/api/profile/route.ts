import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/mobileAuth';
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

// Real bug found in production QA (2026-07-18): every field below defaulted
// to empty/null when absent from the body, so a caller sending only ONE
// field (e.g. just workModalityPrefs) silently wiped everything else on the
// user's profile - name, languages, experience, targetRoles, etc. `has()`
// makes this a true partial merge: a field is only touched when the caller
// actually included the key, regardless of whether its value is falsy/empty.
function has(body: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(body, key);
}

export async function PUT(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();

  const userUpdate: Record<string, unknown> = { updatedAt: new Date() };
  if (has(body, 'name')) userUpdate.name = body.name?.trim() || '';
  if (body.email?.trim() && /.+@.+\..+/.test(body.email.trim())) userUpdate.email = body.email.trim();
  if (has(body, 'phone')) userUpdate.phone = body.phone?.trim() || null;
  if (has(body, 'linkedin')) userUpdate.linkedin = body.linkedin?.trim() || null;
  if (has(body, 'portfolio')) userUpdate.portfolio = body.portfolio?.trim() || null;
  if (has(body, 'location')) userUpdate.location = body.location?.trim() || null;
  if (has(body, 'country')) userUpdate.country = body.country?.trim() || null;
  if (has(body, 'languages')) userUpdate.languages = body.languages ?? [];
  if (has(body, 'workAuthorization')) userUpdate.workAuthorization = body.workAuthorization ?? [];
  if (has(body, 'relocationAvailable')) userUpdate.relocationAvailable = Boolean(body.relocationAvailable);
  if (has(body, 'workModalityPrefs')) {
    userUpdate.workModalityPrefs = body.workModalityPrefs ?? null;
    userUpdate.workModality = deriveWorkModality(body.workModalityPrefs);
  }
  if (has(body, 'noticePeriod')) userUpdate.noticePeriod = body.noticePeriod?.trim() || null;
  if (has(body, 'salaryMin')) userUpdate.salaryMin = body.salaryMin ? Number(body.salaryMin) : null;
  if (has(body, 'salaryCurrency')) userUpdate.salaryCurrency = body.salaryCurrency || 'USD';

  const profileUpdate: Record<string, unknown> = { updatedAt: new Date() };
  if (has(body, 'experience')) profileUpdate.experience = body.experience ?? [];
  if (has(body, 'education')) profileUpdate.education = body.education ?? [];
  if (has(body, 'certifications')) profileUpdate.certifications = body.certifications ?? [];
  if (has(body, 'skills')) profileUpdate.skills = body.skills ?? [];
  if (has(body, 'achievements')) profileUpdate.achievements = body.achievements ?? null;
  if (has(body, 'targetRoles')) profileUpdate.targetRoles = body.targetRoles ?? [];
  if (has(body, 'targetCountries')) profileUpdate.targetCountries = body.targetCountries ?? [];

  await Promise.all([
    db.update(users).set(userUpdate).where(eq(users.id, userId)),
    db.update(professionalProfiles).set(profileUpdate).where(eq(professionalProfiles.userId, userId)),
  ]);
  await refreshCoreMemory(userId);
  return NextResponse.json({ success: true });
}

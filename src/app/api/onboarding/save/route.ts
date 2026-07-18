import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/db/client';
import { users, professionalProfiles, platformSettings, resumes } from '@/db/schema';
import { and, eq } from 'drizzle-orm';

// Postgres text[] columns reject a bare string outright (a real request
// sent targetSeniority as a string, not an array, and got a bare 500 with no
// detail). Coercing at this boundary turns a hard crash into predictable
// behavior for any array-shaped field that arrives malformed.
function toArray(value: unknown): string[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = session.user.id;
  const { step, stepKey, data } = await req.json();

  try {
    if (stepKey === 'personal') {
      await db.update(users).set({
        phone: data.phone, linkedin: data.linkedin, portfolio: data.portfolio,
        location: data.location, country: data.country,
        languages: data.languages, workAuthorization: data.workAuthorization,
        salaryMin: data.salaryMin ? +data.salaryMin : null,
        salaryCurrency: data.salaryCurrency, noticePeriod: data.noticePeriod,
        onboardingStep: 2, updatedAt: new Date(),
      }).where(eq(users.id, userId));
      // Additionally, we save targetCountries and targetCities to the professionalProfile since they are now filled in the Personal step
      const [existingProfile] = await db.select().from(professionalProfiles)
        .where(eq(professionalProfiles.userId, userId))
        .limit(1);

      if (existingProfile) {
        await db.update(professionalProfiles).set({
          targetCountries: toArray(data.targetCountries),
          updatedAt: new Date(),
        }).where(eq(professionalProfiles.userId, userId));
      }
    }

    if (stepKey === 'profile') {
      // Real bug found in production QA (2026-07-18): the resume insert used
      // to commit BEFORE the professionalProfiles update below. When that
      // update then failed (e.g. a malformed field for a text[] column), the
      // resume row was already committed but never linked via baseResumeId -
      // an orphaned CV, confirmed on a real QA account. A transaction makes
      // the whole step atomic: either both writes land or neither does.
      await db.transaction(async (tx) => {
        const [existingProfile] = await tx.select().from(professionalProfiles)
          .where(eq(professionalProfiles.userId, userId))
          .limit(1);

        let baseResumeId = existingProfile?.baseResumeId ?? null;
        if (data.cvText?.trim()) {
          if (baseResumeId) {
            await tx.update(resumes).set({
              label: data.cvFileName || 'CV Base',
              filePath: data.cvFilePath || null,
              textContent: data.cvText,
              isBase: true,
            }).where(and(eq(resumes.id, baseResumeId), eq(resumes.userId, userId)));
          } else {
            const [baseResume] = await tx.insert(resumes).values({
              userId,
              label: data.cvFileName || 'CV Base',
              filePath: data.cvFilePath || null,
              textContent: data.cvText,
              isBase: true,
            }).returning();
            baseResumeId = baseResume.id;
          }
        }

        await tx.update(professionalProfiles).set({
          baseResumeId,
          experience: data.experience, education: data.education,
          certifications: data.certifications, skills: data.skills,
          achievements: data.achievements,
          targetRoles: toArray(data.targetRoles),
          targetIndustries: toArray(data.targetIndustries),
          targetSeniority: toArray(data.targetSeniority),
          targetCompanies: toArray(data.targetCompanies),
          excludedCompanies: toArray(data.excludedCompanies), excludedIndustries: toArray(data.excludedIndustries),
          excludedRoles: toArray(data.excludedRoles), priorityKeywords: toArray(data.priorityKeywords),
          alertKeywords: toArray(data.alertKeywords), cvTone: data.cvTone, coverLetterTone: data.coverLetterTone,
          updatedAt: new Date(),
        }).where(eq(professionalProfiles.userId, userId));
        await tx.update(users).set({ onboardingStep: 3, updatedAt: new Date() }).where(eq(users.id, userId));
      });
    }

    if (step === 4) {
      const { selected, configs } = data;
      for (const platformId of selected as string[]) {
        const cfg = configs[platformId] || {};
        const existing = await db.select().from(platformSettings)
          .where(and(eq(platformSettings.userId, userId), eq(platformSettings.platformName, platformId))).limit(1);
        if (existing.length === 0) {
          await db.insert(platformSettings).values({
            userId, platformName: platformId,
            searchEnabled: true,
            autoApplyEnabled: cfg.autoApplyEnabled ?? false,
            semiAutoApplyEnabled: cfg.semiAutoEnabled ?? true,
            requiresManualReview: cfg.requiresManualReview ?? true,
            minimumScoreToApply: cfg.minScore ?? 70,
            maxApplicationsPerDay: cfg.maxPerDay ?? 5,
            maxApplicationsPerWeek: cfg.maxPerWeek ?? 20,
          });
        }
      }
      await db.update(users).set({ onboardingStep: 4, updatedAt: new Date() }).where(eq(users.id, userId));
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Onboarding save error:', err);
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
  }
}

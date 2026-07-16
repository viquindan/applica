import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/db/client';
import { users, professionalProfiles, platformSettings, resumes } from '@/db/schema';
import { and, eq } from 'drizzle-orm';

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
          targetCountries: data.targetCountries,
          updatedAt: new Date(),
        }).where(eq(professionalProfiles.userId, userId));
      }
    }

    if (stepKey === 'profile') {
      const [existingProfile] = await db.select().from(professionalProfiles)
        .where(eq(professionalProfiles.userId, userId))
        .limit(1);

      let baseResumeId = existingProfile?.baseResumeId ?? null;
      if (data.cvText?.trim()) {
        if (baseResumeId) {
          await db.update(resumes).set({
            label: data.cvFileName || 'CV Base',
            filePath: data.cvFilePath || null,
            textContent: data.cvText,
            isBase: true,
          }).where(and(eq(resumes.id, baseResumeId), eq(resumes.userId, userId)));
        } else {
          const [baseResume] = await db.insert(resumes).values({
            userId,
            label: data.cvFileName || 'CV Base',
            filePath: data.cvFilePath || null,
            textContent: data.cvText,
            isBase: true,
          }).returning();
          baseResumeId = baseResume.id;
        }
      }

      await db.update(professionalProfiles).set({
        baseResumeId,
        experience: data.experience, education: data.education,
        certifications: data.certifications, skills: data.skills,
        achievements: data.achievements,
        targetSeniority: data.targetSeniority,
        targetCompanies: data.targetCompanies,
        excludedCompanies: data.excludedCompanies, excludedIndustries: data.excludedIndustries,
        excludedRoles: data.excludedRoles, priorityKeywords: data.priorityKeywords,
        alertKeywords: data.alertKeywords, cvTone: data.cvTone, coverLetterTone: data.coverLetterTone,
        updatedAt: new Date(),
      }).where(eq(professionalProfiles.userId, userId));
      await db.update(users).set({ onboardingStep: 3, updatedAt: new Date() }).where(eq(users.id, userId));
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

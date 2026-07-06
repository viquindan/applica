import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { users, userSettings, professionalProfiles, platformSettings } from '@/db/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

const TEST_EMAIL = 'test@applica.ai';

export async function POST() {
  try {
    // Check if already exists
    const existing = await db.select().from(users).where(eq(users.email, TEST_EMAIL)).limit(1);

    if (existing.length > 0) {
      return NextResponse.json({ message: 'Test user already exists', email: TEST_EMAIL, password: 'Test1234!' });
    }

    const hashed = await bcrypt.hash('Test1234!', 12);

    const [user] = await db.insert(users).values({
      name: 'Usuario de Prueba',
      email: TEST_EMAIL,
      password: hashed,
      phone: '+1 555 000 0000',
      linkedin: 'https://linkedin.com/in/test',
      location: 'Ciudad de México, MX',
      country: 'México',
      languages: [{ language: 'Español', proficiency: 'Native' }, { language: 'English', proficiency: 'C1' }],
      workAuthorization: [{ country: 'México', status: 'Citizen' }, { country: 'USA', status: 'Requires Sponsorship' }],
      relocationAvailable: true,
      workModality: 'remote',
      salaryMin: 80000,
      salaryMax: 130000,
      salaryCurrency: 'USD',
      noticePeriod: '2 semanas',
      onboardingCompleted: true,
      onboardingStep: 4,
    }).returning();

    await db.insert(professionalProfiles).values({
      userId: user.id,
      experience: [
        {
          company: 'Empresa Demo S.A.',
          role: 'Product Manager',
          startDate: '2021-01',
          endDate: '2024-06',
          current: false,
          description: 'Lideré el desarrollo de 3 productos digitales con equipos de 8-12 personas.',
          achievements: ['Incrementé retención de usuarios 40%', 'Reduje time-to-market 30%'],
        },
      ],
      education: [{ institution: 'Universidad Demo', degree: 'Licenciatura', field: 'Ingeniería en Sistemas', year: 2020 }],
      skills: [
        { skill: 'Product Management', level: 'Expert' },
        { skill: 'Agile / Scrum', level: 'Expert' },
        { skill: 'SQL', level: 'Intermediate' },
        { skill: 'Python', level: 'Intermediate' },
      ],
      achievements: '• Incrementé retención de usuarios 40% con rediseño de onboarding\n• Lideré equipo de 8 personas en lanzamiento de producto B2B\n• Reduje time-to-market de 6 meses a 4 meses',
      targetIndustries: ['Technology', 'SaaS', 'Fintech', 'EdTech'],
      targetRoles: ['Product Manager', 'Senior Product Manager', 'Product Lead', 'Head of Product'],
      targetSeniority: ['Mid-level', 'Senior', 'Lead'],
      targetCountries: ['México', 'USA', 'España', 'Colombia', 'Remote'],
      targetCompanies: [],
      excludedCompanies: [],
      excludedIndustries: ['Oil & Gas', 'Tobacco'],
      excludedRoles: ['Sales', 'Account Manager'],
      priorityKeywords: ['remote', 'product', 'agile', 'B2B', 'SaaS', 'growth'],
      alertKeywords: ['on-site required', 'no remote', 'travel 80%'],
      cvTone: 'professional',
      coverLetterTone: 'professional',
    });

    await db.insert(userSettings).values({
      userId: user.id,
      globalAutomationMode: 'semi',
      requireReviewBeforeSubmit: true,
      minScoreToGenerateMaterials: 60,
      minScoreToApply: 70,
      maxApplicationsPerDay: 10,
      maxApplicationsPerWeek: 40,
      defaultTailoringLevel: 'medium',
      pauseOnSalaryQuestions: true,
      pauseOnImmigrationQuestions: true,
      pauseOnCustomQuestions: false,
      pauseOnCaptcha: true,
      pauseOnLogin: true,
      pauseOnMissingInformation: true,
    });

    const platforms = [
      { name: 'greenhouse', autoApply: false },
      { name: 'lever', autoApply: false },
      { name: 'ashby', autoApply: false },
      { name: 'workable', autoApply: false },
      { name: 'wellfound', autoApply: false },
      { name: 'remoteok', autoApply: false },
      { name: 'manual_url', autoApply: false },
    ];

    for (const p of platforms) {
      await db.insert(platformSettings).values({
        userId: user.id,
        platformName: p.name,
        searchEnabled: true,
        autoApplyEnabled: p.autoApply,
        semiAutoApplyEnabled: true,
        requiresManualReview: true,
        minimumScoreToApply: 70,
        maxApplicationsPerDay: 5,
        maxApplicationsPerWeek: 20,
        status: 'active',
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Test user created',
      email: TEST_EMAIL,
      password: 'Test1234!',
      userId: user.id,
    });
  } catch (err: any) {
    console.error('Seed error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    info: 'POST to this endpoint to create the test user',
    credentials: { email: TEST_EMAIL, password: 'Test1234!' },
  });
}

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/client';
import { users, userSettings, professionalProfiles, platformSettings } from '@/db/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { ensureUserMemory } from '@/core/memory/memoryStore';
import { queueSearch } from '@/core/jobs/boss';
import { signExtensionToken } from '@/lib/extensionToken';

const schema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  // Optional so the existing web registration form (not touched by this
  // change) keeps working unchanged; mobile always sends these.
  securityQuestion: z.string().min(3).optional(),
  securityAnswer: z.string().min(2).optional(),
});

const DEFAULT_PLATFORMS = ['greenhouse', 'lever', 'ashby', 'manual_url'];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, email, password, securityQuestion, securityAnswer } = schema.parse(body);

    const existing = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
    if (existing.length > 0) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
    }

    const hashed = await bcrypt.hash(password, 12);
    const securityAnswerHash = securityAnswer ? await bcrypt.hash(securityAnswer.trim().toLowerCase(), 12) : undefined;
    const [user] = await db.insert(users).values({
      name,
      email: email.toLowerCase(),
      password: hashed,
      securityQuestion,
      securityAnswerHash,
    }).returning();

    // Seed default settings. globalAutomationMode must be explicit here - the
    // schema column defaults to 'off', which makes submissionDecision.ts skip
    // EVERY application regardless of score (see Rule 1), so a user who never
    // touches Settings would get materials generated forever and never see a
    // single one reach the Feed. 'semi' is the working default: search +
    // prepare automatically, swipe still gates the actual submission.
    const nextSearchAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await db.insert(userSettings).values({ userId: user.id, nextSearchAt, globalAutomationMode: 'semi' });
    await db.insert(professionalProfiles).values({ userId: user.id });
    await db.insert(platformSettings).values(
      DEFAULT_PLATFORMS.map((platformName) => ({
        userId: user.id,
        platformName,
        searchEnabled: true,
        semiAutoApplyEnabled: true,
        requiresManualReview: true,
      })),
    );
    await ensureUserMemory(user.id);
    await queueSearch(user.id, nextSearchAt);

    // token: lets a mobile client (no cookie jar) log straight in after
    // registering, same scheme as POST /api/mobile/login - web ignores it.
    return NextResponse.json({ success: true, userId: user.id, token: signExtensionToken(user.id) }, { status: 201 });
  } catch (err: any) {
    if (err.name === 'ZodError') return NextResponse.json({ error: 'Invalid input', details: err.errors }, { status: 400 });
    console.error('Register error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

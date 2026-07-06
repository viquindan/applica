import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/client';
import { users, userSettings, professionalProfiles, platformSettings } from '@/db/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { ensureUserMemory } from '@/core/memory/memoryStore';
import { queueSearch } from '@/core/jobs/boss';

const schema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
});

const DEFAULT_PLATFORMS = ['greenhouse', 'lever', 'ashby', 'manual_url'];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, email, password } = schema.parse(body);

    const existing = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
    if (existing.length > 0) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
    }

    const hashed = await bcrypt.hash(password, 12);
    const [user] = await db.insert(users).values({
      name,
      email: email.toLowerCase(),
      password: hashed,
    }).returning();

    // Seed default settings
    const nextSearchAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await db.insert(userSettings).values({ userId: user.id, nextSearchAt });
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

    return NextResponse.json({ success: true, userId: user.id }, { status: 201 });
  } catch (err: any) {
    if (err.name === 'ZodError') return NextResponse.json({ error: 'Invalid input', details: err.errors }, { status: 400 });
    console.error('Register error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { users } from '@/db/schema';

const schema = z.object({ email: z.string().email() });

// Step 1 of password recovery without email: look up the user's saved
// security question so the client can prompt for the answer. Same generic
// error whether the account doesn't exist or never set a question, so this
// can't be used to enumerate registered emails.
export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });

  const [user] = await db.select({ securityQuestion: users.securityQuestion, securityAnswerHash: users.securityAnswerHash })
    .from(users).where(eq(users.email, parsed.data.email.toLowerCase())).limit(1);

  if (!user?.securityQuestion || !user?.securityAnswerHash) {
    return NextResponse.json({ error: 'No hay recuperación configurada para este correo.' }, { status: 404 });
  }

  return NextResponse.json({ question: user.securityQuestion });
}

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { signExtensionToken } from '@/lib/extensionToken';

const schema = z.object({
  email: z.string().email(),
  answer: z.string().min(1),
  newPassword: z.string().min(8),
});

// Step 2: verify the security-question answer (hashed compare, same idea as
// the password itself) and set a new password. Returns a bearer token so a
// mobile client can go straight back into the app instead of a second login.
export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  const { email, answer, newPassword } = parsed.data;

  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  if (!user?.securityAnswerHash) return NextResponse.json({ error: 'No se pudo verificar la respuesta.' }, { status: 400 });

  const matches = await bcrypt.compare(answer.trim().toLowerCase(), user.securityAnswerHash);
  if (!matches) return NextResponse.json({ error: 'Respuesta incorrecta.' }, { status: 401 });

  const hashed = await bcrypt.hash(newPassword, 12);
  await db.update(users).set({ password: hashed, updatedAt: new Date() }).where(eq(users.id, user.id));

  return NextResponse.json({ success: true, token: signExtensionToken(user.id) });
}

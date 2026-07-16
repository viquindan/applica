import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { signExtensionToken } from '@/lib/extensionToken';

// Mobile has no cookie jar to carry NextAuth's session cookie, so it logs in
// against this route instead and gets back a stateless bearer token (same
// HMAC scheme as the browser extension - see extensionToken.ts). This
// duplicates the ~10-line credential check from src/lib/auth.ts's
// Credentials.authorize() ON PURPOSE, so the existing NextAuth web login flow
// is never touched by this addition.
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export async function POST(req: NextRequest) {
  const parsed = loginSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });

  const { email, password } = parsed.data;
  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  if (!user) return NextResponse.json({ error: 'Credenciales inválidas' }, { status: 401 });

  const passwordMatch = await bcrypt.compare(password, user.password);
  if (!passwordMatch) return NextResponse.json({ error: 'Credenciales inválidas' }, { status: 401 });

  return NextResponse.json({
    token: signExtensionToken(user.id),
    user: { id: user.id, email: user.email, name: user.name },
  });
}

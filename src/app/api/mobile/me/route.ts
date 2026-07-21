import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getAuthUserId } from '@/lib/mobileAuth';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { isSearchTuningUser } from '@/lib/searchTuning';

// AuthProvider (mobile) persiste el bearer token en SecureStore pero nunca
// re-hidrataba el `user` en memoria tras un reinicio en frío de la app - este
// endpoint liviano existe para eso (y para exponer flags calculados en el
// servidor, como searchTuningEnabled, sin que el cliente compare emails).
export async function GET(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Select explícito (nunca users.*): evita filtrar el hash bcrypt, mismo
  // patrón ya usado en /api/mobile/profile.
  const [user] = await db.select({ id: users.id, email: users.email, name: users.name })
    .from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({
    id: user.id,
    email: user.email,
    name: user.name,
    searchTuningEnabled: isSearchTuningUser(user.email),
  });
}

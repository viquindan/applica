import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { isSessionCryptoConfigured } from '@/lib/sessionCrypto';
import {
  buildLinkedInCookies,
  setLinkedInSession,
  getLinkedInStatus,
  clearLinkedInSession,
} from '@/core/automation/linkedinSession';

/** GET - current LinkedIn automation-session status. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const status = await getLinkedInStatus((session.user as any).id);
  return NextResponse.json(status);
}

/**
 * POST - connect the automation session by storing the user's LinkedIn cookies.
 * Accepts either a raw `li_at` (+ optional `jsessionid`) or a full `cookies`
 * array (e.g. captured by a future mobile webview / extension).
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isSessionCryptoConfigured()) {
    return NextResponse.json({ error: 'El cifrado de sesión no está configurado (falta SESSION_ENCRYPTION_KEY).' }, { status: 500 });
  }

  const body = await req.json().catch(() => ({}));
  const cookies = buildLinkedInCookies({ li_at: body.li_at, jsessionid: body.jsessionid, cookies: body.cookies });
  if (!cookies.length) {
    return NextResponse.json({ error: 'Falta la cookie li_at de LinkedIn.' }, { status: 400 });
  }

  try {
    await setLinkedInSession((session.user as any).id, cookies);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'No se pudo guardar la sesión.' }, { status: 400 });
  }
  return NextResponse.json({ success: true, status: 'connected' });
}

/** DELETE - disconnect (forget) the stored session. */
export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await clearLinkedInSession((session.user as any).id);
  return NextResponse.json({ success: true, status: 'none' });
}

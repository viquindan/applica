import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { signExtensionToken } from '@/lib/extensionToken';

// Returns the logged-in user's extension token (cookie-authed). The dashboard shows
// it so the user can paste it into the Applica extension once to connect it.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({ token: signExtensionToken(session.user.id) });
}

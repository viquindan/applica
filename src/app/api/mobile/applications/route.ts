import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/mobileAuth';
import { loadApplicationsData } from '@/app/(dashboard)/applications/data';

// JSON wrapper around the same server-side data bundle the web app's Feed/
// Pendientes/Apps pages already share (loadApplicationsData) - mobile slices
// it client-side with the same rules (see useApplicationActions.ts on both
// sides), so the state machine stays identical across web and mobile.
export async function GET(req: NextRequest) {
  const userId = await getAuthUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const data = await loadApplicationsData(userId);
  return NextResponse.json(data);
}

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { runLinkedInEasyApply } from '@/core/automation/linkedinApplyEngine';

// Long-running: walks the Easy Apply modal in a real browser.
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

/**
 * DRY-RUN test of the LinkedIn Easy Apply engine on a given job URL. Walks the
 * whole modal, fills what it can, screenshots at "Submit" - never submits.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id as string;

  const { jobUrl } = await req.json().catch(() => ({}));
  if (!jobUrl || !/linkedin\.com\/jobs/i.test(jobUrl)) {
    return NextResponse.json({ error: 'Pasa una URL de oferta de LinkedIn (linkedin.com/jobs/...).' }, { status: 400 });
  }

  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const result = await runLinkedInEasyApply({
    userId,
    jobUrl,
    dryRun: true,
    profileData: {
      firstName: u?.name?.split(' ')[0],
      lastName: u?.name?.split(' ').slice(1).join(' '),
      email: u?.email,
      phone: u?.phone ?? undefined,
    },
  });

  return NextResponse.json(result);
}

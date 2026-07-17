import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/db/client';
import { atsBoards } from '@/db/schema';
import { count, eq } from 'drizzle-orm';
import LandingClient from './LandingClient';

export default async function Home() {
  const session = await auth();

  // Only bounce fully onboarded users straight into the app. A session mid-
  // onboarding must be able to land on "/" normally (e.g. clicking the logo)
  // without looping back into /onboarding - that redirect belongs to the
  // login flow / dashboard gate, not to every visit to the landing page.
  if (session && (session.user as any)?.onboardingCompleted) {
    redirect('/applications');
  }

  // Real count, not a made-up number - the registry keeps growing on its own
  // via the discover_ats_boards job (see docs/APPLY-ENGINE.md).
  const trackedBoards = await db.select({ n: count() }).from(atsBoards).where(eq(atsBoards.status, 'active'))
    .then((r) => r[0]?.n ?? 0)
    .catch(() => 0);

  return <LandingClient trackedBoards={trackedBoards} />;
}

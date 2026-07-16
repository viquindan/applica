import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
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

  return <LandingClient />;
}

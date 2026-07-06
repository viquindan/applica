import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import LandingClient from './LandingClient';

export default async function Home() {
  const session = await auth();

  if (session) {
    redirect('/applications');
  }

  return <LandingClient />;
}

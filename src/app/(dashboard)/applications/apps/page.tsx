import { auth } from '@/lib/auth';
import { loadApplicationsData } from '../data';
import AppsClient from './AppsClient';

export const metadata = { title: 'Apps' };

export default async function AppsPage() {
  const session = await auth();
  const userId = session!.user.id;
  const { apps, user, settings, stats, supply, billing } = await loadApplicationsData(userId);

  return (
    <AppsClient
      apps={apps}
      user={user}
      settings={settings}
      stats={stats}
      supply={supply}
      billing={billing}
    />
  );
}

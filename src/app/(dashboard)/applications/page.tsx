import { auth } from '@/lib/auth';
import { loadApplicationsData } from './data';
import FeedClient from './FeedClient';

export const metadata = { title: 'Feed' };

export default async function FeedPage() {
  const session = await auth();
  const userId = session!.user.id;
  const { apps, user, profile, settings, stats, supply, linkedinStatus } = await loadApplicationsData(userId);

  return (
    <FeedClient
      apps={apps}
      user={user}
      profile={profile}
      settings={settings}
      stats={stats}
      supply={supply}
      linkedinStatus={linkedinStatus}
    />
  );
}

import { auth } from '@/lib/auth';
import { loadApplicationsData } from '../data';
import PendientesClient from './PendientesClient';

export const metadata = { title: 'Pendientes' };

export default async function PendingPage() {
  const session = await auth();
  const userId = session!.user.id;
  const { apps } = await loadApplicationsData(userId);

  return <PendientesClient apps={apps} />;
}

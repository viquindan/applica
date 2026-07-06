import { redirect } from'next/navigation';

export const metadata = { title: 'Cola de Revisión' };

export default async function ReviewPage() {
  redirect('/applications?filter=attention');
}

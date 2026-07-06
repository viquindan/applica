import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getAtsRegistryMetrics } from '@/core/platforms/atsRegistry';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const registryMetrics = await getAtsRegistryMetrics();
  return NextResponse.json(registryMetrics);
}

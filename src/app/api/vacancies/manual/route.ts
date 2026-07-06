import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { processVacancyForUser } from '@/core/pipeline/processVacancy';

const manualVacancySchema = z.object({
  title: z.string().min(2),
  company: z.string().min(2),
  location: z.string().optional(),
  modality: z.enum(['remote', 'hybrid', 'onsite', 'any']).optional(),
  description: z.string().min(20),
  requirements: z.string().optional(),
  url: z.string().url(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = manualVacancySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid vacancy payload', issues: parsed.error.issues }, { status: 400 });
  }

  const result = await processVacancyForUser((session.user as any).id, {
    id: randomUUID(),
    platform: 'manual_url',
    externalId: randomUUID(),
    ...parsed.data,
  });

  return NextResponse.json({ success: true, ...result });
}

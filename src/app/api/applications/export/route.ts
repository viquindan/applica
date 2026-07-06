import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/db/client';
import { applications, vacancies } from '@/db/schema';
import { eq, sql } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as any).id as string;

  const url = new URL(req.url);
  const format = url.searchParams.get('format') || 'csv';

  const rows = await db
    .select({
      id: applications.id,
      status: applications.status,
      mode: applications.mode,
      createdAt: applications.createdAt,
      vacancy: {
        title: vacancies.title,
        company: vacancies.company,
        platform: vacancies.platform,
        location: vacancies.location,
        url: vacancies.url,
        score: vacancies.score,
      },
    })
    .from(applications)
    .leftJoin(vacancies, eq(applications.vacancyId, vacancies.id))
    .where(eq(applications.userId, userId))
    .orderBy(sql`${applications.createdAt} desc`);

  if (format === 'csv') {
    const header = 'Company,Role,Platform,Location,Score,Status,Mode,Date,URL\n';
    const csv = rows.map(r => {
      const v = r.vacancy;
      const row = [
        `"${v?.company?.replace(/"/g, '""') || ''}"`,
        `"${v?.title?.replace(/"/g, '""') || ''}"`,
        v?.platform || '',
        `"${v?.location?.replace(/"/g, '""') || ''}"`,
        v?.score || '',
        r.status,
        r.mode,
        r.createdAt.toISOString(),
        v?.url || '',
      ];
      return row.join(',');
    }).join('\n');

    return new NextResponse(header + csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="applications.csv"',
      },
    });
  }

  return NextResponse.json({ error: 'Unsupported format' }, { status: 400 });
}

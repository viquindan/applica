import { PgBoss, type PgBoss as PgBossType } from 'pg-boss';

let boss: PgBossType | null = null;

export async function getBoss(): Promise<PgBossType> {
  if (boss) {
    return boss;
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL is not defined in environment variables');
  }

  // Parse connection string
  boss = new PgBoss({
    connectionString: dbUrl,
    schema: 'pgboss', // Use a dedicated schema for pg-boss
  });

  if (boss) {
    boss.on('error', (error: any) => console.error('[pg-boss] unexpected error:', error));
  }

  try {
    if (boss) await boss.start();
    if (boss) {
      await Promise.all([
        boss.createQueue('search_vacancies'),
        boss.createQueue('prepare_application_materials'),
        boss.createQueue('process_application'),
        boss.createQueue('assisted_apply'),
        boss.createQueue('regenerate_materials'),
        boss.createQueue('refresh_ats_registry'),
        boss.createQueue('discover_ats_boards'),
        boss.createQueue('discover_companies_directory'),
        boss.createQueue('refresh_job_cache'),
        boss.createQueue('re_evaluate_vacancies'),
      ]);
    }
    console.log('[pg-boss] started successfully');
  } catch (error) {
    console.error('[pg-boss] failed to start:', error);
    boss = null;
    throw error;
  }

  return boss!;
}

export async function queueSearch(userId: string, startAfter?: Date) {
  const b = await getBoss();
  await b.send('search_vacancies', { userId }, {
    retryLimit: 3,
    expireInSeconds: 60 * 15,
    singletonKey: userId,
    singletonSeconds: 60 * 15,
    ...(startAfter ? { startAfter } : {}),
  });
}

export async function queueImmediateSearch(userId: string) {
  const b = await getBoss();
  await b.send('search_vacancies', { userId }, {
    retryLimit: 3,
    expireInSeconds: 60 * 15,
  });
}

export async function queueAssistedApply(applicationId: string) {
  const b = await getBoss();
  // Opens a visible browser and keeps it alive while the user finishes. No retries
  // (a retry would pop a second window) and NO singleton-seconds throttle - that was
  // silently dropping legitimate retries and leaving the app stuck on "opening…".
  // Double-window is prevented by an in-memory guard in the worker handler.
  await b.send('assisted_apply', { applicationId }, {
    retryLimit: 0,
    expireInSeconds: 20 * 60,
  });
}

export async function queueProcessApplication(applicationId: string) {
  const b = await getBoss();
  await b.send('process_application', { applicationId }, { retryLimit: 2, expireInSeconds: 60 * 30 });
}

export async function queuePrepareApplicationMaterials(applicationId: string) {
  const b = await getBoss();
  await b.send('prepare_application_materials', { applicationId }, {
    retryLimit: 3,
    expireInSeconds: 60 * 30,
    singletonKey: applicationId,
    singletonSeconds: 60 * 30,
  });
}

export async function queueRegenerateMaterials(applicationId: string, kind: 'cv' | 'letter') {
  const b = await getBoss();
  await b.send('regenerate_materials', { applicationId, kind }, { retryLimit: 2, expireInSeconds: 60 * 15 });
}

export async function queueRegistryRefresh(startAfter?: Date) {
  const b = await getBoss();
  await b.send('refresh_ats_registry', {}, {
    retryLimit: 2,
    expireInSeconds: 60 * 30,
    singletonKey: 'registry_refresh',
    singletonSeconds: 60 * 60 * 12, // at most once every 12h
    ...(startAfter ? { startAfter } : {}),
  });
}

export async function queueJobCacheRefresh(startAfter?: Date) {
  const b = await getBoss();
  await b.send('refresh_job_cache', {}, {
    retryLimit: 2,
    expireInSeconds: 60 * 30,
    singletonKey: 'job_cache_refresh',
    singletonSeconds: 60 * 60 * 5, // at most once every 5h
    ...(startAfter ? { startAfter } : {}),
  });
}

export async function queueReEvaluate(userId: string, startAfter?: Date) {
  const b = await getBoss();
  await b.send('re_evaluate_vacancies', { userId }, {
    retryLimit: 1,
    expireInSeconds: 60 * 20,
    singletonKey: `re_evaluate_${userId}`,
    singletonSeconds: 60 * 60 * 6, // at most once every 6h per user
    ...(startAfter ? { startAfter } : {}),
  });
}

export async function queueBoardDiscovery(startAfter?: Date) {
  const b = await getBoss();
  await b.send('discover_ats_boards', {}, {
    retryLimit: 2,
    expireInSeconds: 60 * 60,
    singletonKey: 'board_discovery',
    singletonSeconds: 60 * 60 * 4, // at most once every 4h
    ...(startAfter ? { startAfter } : {}),
  });
}

export async function queueCompanyDirectoryDiscovery(startAfter?: Date) {
  const b = await getBoss();
  await b.send('discover_companies_directory', {}, {
    retryLimit: 2,
    expireInSeconds: 60 * 60,
    singletonKey: 'company_directory_discovery',
    singletonSeconds: 60 * 60 * 24, // at most once every 24h
    ...(startAfter ? { startAfter } : {}),
  });
}

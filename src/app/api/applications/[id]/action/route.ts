import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/mobileAuth';
import { db } from '@/db/client';
import { applications, applicationSubmissions, vacancies } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { queueProcessApplication, queueRegenerateMaterials, queueAssistedApply } from '@/core/jobs/boss';
import { captureApplicationDecisionLearning } from '@/core/memory/memoryStore';
import { getLinkedInStatus } from '@/core/automation/linkedinSession';
import { unresolvedBlockers } from '@/core/automation/blockers';

const VALID_ACTIONS = ['approve', 'assisted', 'cancel_assisted', 'mark_applied', 'skip', 'archive', 'regenerate_cv', 'regenerate_letter'];

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId(req);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const { action } = await req.json();

  if (!VALID_ACTIONS.includes(action)) {
    return NextResponse.json({ error: `Invalid action: ${action}` }, { status: 400 });
  }

  // Verify ownership
  const [app] = await db.select().from(applications)
    .where(and(eq(applications.id, id), eq(applications.userId, userId))).limit(1);
  if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const [vacancy] = await db.select({
    title: vacancies.title,
    company: vacancies.company,
    location: vacancies.location,
    platform: vacancies.platform,
  }).from(vacancies).where(eq(vacancies.id, app.vacancyId)).limit(1);

  // "Ya apliqué" - the user applied manually. ALWAYS mark as submitted/manual,
  // regardless of platform or LinkedIn connection (never triggers auto-apply).
  if (action === 'mark_applied') {
    const [existingSub] = await db.select().from(applicationSubmissions)
      .where(eq(applicationSubmissions.applicationId, id)).limit(1);
    const subValues = {
      platform: vacancy?.platform ?? 'manual',
      platformName: vacancy?.platform ?? 'manual',
      status: 'submitted' as const,
      submissionStatus: 'manual',
      submittedAutomatically: false,
      approvedByUser: true,
      approvalTimestamp: new Date(),
      submissionTimestamp: new Date(),
      logs: [{ level: 'info', message: 'Marcada como aplicada manualmente por el usuario', timestamp: new Date().toISOString() }],
    };
    if (existingSub) {
      await db.update(applicationSubmissions).set(subValues as any).where(eq(applicationSubmissions.id, existingSub.id));
    } else {
      await db.insert(applicationSubmissions).values({ applicationId: id, ...subValues } as any);
    }
    await db.update(applications).set({ status: 'submitted', updatedAt: new Date() }).where(eq(applications.id, id));
    await db.update(vacancies).set({ status: 'applied', updatedAt: new Date() }).where(eq(vacancies.id, app.vacancyId));
    await captureApplicationDecisionLearning(userId, 'approve', vacancy ?? {});
    return NextResponse.json({ success: true, status: 'submitted', manual: true });
  }

  if (action === 'approve') {
    const [existingSubmission] = await db.select().from(applicationSubmissions)
      .where(eq(applicationSubmissions.applicationId, id)).limit(1);
    if (
      app.status === 'submitted' || app.status === 'approved' ||
      existingSubmission?.status === 'submitted' ||
      existingSubmission?.status === 'pending' ||
      existingSubmission?.submissionStatus === 'success'
    ) {
      return NextResponse.json({ error: 'Esta aplicación ya fue aprobada o enviada.' }, { status: 409 });
    }

    // LinkedIn can auto-apply IF the user connected their session; then it goes
    // through the same real queue (worker runs the Easy Apply engine).
    const linkedinAutoEligible = vacancy?.platform === 'linkedin'
      && (await getLinkedInStatus(userId)).status === 'connected';

    // Platforms Applica cannot fill automatically (SmartRecruiters/Recruitee not
    // yet supported; LinkedIn without a connected session). Approving these means
    // "I applied manually" - mark as submitted instead of attempting (and failing).
    const AUTO_APPLY_PLATFORMS = ['greenhouse', 'lever', 'ashby', 'smartrecruiters'];
    if (vacancy && !AUTO_APPLY_PLATFORMS.includes(vacancy.platform) && !linkedinAutoEligible) {
      await db.update(applications).set({ status: 'submitted', updatedAt: new Date() }).where(eq(applications.id, id));
      await db.insert(applicationSubmissions).values({
        applicationId: id,
        platform: vacancy.platform,
        platformName: vacancy.platform,
        status: 'submitted',
        submissionStatus: 'manual',
        submittedAutomatically: false,
        approvedByUser: true,
        approvalTimestamp: new Date(),
        submissionTimestamp: new Date(),
        logs: [{ level: 'info', message: 'Marcada como aplicada manualmente por el usuario', timestamp: new Date().toISOString() }],
      });
      await db.update(vacancies).set({ status: 'applied', updatedAt: new Date() }).where(eq(vacancies.id, app.vacancyId));
      await captureApplicationDecisionLearning(userId, 'approve', vacancy ?? {});
      return NextResponse.json({ success: true, status: 'submitted', manual: true });
    }

    const formPreview = (app.submissionDecision as Record<string, any> | null)?.formPreview;
    const pending = unresolvedBlockers(formPreview?.blockers, app.formAnswers as Record<string, string>);
    if (pending.length > 0) {
      return NextResponse.json({
        error: 'La aplicación todavía tiene datos obligatorios pendientes.',
        blockers: pending,
      }, { status: 409 });
    }

    await db.update(applications)
      .set({ status: 'approved', updatedAt: new Date() })
      .where(eq(applications.id, id));
    await db.insert(applicationSubmissions).values({
      applicationId: id,
      platform: 'pending',
      platformName: 'pending',
      status: 'pending',
      submittedAutomatically: false,
      approvedByUser: true,
      approvalTimestamp: new Date(),
      logs: [{ level: 'info', message: 'Aprobado manualmente por el usuario', timestamp: new Date().toISOString() }],
    });
    await db.update(vacancies)
      .set({ status: 'applying', updatedAt: new Date() })
      .where(eq(vacancies.id, app.vacancyId));
    await queueProcessApplication(id);
    await captureApplicationDecisionLearning(userId, 'approve', vacancy ?? {});
    return NextResponse.json({ success: true, status: 'approved', queued: 'process_application' });
  }

  // Assisted apply: open a visible browser on the user's machine with the form
  // pre-filled; the user solves the CAPTCHA and submits.
  if (action === 'assisted') {
    if (app.status === 'submitted') {
      return NextResponse.json({ error: 'Esta aplicación ya fue enviada.' }, { status: 409 });
    }

    // All ATS (incl. SmartRecruiters) go through the same real-browser assisted flow:
    // the adapter clicks "I'm interested", pre-fills, and the user finishes.
    await db.update(applications).set({ status: 'approved', updatedAt: new Date() }).where(eq(applications.id, id));
    await db.update(vacancies).set({ status: 'applying', updatedAt: new Date() }).where(eq(vacancies.id, app.vacancyId));
    await queueAssistedApply(id);
    await captureApplicationDecisionLearning(userId, 'approve', vacancy ?? {});
    return NextResponse.json({ success: true, status: 'assisted_opening' });
  }

  // "No se envió" - user aborts the assisted flow; return to review so they can retry.
  if (action === 'cancel_assisted') {
    await db.update(applications).set({ status: 'pending_review', updatedAt: new Date() }).where(eq(applications.id, id));
    await db.update(vacancies).set({ status: 'pending_review', updatedAt: new Date() }).where(eq(vacancies.id, app.vacancyId));
    return NextResponse.json({ success: true, status: 'pending_review' });
  }

  if (action === 'skip') {
    await db.update(applications).set({ status: 'skipped', updatedAt: new Date() }).where(eq(applications.id, id));
    await captureApplicationDecisionLearning(userId, 'skip', vacancy ?? {});
    return NextResponse.json({ success: true, status: 'skipped' });
  }

  if (action === 'archive') {
    await db.update(applications).set({ status: 'archived', updatedAt: new Date() }).where(eq(applications.id, id));
    await captureApplicationDecisionLearning(userId, 'archive', vacancy ?? {});
    return NextResponse.json({ success: true, status: 'archived' });
  }

  if (action === 'regenerate_cv' || action === 'regenerate_letter') {
    await db.update(applications)
      .set({ status: 'draft', updatedAt: new Date() })
      .where(eq(applications.id, id));
    await queueRegenerateMaterials(id, action === 'regenerate_cv' ? 'cv' : 'letter');
    return NextResponse.json({ success: true, queued: action });
  }

  return NextResponse.json({ error: 'Unhandled action' }, { status: 400 });
}

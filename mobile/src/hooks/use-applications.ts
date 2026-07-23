import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { applicationAction, applyToVacancy, discardVacancy, getApplicationsData, saveAnswers } from '@/api/applications';
import { ApiError } from '@/api/client';
import { useRefreshOnFocus } from '@/hooks/use-refresh-on-focus';
import type { AppRow } from '@/types';

/**
 * Mobile port (not import - RN can't consume Next/Drizzle code) of the web
 * apply-engine state machine in
 * src/app/(dashboard)/applications/useApplicationActions.ts. Keep these
 * predicates in lockstep by hand whenever the web hook changes - see the
 * mobile plan's "risks" section for why this can't be shared code.
 */
const AUTO_APPLY = new Set(['greenhouse', 'lever', 'ashby', 'smartrecruiters']);
const REGISTRATION_GATED_RX = /myworkdayjobs|workday|icims|taleo|brassring/i;

export const isAtsApp = (app: AppRow) => AUTO_APPLY.has(app.vacancy?.platform ?? '');
export const isLinkedIn = (app: AppRow) => app.vacancy?.platform === 'linkedin';
export const isRegistrationGated = (app: AppRow) => REGISTRATION_GATED_RX.test(app.vacancy?.url ?? '');
export const isGenericCapable = (app: AppRow) => !isAtsApp(app) && !isLinkedIn(app) && !isRegistrationGated(app);
export const canAuto = (app: AppRow) => (isAtsApp(app) || isGenericCapable(app)) && app.status === 'pending_review';
export const autoCapable = (app: AppRow) => app.status === 'pending_review' && canAuto(app);

// Port of src/core/automation/blockers.ts (blockerQuestion/unresolvedBlockers)
// - blockers are plain strings like "Falta completar el campo obligatorio:
// <Question>*", not objects, and "answered" is a fuzzy substring match, not
// an exact key lookup.
function normBlocker(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').replace(/\*+\s*$/, '').trim();
}
export function blockerQuestion(blocker: string): string {
  const i = blocker.indexOf(':');
  return (i >= 0 ? blocker.slice(i + 1) : blocker).replace(/\*+\s*$/, '').trim();
}
function isBlockerAnswered(blocker: string, answers: Record<string, string>): boolean {
  const q = normBlocker(blockerQuestion(blocker));
  if (!q) return false;
  return Object.entries(answers).some(([k, v]) => {
    if (!v || !String(v).trim()) return false;
    const nk = normBlocker(k);
    return nk === q || nk.includes(q) || q.includes(nk);
  });
}
export function unresolvedBlockers(app: AppRow): string[] {
  const blockers = app.submissionDecision?.formPreview?.blockers as string[] | undefined;
  if (!blockers?.length) return [];
  const answers = app.formAnswers ?? {};
  return blockers.filter((b) => !isBlockerAnswered(b, answers));
}

export const needsInfoFor = (app: AppRow) => !isAtsApp(app) && unresolvedBlockers(app).length > 0;

// Set by the worker when a USER-DECIDED send got cut short (assisted session
// expired, window failed, or a worker restart's orphan rescue - it restarts on
// every deploy). Keeps those apps in Pendientes with a retry prompt instead of
// silently melting back into the Feed backlog as if never swiped (real
// complaint 2026-07-23, confirmed in prod). Only meaningful in pending_review.
export const wasInterrupted = (app: AppRow) =>
  app.status === 'pending_review' && Boolean((app.submissionDecision as any)?.assistedInterrupted);

export function useApplicationsData() {
  const query = useQuery({
    queryKey: ['applications'],
    queryFn: getApplicationsData,
  });
  useRefreshOnFocus(query.refetch);

  const apps = query.data?.apps ?? [];
  const anySending = apps.some((a) => a.status === 'approved');

  // Same 4s poll as web (useApplicationActions.ts) while something is mid-send.
  useQuery({
    queryKey: ['applications', 'poll'],
    queryFn: getApplicationsData,
    enabled: anySending,
    refetchInterval: anySending ? 4000 : false,
  });

  const queueApps = useMemo(
    () =>
      apps
        .filter((a) => a.status === 'pending_review' && !needsInfoFor(a) && !wasInterrupted(a))
        .sort((a, b) => {
          const scoreDiff = (b.vacancy?.score ?? 0) - (a.vacancy?.score ?? 0);
          if (scoreDiff !== 0) return scoreDiff;
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        }),
    [apps],
  );
  const pendingApps = useMemo(
    () => apps.filter((a) => a.status === 'approved' || (a.status === 'pending_review' && (needsInfoFor(a) || wasInterrupted(a)))),
    [apps],
  );
  const historyApps = useMemo(
    () => apps.filter((a) => a.status !== 'pending_review' && a.status !== 'approved'),
    [apps],
  );

  return { ...query, apps, queueApps, pendingApps, historyApps, stats: query.data?.stats, settings: query.data?.settings };
}

export function useApplicationActions() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['applications'] });
  // Surfaces the real backend reason instead of failing silently - found via
  // a real report: the "Aplicar" button in application/[id].tsx did nothing
  // visible on failure (no onError anywhere caught the ApiError the client
  // already throws on non-2xx, e.g. unresolved blockers or already-approved).
  const [actionError, setActionError] = useState<string | null>(null);
  const onActionError = (err: unknown) =>
    setActionError(err instanceof ApiError ? err.message : 'No se pudo completar la accion. Intenta de nuevo.');

  const sendApprove = useMutation({
    mutationFn: (app: AppRow) => applicationAction(app.id, 'approve'),
    onSettled: invalidate,
    // A 409 with `blockers` means the silent headless attempt hit a
    // genuinely-unknown required field - per docs/APPLY-ENGINE.md §1, that
    // (plus a captcha) is one of the only two valid reasons for the user to
    // step in, and the real-browser/assisted flow is exactly how they resolve
    // it in place (same escalation the worker already does automatically for
    // a captcha). Auto-retry as assisted instead of dead-ending on approve -
    // no popup, and it lands in Pendientes ("Applica esta aplicando por ti")
    // like any other assisted send, per user decision 2026-07-21.
    onError: (err, app) => {
      if (err instanceof ApiError && err.blockers?.length) { sendAssisted.mutate(app); return; }
      onActionError(err);
    },
    onSuccess: () => setActionError(null),
  });
  const sendAssisted = useMutation({
    mutationFn: (app: AppRow) => applicationAction(app.id, 'assisted'),
    onSettled: invalidate,
    onError: onActionError,
    onSuccess: () => setActionError(null),
  });
  const markApplied = useMutation({
    mutationFn: (app: AppRow) => applicationAction(app.id, 'mark_applied'),
    onSettled: invalidate,
    onError: onActionError,
    onSuccess: () => setActionError(null),
  });
  const cancelAssisted = useMutation({
    mutationFn: (app: AppRow) => applicationAction(app.id, 'cancel_assisted'),
    onSettled: invalidate,
    onError: onActionError,
    onSuccess: () => setActionError(null),
  });
  // archive/discard back the Feed's negative swipe (discardApp below) - these
  // had NO error handling at all until now, so a failed "descartar" (backend
  // down, deploy window, etc.) looked identical to a successful one: the
  // card just vanished, same silent-failure shape as the "Aplicar" bug this
  // hook already fixed once for sendApprove/sendAssisted.
  const archive = useMutation({
    mutationFn: (app: AppRow) => applicationAction(app.id, 'archive'),
    onSettled: invalidate,
    onError: onActionError,
    onSuccess: () => setActionError(null),
  });
  const discard = useMutation({
    mutationFn: (vacancyId: string) => discardVacancy(vacancyId),
    onSettled: invalidate,
    onError: onActionError,
    onSuccess: () => setActionError(null),
  });
  const applyAnyway = useMutation({
    mutationFn: (vacancyId: string) => applyToVacancy(vacancyId),
    onSettled: invalidate,
    onError: onActionError,
    onSuccess: () => setActionError(null),
  });
  const answerBlockers = useMutation({
    mutationFn: ({ app, answers }: { app: AppRow; answers: Record<string, string> }) => saveAnswers(app.id, answers),
    onSettled: invalidate,
    onError: onActionError,
    onSuccess: () => setActionError(null),
  });

  // Returns a human-readable reason when it can NOT even attempt to apply,
  // instead of silently no-op'ing (the exact bug reported: tapping "Aplicar"
  // did nothing, with zero feedback either way).
  function applyApp(app: AppRow): string | null {
    if (app.status !== 'pending_review') return 'Esta oferta ya no esta pendiente de revision.';
    if (isLinkedIn(app)) return null; // caller routes to the WebView screen instead
    if (isRegistrationGated(app)) return 'Este sitio exige crear una cuenta propia - aplica directamente desde la oferta.';
    if (!isAtsApp(app) && needsInfoFor(app)) return 'Faltan datos para completar el formulario. Resuelvelos en Pendientes primero.';
    setActionError(null);
    // Known ATS: silent headless attempt first, only escalates to the
    // visible/assisted browser when the ATS actually shows a captcha - the
    // worker does that automatically. Generic sites go straight to assisted
    // (see the web port of this hook for the full rationale).
    if (isAtsApp(app)) sendApprove.mutate(app); else sendAssisted.mutate(app);
    return null;
  }

  function discardApp(app: AppRow) {
    if (app.mode !== 'none') archive.mutate(app);
    else discard.mutate(app.vacancyId);
  }

  return {
    applyApp,
    discardApp,
    markApplied,
    cancelAssisted,
    applyAnyway,
    answerBlockers,
    actionError,
    isApplying: sendApprove.isPending || sendAssisted.isPending,
  };
}

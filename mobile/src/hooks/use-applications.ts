import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { applicationAction, applyToVacancy, discardVacancy, getApplicationsData, saveAnswers } from '@/api/applications';
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
        .filter((a) => a.status === 'pending_review' && !needsInfoFor(a))
        .sort((a, b) => {
          const scoreDiff = (b.vacancy?.score ?? 0) - (a.vacancy?.score ?? 0);
          if (scoreDiff !== 0) return scoreDiff;
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        }),
    [apps],
  );
  const pendingApps = useMemo(
    () => apps.filter((a) => a.status === 'approved' || (a.status === 'pending_review' && needsInfoFor(a))),
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

  const sendApprove = useMutation({
    mutationFn: (app: AppRow) => applicationAction(app.id, 'approve'),
    onSettled: invalidate,
  });
  const sendAssisted = useMutation({
    mutationFn: (app: AppRow) => applicationAction(app.id, 'assisted'),
    onSettled: invalidate,
  });
  const markApplied = useMutation({
    mutationFn: (app: AppRow) => applicationAction(app.id, 'mark_applied'),
    onSettled: invalidate,
  });
  const cancelAssisted = useMutation({
    mutationFn: (app: AppRow) => applicationAction(app.id, 'cancel_assisted'),
    onSettled: invalidate,
  });
  const archive = useMutation({
    mutationFn: (app: AppRow) => applicationAction(app.id, 'archive'),
    onSettled: invalidate,
  });
  const discard = useMutation({
    mutationFn: (vacancyId: string) => discardVacancy(vacancyId),
    onSettled: invalidate,
  });
  const applyAnyway = useMutation({
    mutationFn: (vacancyId: string) => applyToVacancy(vacancyId),
    onSettled: invalidate,
  });
  const answerBlockers = useMutation({
    mutationFn: ({ app, answers }: { app: AppRow; answers: Record<string, string> }) => saveAnswers(app.id, answers),
    onSettled: invalidate,
  });

  function applyApp(app: AppRow) {
    if (!autoCapable(app)) return;
    // Known ATS: silent headless attempt first, only escalates to the
    // visible/assisted browser when the ATS actually shows a captcha - the
    // worker does that automatically. Generic sites go straight to assisted
    // (see the web port of this hook for the full rationale).
    if (isAtsApp(app)) sendApprove.mutate(app); else sendAssisted.mutate(app);
  }

  function discardApp(app: AppRow) {
    if (app.mode !== 'none') archive.mutate(app);
    else discard.mutate(app.vacancyId);
  }

  return { applyApp, discardApp, markApplied, cancelAssisted, applyAnyway, answerBlockers };
}

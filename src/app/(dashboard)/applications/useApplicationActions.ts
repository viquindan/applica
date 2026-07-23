'use client';
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { unresolvedBlockers } from '@/core/automation/blockers';
import type { AppRow } from './data';

type AttentionReason = { title: string; detail: string; cta: 'go' | 'fill' };

/**
 * Everything about DECIDING and RESOLVING an application: the apply-engine
 * contract (docs/APPLY-ENGINE.md #9) lives here once, so Feed/Pendientes/Apps
 * all drive the exact same state machine instead of three divergent copies.
 */
export function useApplicationActions(apps: AppRow[], linkedinStatusProp: 'none' | 'connected' | 'expired' = 'none') {
  const router = useRouter();
  const [discardedIds, setDiscardedIds] = useState<Set<string>>(new Set());
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [navigatingId, setNavigatingId] = useState<string | null>(null);
  const [attentionApp, setAttentionApp] = useState<AppRow | null>(null);

  const AUTO_APPLY = new Set(['greenhouse', 'lever', 'ashby', 'smartrecruiters']);
  const isAtsApp = (app: AppRow) => AUTO_APPLY.has(app.vacancy?.platform ?? '');
  const isLinkedIn = (app: AppRow) => app.vacancy?.platform === 'linkedin';
  // Sites that require creating an account before any form even exists - opening
  // an assisted window there would just strand the user on a login wall.
  const REGISTRATION_GATED_RX = /myworkdayjobs|workday|icims|taleo|brassring/i;
  const isRegistrationGated = (app: AppRow) => REGISTRATION_GATED_RX.test(app.vacancy?.url ?? '');
  // Any other site (a company's own vanilla careers page, generic form) goes
  // through the SAME real-browser assisted flow as the known ATS now, via
  // GenericAdapter - see docs/APPLY-ENGINE.md and genericAdapter.ts.
  const isGenericCapable = (app: AppRow) => !isAtsApp(app) && !isLinkedIn(app) && !isRegistrationGated(app);
  const canAuto = (app: AppRow) => (isAtsApp(app) || isGenericCapable(app)) && app.status === 'pending_review';
  const autoCapable = (app: AppRow) => app.status === 'pending_review' && canAuto(app);
  const needsInfoFor = (app: AppRow) =>
    !isAtsApp(app) &&
    unresolvedBlockers((app.submissionDecision as any)?.formPreview?.blockers, app.formAnswers as Record<string, string>).length > 0;
  // Set by the worker when a USER-DECIDED send got cut short (assisted session
  // expired, window failed, or a worker restart's orphan rescue - the worker
  // restarts on every deploy). Without this flag those apps melted back into
  // the backlog indistinguishable from never-swiped ones, and the user's
  // Pendientes "history" seemed to vanish (real complaint, 2026-07-23,
  // confirmed against prod data). Only meaningful while status is
  // pending_review - any retry/decision moves the app forward and the stale
  // flag is ignored.
  const wasInterrupted = (app: AppRow) =>
    app.status === 'pending_review' && Boolean((app.submissionDecision as any)?.assistedInterrupted);

  const live = apps.filter((a) => !discardedIds.has(a.id));
  // Feed: fresh matches to decide on (clean swipe). Apps that already need info
  // live in Pendientes instead, so a card never needs two different homes.
  // Priority = fit score; tie-broken by the OLDEST match first, so nothing sits
  // forgotten just because a newer, equally-good match showed up later.
  const queueApps = live
    .filter((a) => a.status === 'pending_review' && !needsInfoFor(a) && !wasInterrupted(a))
    .sort((a, b) => {
      const scoreDiff = (b.vacancy?.score ?? 0) - (a.vacancy?.score ?? 0);
      if (scoreDiff !== 0) return scoreDiff;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  // Pendientes: mid-flight (captcha/confirmation), blocked on missing data, or
  // a decided send that got interrupted and needs a retry.
  const pendingApps = live.filter((a) => a.status === 'approved' || (a.status === 'pending_review' && (needsInfoFor(a) || wasInterrupted(a))));
  // Apps (historial): everything that has moved past the decision stage.
  const historyApps = live.filter((a) => a.status !== 'pending_review' && a.status !== 'approved');

  function attentionReason(app: AppRow): AttentionReason {
    const url = app.vacancy?.url ?? '';
    const warns = (app.vacancy?.warnings as string[] | null) ?? [];
    if (wasInterrupted(app) && !needsInfoFor(app))
      return { title: 'Tu envío se interrumpió', detail: 'Ya habías decidido aplicar a esta vacante, pero el envío no alcanzó a completarse. Reintenta y Applica retoma desde donde quedó - tu CV y respuestas siguen listos.', cta: 'go' };
    if (warns.some((w) => /verificaci[óo]n humana|captcha/i.test(w)))
      return { title: 'Hicimos el 99%. Falta tu toque final.', detail: 'Applica hizo el trabajo pesado: tu CV a medida, carta y respuestas ya están preparadas para esta vacante. Solo queda el paso final en la oferta - esta empresa exige su propia verificación de seguridad, que completas en segundos. Ábrela y aplica.', cta: 'go' };
    if (needsInfoFor(app))
      return { title: 'Faltan algunos datos', detail: 'Esta vacante pide información adicional. Complétala y la enviamos por ti.', cta: 'fill' };
    if (isLinkedIn(app))
      return { title: 'Aplica en LinkedIn', detail: 'Te preparamos tu CV, carta y respuestas. Ábrela en LinkedIn - donde ya tienes tu sesión - y aplica en segundos.', cta: 'go' };
    if (/myworkdayjobs|workday|icims|taleo|brassring/i.test(url))
      return { title: 'Requiere que te registres', detail: 'El sitio de la empresa (Workday/iCIMS) exige crear una cuenta. Hazlo tú; tu CV y respuestas quedan listos para pegar.', cta: 'go' };
    return { title: 'Aplica en el sitio de la empresa', detail: 'El formulario está en su web. Te dejamos tu CV y respuestas preparadas para que apliques en segundos.', cta: 'go' };
  }

  function openApp(app: AppRow) {
    setNavigatingId(app.id);
    router.push(`/applications/${app.id}`);
  }

  function applyApp(app: AppRow) {
    if (!autoCapable(app)) { setAttentionApp(app); return; }
    // Known ATS: try a silent headless submit first (process_application).
    // It only falls back to opening a real, visible browser (the 'assisted'
    // flow) when the ATS actually shows a human-verification challenge - the
    // worker escalates that automatically, no second click needed. Generic
    // sites go straight to the assisted flow (GenericAdapter is real-browser
    // only, see docs/APPLY-ENGINE.md §8.1).
    if (isAtsApp(app)) sendApprove(app); else sendAssisted(app);
  }

  // Both actions used to fire-and-forget: on a 409 (unresolved blockers,
  // already-approved race, etc.) the server never queued anything, but the
  // card had already swiped away client-side with zero indication anything
  // went wrong - the user was left believing they'd applied when they hadn't.
  // Surface failures for real; router.refresh() then brings the still-
  // pending_review card back into the deck so it isn't silently lost.
  async function reportActionFailure(res: Response, verb: string) {
    const body = await res.json().catch(() => ({}));
    const detail = body?.blockers?.length ? `${body.error}\n- ${body.blockers.join('\n- ')}` : (body?.error ?? `Error ${res.status}`);
    alert(`No pudimos ${verb} esta aplicación.\n\n${detail}`);
  }

  async function sendApprove(app: AppRow) {
    setActioningId(app.id);
    try {
      const res = await fetch(`/api/applications/${app.id}/action`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'approve' }),
      });
      if (!res.ok) await reportActionFailure(res, 'aprobar');
    } finally {
      setActioningId(null);
      router.refresh();
    }
  }

  async function sendAssisted(app: AppRow) {
    setActioningId(app.id);
    try {
      const res = await fetch(`/api/applications/${app.id}/action`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'assisted' }),
      });
      if (!res.ok) await reportActionFailure(res, 'abrir');
    } finally {
      setActioningId(null);
      router.refresh();
    }
  }

  async function markApplied(app: AppRow) {
    setActioningId(app.id);
    try {
      await fetch(`/api/applications/${app.id}/action`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'mark_applied' }),
      });
    } finally {
      setActioningId(null);
      router.refresh();
    }
  }

  async function cancelAssisted(app: AppRow) {
    setActioningId(app.id);
    try {
      await fetch(`/api/applications/${app.id}/action`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cancel_assisted' }),
      });
    } finally {
      setActioningId(null);
      router.refresh();
    }
  }

  async function discardApp(app: AppRow) {
    setActioningId(app.id);
    setDiscardedIds((prev) => new Set(prev).add(app.id));
    try {
      const hasApplication = (app.mode as string) !== 'none';
      const endpoint = hasApplication
        ? { url: `/api/applications/${app.id}/action`, body: { action: 'archive' } }
        : { url: `/api/vacancies/${app.vacancyId}/discard`, body: {} };
      await fetch(endpoint.url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(endpoint.body),
      });
    } finally {
      setActioningId(null);
      router.refresh();
    }
  }

  const [liStatus, setLiStatus] = useState(linkedinStatusProp);
  useEffect(() => { setLiStatus(linkedinStatusProp); }, [linkedinStatusProp]);
  const [connectingLi, setConnectingLi] = useState(false);
  const [liMsg, setLiMsg] = useState<string | null>(null);
  const linkedinPendingCount = live.filter((a) => isLinkedIn(a) && a.status === 'pending_review').length;

  async function connectLinkedIn() {
    setConnectingLi(true);
    setLiMsg('Se abrió LinkedIn en tu navegador - inicia sesión una vez y listo.');
    try {
      const data = await fetch('/api/linkedin/session/login', { method: 'POST' }).then((r) => r.json());
      if (data.ok) { setLiStatus('connected'); setLiMsg(null); router.refresh(); }
      else if (data.reason === 'timeout') setLiMsg('No completaste el inicio de sesión a tiempo. Inténtalo de nuevo.');
      else if (data.reason === 'window_closed') setLiMsg('Cerraste la ventana antes de entrar. Inténtalo de nuevo.');
      else setLiMsg('No pudimos capturar la sesión. Inténtalo de nuevo.');
    } catch { setLiMsg('Error de red.'); }
    finally { setConnectingLi(false); }
  }

  return {
    queueApps, pendingApps, historyApps,
    actioningId, navigatingId, attentionApp, setAttentionApp, attentionReason,
    applyApp, discardApp, markApplied, cancelAssisted, openApp,
    isAtsApp, isGenericCapable, autoCapable, needsInfoFor,
    liStatus, connectingLi, liMsg, connectLinkedIn, linkedinPendingCount,
  };
}

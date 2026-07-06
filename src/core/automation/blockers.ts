/**
 * Helpers for the "additional info requested" flow.
 *
 * When an application can't be auto-sent because a required form field has no
 * answer (e.g. a question we don't have data for - "Do you have a spouse?"), the
 * worker stores it as a blocker string. The user fills it in, and once the
 * matching answer exists in formAnswers the blocker is considered resolved.
 *
 * Blocker format: "Falta completar el campo obligatorio: <Question>*"
 */

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').replace(/\*+\s*$/, '').trim();
}

/** Extract the human question from a blocker string. */
export function blockerQuestion(blocker: string): string {
  const i = blocker.indexOf(':');
  return (i >= 0 ? blocker.slice(i + 1) : blocker).replace(/\*+\s*$/, '').trim();
}

function isAnswered(blocker: string, answers: Record<string, string>): boolean {
  const q = norm(blockerQuestion(blocker));
  if (!q) return false;
  return Object.entries(answers).some(([k, v]) => {
    if (!v || !String(v).trim()) return false;
    const nk = norm(k);
    return nk === q || nk.includes(q) || q.includes(nk);
  });
}

/** Blockers that are still unanswered after considering current formAnswers. */
export function unresolvedBlockers(
  blockers: string[] | undefined | null,
  answers: Record<string, string> | undefined | null,
): string[] {
  if (!blockers?.length) return [];
  return blockers.filter((b) => !isAnswered(b, answers ?? {}));
}

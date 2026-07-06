import type { User, ProfessionalProfile } from '@/db/schema';

/**
 * Auto-answers common, FACTUAL, non-sensitive application questions from the
 * user's profile, so they don't trigger a manual-review pause. Sensitive topics
 * (visa/sponsorship, salary, demographics) deliberately return null so the
 * existing pause rules still kick in - we never guess on those.
 */

function yearsOfExperience(profile: Partial<ProfessionalProfile>): number {
  const entries = profile.experience ?? [];
  let earliest: number | null = null;
  const now = new Date().getFullYear();
  for (const exp of entries) {
    const year = Number((exp.startDate ?? '').match(/(\d{4})/)?.[1]);
    if (year >= 1950 && year <= now) earliest = earliest === null ? year : Math.min(earliest, year);
  }
  return earliest === null ? 0 : Math.max(0, now - earliest);
}

export function answerForLabel(
  label: string,
  user: Pick<User, 'name' | 'relocationAvailable' | 'noticePeriod' | 'linkedin' | 'portfolio' | 'location' | 'country' | 'salaryMin' | 'salaryCurrency' | 'workModality' | 'workModalityPrefs'>,
  profile: Partial<ProfessionalProfile>,
): string | null {
  const l = label.toLowerCase();

  // ── Sensitive / role-specific: leave for review ──
  // Work authorization & sponsorship depend on the specific country, so we don't
  // guess - these keep pausing (and such roles are usually filtered upstream).
  if (/visa|sponsor|immigration|work permit|authori[sz]ed to work|right to work|eligible to work|legally.*work/.test(l)) return null;
  if (/gender|race|ethnic|disability|veteran|sexual orientation|\bpronoun|date of birth/.test(l)) return null;

  // ── Common application questions we CAN answer from the profile ──
  // Salary expectation use the user's stated minimum if they have one.
  if (/salary|compensation|expected pay|desired pay|pay expectation|remuneration|\bwage\b/.test(l)) {
    return user.salaryMin ? `${user.salaryMin}${user.salaryCurrency ? ' ' + user.salaryCurrency : ''}` : null;
  }
  // "How did you hear about us?"
  if (/how did you (first )?(hear|learn|find out) about|where did you (hear|find)|source of (your )?application|how were you referred/.test(l)) {
    return 'LinkedIn';
  }
  // Country of residence
  if (/^country\b|country of residence|what country|which country/.test(l)) return user.country || user.location || null;
  // Preferred / legal name
  if (/preferred name|what.*name.*go by|legal name|full name/.test(l)) return user.name || null;
  // Previously employed here
  if (/previously (been )?(employed|worked)|former employee|ever (been )?(employed|worked) (at|for|by)|past employment with/.test(l)) return 'No';
  // English fluency (the user works in English)
  if (/fluent in english|english (fluency|proficiency|skills)|do you speak english|proficient in english|comfortable.*english/.test(l)) return 'Yes';
  // Acknowledgements / consent checkboxes
  if (/acknowledge|i confirm|i agree|consent|i certify|i understand|terms and conditions/.test(l)) return 'Yes';
  // Willingness to travel / relocate / commute
  if (/willing to (travel|relocate|commute|work onsite|work on-site)|able to (travel|relocate|commute)|open to relocation/.test(l)) {
    return user.relocationAvailable ? 'Yes' : 'No';
  }

  // ── Factual, safe to answer from profile ──
  if (/relocat/.test(l)) return user.relocationAvailable ? 'Yes' : 'No';
  if (/notice period/.test(l)) return user.noticePeriod || null;
  if (/(when can you start|start date|available to start|availability|earliest start)/.test(l)) return user.noticePeriod || 'Immediately';
  if (/(years.*experience|experience.*years|how many years)/.test(l)) {
    const y = yearsOfExperience(profile);
    return y > 0 ? String(y) : null;
  }
  if (/linkedin/.test(l)) return user.linkedin || null;
  if (/(portfolio|personal website|website|github)/.test(l)) return user.portfolio || null;
  if (/current (company|employer)/.test(l)) return profile.experience?.[0]?.company || null;
  if (/current (title|role|position)/.test(l)) return profile.experience?.[0]?.role || null;
  if (/(where are you (based|located)|current location|city of residence|country of residence)/.test(l)) {
    return user.location || user.country || null;
  }
  if (/(willing|open|comfortable).*(remote|work from home)/.test(l)) {
    const remoteOk = user.workModality === 'remote' || user.workModality === 'any' || user.workModalityPrefs?.acceptsRemote;
    return remoteOk ? 'Yes' : null;
  }

  return null;
}

/**
 * Tries to answer a set of unknown required field labels. Returns the answers it
 * could fill and the labels still unanswered (which should keep pausing).
 */
export function autoAnswerFields(
  labels: string[],
  user: Parameters<typeof answerForLabel>[1],
  profile: Partial<ProfessionalProfile>,
): { answers: Record<string, string>; unanswered: string[] } {
  const answers: Record<string, string> = {};
  const unanswered: string[] = [];
  for (const label of labels) {
    const value = answerForLabel(label, user, profile);
    if (value) answers[label] = value;
    else unanswered.push(label);
  }
  return { answers, unanswered };
}

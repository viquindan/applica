import { UserSettings, PlatformSetting } from '@/db/schema';

export interface SubmissionDecision {
  applicationId: string;
  canAutoSubmit: boolean;
  requiresReview: boolean;
  blockingReasons: string[];
  warnings: string[];
  nextAction: 'queue_for_review' | 'skip' | 'pause';
}

export interface SubmissionContext {
  applicationId: string;
  score: number;
  platformName: string;
  globalSettings: UserSettings;
  platformSettings?: PlatformSetting;
  hasMissingFields: boolean;
  hasSalaryAmbiguity: boolean;
  hasImmigrationAmbiguity: boolean;
  hasCustomQuestions: boolean;
  hasCaptcha: boolean;
  hasLoginWall: boolean;
  truthfulnessCheckPassed: boolean;
  dailyCount: number;
  weeklyCount: number;
  redFlags: string[];
}

export function evaluateSubmission(ctx: SubmissionContext): SubmissionDecision {
  const blocking: string[] = [];
  const warnings: string[] = [...ctx.redFlags];
  const s = ctx.globalSettings;
  const ps = ctx.platformSettings;

  // Rule 1: Global mode off - automation disabled entirely
  if (s.globalAutomationMode === 'off') {
    return { applicationId: ctx.applicationId, canAutoSubmit: false, requiresReview: false, blockingReasons: ['Modo de automatización global desactivado'], warnings, nextAction: 'skip' };
  }

  // Rule 3: Platform auto_apply disabled
  if (!ps?.autoApplyEnabled) {
    blocking.push('La plataforma no tiene auto-apply habilitado');
    return { applicationId: ctx.applicationId, canAutoSubmit: false, requiresReview: true, blockingReasons: blocking, warnings, nextAction: 'queue_for_review' };
  }

  // Rule 4: Score below threshold
  const minScore = ps?.minimumScoreToApply ?? s.minScoreToApply ?? 70;
  if (ctx.score < minScore) {
    blocking.push(`Score ${ctx.score} por debajo del mínimo ${minScore}`);
    return { applicationId: ctx.applicationId, canAutoSubmit: false, requiresReview: false, blockingReasons: blocking, warnings, nextAction: 'skip' };
  }

  // Rule 5: Missing fields
  if (ctx.hasMissingFields && s.pauseOnMissingInformation) {
    blocking.push('Información requerida faltante');
    return { applicationId: ctx.applicationId, canAutoSubmit: false, requiresReview: true, blockingReasons: blocking, warnings, nextAction: 'pause' };
  }

  // Rule 6: Salary ambiguity
  if (ctx.hasSalaryAmbiguity && s.pauseOnSalaryQuestions) {
    blocking.push('Pregunta salarial detectada');
    return { applicationId: ctx.applicationId, canAutoSubmit: false, requiresReview: true, blockingReasons: blocking, warnings, nextAction: 'pause' };
  }

  // Rule 7: Immigration ambiguity
  if (ctx.hasImmigrationAmbiguity && s.pauseOnImmigrationQuestions) {
    blocking.push('Pregunta migratoria detectada');
    return { applicationId: ctx.applicationId, canAutoSubmit: false, requiresReview: true, blockingReasons: blocking, warnings, nextAction: 'pause' };
  }

  // Rule 8: Custom questions
  if (ctx.hasCustomQuestions && s.pauseOnCustomQuestions) {
    blocking.push('Preguntas personalizadas detectadas sin respuesta predefinida');
    return { applicationId: ctx.applicationId, canAutoSubmit: false, requiresReview: true, blockingReasons: blocking, warnings, nextAction: 'pause' };
  }

  // Rule 9: CAPTCHA
  if (ctx.hasCaptcha && s.pauseOnCaptcha) {
    blocking.push('CAPTCHA detectado');
    return { applicationId: ctx.applicationId, canAutoSubmit: false, requiresReview: true, blockingReasons: blocking, warnings, nextAction: 'pause' };
  }

  // Rule 10: Login wall
  if (ctx.hasLoginWall && s.pauseOnLogin) {
    blocking.push('Muro de login detectado');
    return { applicationId: ctx.applicationId, canAutoSubmit: false, requiresReview: true, blockingReasons: blocking, warnings, nextAction: 'pause' };
  }

  // Rule 11: Truthfulness
  if (!ctx.truthfulnessCheckPassed) {
    blocking.push('El CV adaptado no pasó la verificación de veracidad');
    return { applicationId: ctx.applicationId, canAutoSubmit: false, requiresReview: true, blockingReasons: blocking, warnings, nextAction: 'queue_for_review' };
  }

  // Rule 12: Daily/weekly limits
  const maxDay = ps?.maxApplicationsPerDay ?? s.maxApplicationsPerDay ?? 10;
  const maxWeek = ps?.maxApplicationsPerWeek ?? s.maxApplicationsPerWeek ?? 40;
  if (ctx.dailyCount >= maxDay) {
    blocking.push(`Límite diario alcanzado (${maxDay})`);
    return { applicationId: ctx.applicationId, canAutoSubmit: false, requiresReview: false, blockingReasons: blocking, warnings, nextAction: 'skip' };
  }
  if (ctx.weeklyCount >= maxWeek) {
    blocking.push(`Límite semanal alcanzado (${maxWeek})`);
    return { applicationId: ctx.applicationId, canAutoSubmit: false, requiresReview: false, blockingReasons: blocking, warnings, nextAction: 'skip' };
  }

  // All clear - queued for the user's swipe. Nothing skips pending_review:
  // the swipe IS the submit authorization, there is no auto-submit path
  // before it (see docs/DECISIONS.md).
  return { applicationId: ctx.applicationId, canAutoSubmit: false, requiresReview: true, blockingReasons: [], warnings, nextAction: 'queue_for_review' };
}

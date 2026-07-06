import { ApplicationFormPreview, InspectApplicationContext, PlatformAdapter } from '../platforms/PlatformAdapter';

export async function inspectApplicationForm(
  adapter: PlatformAdapter,
  url: string,
  context: InspectApplicationContext,
): Promise<ApplicationFormPreview> {
  if (!adapter.inspectApplicationFormPlaywright) {
    // No form pre-inspection for this ATS. Do NOT emit a blocker here - a blocker
    // surfaces in the UI as a fake "missing data" question with an empty text box
    // the user can't meaningfully answer. The form is filled live at submit time
    // by the adapter's applyPlaywright (or applied manually). Just note it.
    return {
      inspectedAt: new Date().toISOString(),
      fields: [],
      blockers: [],
      warnings: [`El formulario de ${adapter.name} se completa al momento de aplicar (sin vista previa).`],
      captchaDetected: false,
    };
  }

  return adapter.inspectApplicationFormPlaywright(url, context);
}

export function mergeDecisionWithPreview<T extends Record<string, any> | null | undefined>(
  decision: T,
  formPreview: ApplicationFormPreview,
) {
  return {
    ...(decision ?? {}),
    formPreview,
  };
}


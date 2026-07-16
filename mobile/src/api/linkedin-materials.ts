import { api } from './client';

export type LinkedInMaterials = {
  profile?: { firstName?: string; lastName?: string; email?: string; phone?: string };
  answers?: Record<string, string>;
  resume?: { url?: string; filename?: string };
  coverLetter?: string;
};

// Reused as-is from the browser extension's endpoint (already bearer-authed,
// already returns profile + merged formAnswers + resume + cover letter) -
// see docs/APPLY-ENGINE.md and the mobile plan for why no new route was built.
export const getLinkedInMaterials = (jobUrl: string) =>
  api.get<LinkedInMaterials>(`/api/extension/materials?url=${encodeURIComponent(jobUrl)}`);

import { api } from './client';

export type LiveSession = { live: boolean; url?: string };

export const getLiveSession = (applicationId: string) =>
  api.get<LiveSession>(`/api/applications/${applicationId}/live-session`);

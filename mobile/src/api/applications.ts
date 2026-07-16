import { api } from './client';
import type { ApplicationsData } from '@/types';

export const getApplicationsData = () => api.get<ApplicationsData>('/api/mobile/applications');

export type AppAction = 'approve' | 'assisted' | 'cancel_assisted' | 'mark_applied' | 'skip' | 'archive';

export const applicationAction = (id: string, action: AppAction) =>
  api.post<{ success: boolean; status?: string; error?: string }>(`/api/applications/${id}/action`, { action });

export const discardVacancy = (vacancyId: string) =>
  api.post<{ success: boolean }>(`/api/vacancies/${vacancyId}/discard`);

export const applyToVacancy = (vacancyId: string) =>
  api.post<{ success: boolean; applicationId: string }>(`/api/vacancies/${vacancyId}/apply`);

export const saveAnswers = (id: string, answers: Record<string, string>) =>
  api.put<{ success: boolean }>(`/api/applications/${id}/answers`, { answers });

// Queues a REAL backend search (pg-boss search_vacancies), not a cache refetch.
export const runSearch = () => api.post<{ success: boolean; message?: string }>('/api/search/run');

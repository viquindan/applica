import { api } from './client';

export type SwipeDecision = 'positive' | 'negative';

export const postSwipeFeedback = (input: {
  vacancyId: string;
  applicationId?: string;
  decision: SwipeDecision;
  reason: string;
}) => api.post<{ success: boolean }>('/api/swipe-feedback', input);

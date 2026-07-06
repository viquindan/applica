import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import type { planTypeEnum } from '@/db/schema';

export type PlanType = typeof planTypeEnum.enumValues[number];

export interface PlanLimits {
  maxMonthlyApplications: number;
  canUseLinkedInScraper: boolean;
  canUseDeepTailoring: boolean;
}

export const PLAN_LIMITS: Record<PlanType, PlanLimits> = {
  free: {
    maxMonthlyApplications: 30,
    canUseLinkedInScraper: false,
    canUseDeepTailoring: false,
  },
  pro: {
    maxMonthlyApplications: 150,
    canUseLinkedInScraper: true,
    canUseDeepTailoring: true,
  },
  unlimited: {
    maxMonthlyApplications: 999999,
    canUseLinkedInScraper: true,
    canUseDeepTailoring: true,
  },
};

export async function getUserPlanLimits(userId: string): Promise<PlanLimits> {
  const [user] = await db.select({ tier: users.subscriptionTier }).from(users).where(eq(users.id, userId));
  const tier = user?.tier ?? 'free';
  return PLAN_LIMITS[tier];
}

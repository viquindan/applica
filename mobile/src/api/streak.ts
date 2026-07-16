import * as SecureStore from 'expo-secure-store';

const STREAK_KEY = 'applica_streak';
const LAST_OPEN_KEY = 'applica_streak_last_open';

function todayStr(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD, device-local via toISOString is fine for a day-granularity streak
}
function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

/**
 * Local-only daily-open streak (no backend - this is presence/engagement, not
 * a business fact worth persisting server-side or syncing across devices).
 * Bumps once per calendar day: +1 if opened on the very next day after the
 * last one, reset to 1 if a day was skipped, unchanged if already opened today.
 */
export async function bumpStreak(): Promise<number> {
  const today = todayStr();
  const [lastOpen, storedCount] = await Promise.all([
    SecureStore.getItemAsync(LAST_OPEN_KEY),
    SecureStore.getItemAsync(STREAK_KEY),
  ]);
  const count = Number(storedCount) || 0;

  if (lastOpen === today) return count || 1;

  const gap = lastOpen ? daysBetween(lastOpen, today) : null;
  const next = gap === 1 ? count + 1 : 1;

  await Promise.all([
    SecureStore.setItemAsync(LAST_OPEN_KEY, today),
    SecureStore.setItemAsync(STREAK_KEY, String(next)),
  ]);
  return next;
}

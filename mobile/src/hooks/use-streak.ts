import { useEffect, useState } from 'react';

import { bumpStreak } from '@/api/streak';

export function useStreak() {
  const [streak, setStreak] = useState<number | null>(null);
  useEffect(() => {
    bumpStreak().then(setStreak);
  }, []);
  return streak;
}

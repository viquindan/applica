// Simple XP model, computed client-side from data that already exists
// (streak days, lifetime submitted applications) - no new backend needed.
// Titles are deliberately about the SEARCH, not about spending time in the
// app, since the honest reward here is progress toward a real job, not
// engagement for its own sake.
const LEVELS = [
  { title: 'Buscador Novato', minXp: 0 },
  { title: 'Explorador de Ofertas', minXp: 100 },
  { title: 'Cazador de Ofertas', minXp: 300 },
  { title: 'Casi ahi', minXp: 600 },
  { title: 'Veterano de la Busqueda', minXp: 1000 },
] as const;

export function computeXp(streakDays: number, applicationsSubmitted: number): number {
  return streakDays * 10 + applicationsSubmitted * 5;
}

export function computeLevel(xp: number) {
  let levelIndex = 0;
  for (let i = 0; i < LEVELS.length; i++) {
    if (xp >= LEVELS[i].minXp) levelIndex = i;
  }
  const current = LEVELS[levelIndex];
  const next = LEVELS[levelIndex + 1] ?? null;
  return {
    level: levelIndex + 1,
    title: current.title,
    xp,
    xpInLevel: xp - current.minXp,
    xpToNext: next ? next.minXp - current.minXp : null,
    xpForNext: next?.minXp ?? null,
    isMax: !next,
  };
}

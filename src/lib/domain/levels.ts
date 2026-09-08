export type LevelInfo = { level: number; title: string; minXp: number; nextAtXp: number | null };

export const LEVELS: ReadonlyArray<{ level: number; minXp: number; title: string }> = [
  { level: 1, minXp: 0, title: 'Day one energy' },
  { level: 2, minXp: 100, title: 'Getting started' },
  { level: 3, minXp: 250, title: 'Finding your rhythm' },
  { level: 4, minXp: 450, title: 'Building momentum' },
  { level: 5, minXp: 700, title: 'Locked in' },
  { level: 6, minXp: 1000, title: 'Reset in motion' },
  { level: 7, minXp: 1400, title: 'This is who you are now' },
];

export function levelForXp(xp: number): LevelInfo {
  const safeXp = Number.isFinite(xp) ? Math.max(0, Math.floor(xp)) : 0;
  let index = 0;
  for (let i = 0; i < LEVELS.length; i += 1) {
    if (safeXp >= LEVELS[i].minXp) index = i;
  }
  const current = LEVELS[index];
  const next = LEVELS[index + 1] ?? null;
  return { level: current.level, title: current.title, minXp: current.minXp, nextAtXp: next?.minXp ?? null };
}

export type UnlockRecord = { rewardKey: string; unlockedAt: string };
export type AppTheme = 'default' | 'dawn' | 'deep';
export type CoachPack = 'default' | 'grit' | 'calm';
export type Appearance = { theme: AppTheme; coachPack: CoachPack };

const THEMES: Record<string, AppTheme> = { theme_dawn: 'dawn', theme_deep: 'deep' };
const PACKS: Record<string, CoachPack> = { coach_pack_grit: 'grit', coach_pack_calm: 'calm' };

function latest(unlocks: UnlockRecord[], map: Record<string, string>): string | undefined {
  const matches = unlocks
    .filter((u) => u.rewardKey in map)
    .sort((a, b) => a.unlockedAt.localeCompare(b.unlockedAt));
  return matches.length === 0 ? undefined : matches[matches.length - 1].rewardKey;
}

export function appearanceFromUnlocks(unlocks: UnlockRecord[]): Appearance {
  const themeKey = latest(unlocks, THEMES);
  const packKey = latest(unlocks, PACKS);
  return {
    theme: themeKey ? THEMES[themeKey] : 'default',
    coachPack: packKey ? PACKS[packKey] : 'default',
  };
}

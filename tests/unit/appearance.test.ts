import { describe, it, expect } from 'vitest';
import { appearanceFromUnlocks, type UnlockRecord } from '@/lib/appearance';
import { coachLineForDay } from '@/content/coach';

function unlock(rewardKey: string, unlockedAt: string): UnlockRecord {
  return { rewardKey, unlockedAt };
}

describe('appearanceFromUnlocks', () => {
  it('keeps defaults when nothing is owned', () => {
    expect(appearanceFromUnlocks([])).toEqual({ theme: 'default', coachPack: 'default' });
  });

  it('applies an owned theme and pack', () => {
    expect(
      appearanceFromUnlocks([
        unlock('theme_dawn', '2026-09-01T00:00:00Z'),
        unlock('coach_pack_grit', '2026-09-01T00:00:00Z'),
        unlock('badge_finisher', '2026-09-01T00:00:00Z'),
      ]),
    ).toEqual({ theme: 'dawn', coachPack: 'grit' });
  });

  it('uses the most recently unlocked item of each type', () => {
    expect(
      appearanceFromUnlocks([
        unlock('theme_dawn', '2026-09-01T00:00:00Z'),
        unlock('theme_deep', '2026-09-08T00:00:00Z'),
        unlock('coach_pack_grit', '2026-09-08T00:00:00Z'),
        unlock('coach_pack_calm', '2026-09-01T00:00:00Z'),
      ]),
    ).toEqual({ theme: 'deep', coachPack: 'grit' });
  });
});

describe('coach pack copy', () => {
  const day = { completed: 0, scheduled: 4 };

  it('keeps default copy unchanged', () => {
    expect(coachLineForDay(1, day)).toMatch(/Nothing ticked yet/);
  });

  it('uses blunter grit copy for the same day state', () => {
    const grit = coachLineForDay(1, day, 'grit');
    expect(grit).not.toBe(coachLineForDay(1, day, 'default'));
    expect(grit).toMatch(/easiest/i);
  });

  it('uses gentler calm copy for the same day state', () => {
    const calm = coachLineForDay(1, day, 'calm');
    expect(calm).not.toBe(coachLineForDay(1, day, 'default'));
    expect(calm).toMatch(/gentle/i);
  });
});

import { describe, it, expect } from 'vitest';
import { levelForXp } from '@/lib/domain/levels';
import { AWARDS } from '@/lib/domain/constants';

describe('levelForXp', () => {
  it('starts everyone at level 1', () => {
    expect(levelForXp(0)).toEqual({ level: 1, title: 'Day one energy', minXp: 0, nextAtXp: 100 });
  });

  it('holds the level until the next threshold is reached', () => {
    expect(levelForXp(99).level).toBe(1);
    expect(levelForXp(100).level).toBe(2);
    expect(levelForXp(249).level).toBe(2);
    expect(levelForXp(250).level).toBe(3);
  });

  it('names level 3 with the coach flavour from the spec', () => {
    expect(levelForXp(250).title).toBe('Finding your rhythm');
  });

  it('caps at the top level with no next threshold', () => {
    expect(levelForXp(99_999)).toEqual({
      level: 7, title: 'This is who you are now', minXp: 1400, nextAtXp: null,
    });
  });

  it('treats negative XP as level 1 rather than throwing', () => {
    expect(levelForXp(-5).level).toBe(1);
  });
});

describe('award amounts', () => {
  it('orders check-in below full day below reflection', () => {
    expect(AWARDS.habit_check_in.xp).toBeLessThan(AWARDS.full_day_bonus.xp);
    expect(AWARDS.full_day_bonus.xp).toBeLessThan(AWARDS.weekly_reflection.xp);
    expect(AWARDS.habit_check_in.points).toBeLessThan(AWARDS.full_day_bonus.points);
    expect(AWARDS.full_day_bonus.points).toBeLessThan(AWARDS.weekly_reflection.points);
  });
});

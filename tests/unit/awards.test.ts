import { describe, it, expect } from 'vitest';
import { awardsForCheckIn, awardsForReflection, applyAwards, type Totals } from '@/lib/domain/awards';
import { AWARDS } from '@/lib/domain/constants';

const baseCheckIn = {
  programmeHabitId: 10,
  dayIndex: 3,
  scheduled: 4,
  completedAfter: 1,
  alreadyAwardedHabitIds: [] as number[],
  fullDayAlreadyAwarded: false,
};

describe('awardsForCheckIn', () => {
  it('awards the check-in amount for a newly completed habit', () => {
    const awards = awardsForCheckIn(baseCheckIn);
    expect(awards).toEqual([
      { kind: 'habit_check_in', dayIndex: 3, programmeHabitId: 10, xp: 10, points: 2 },
    ]);
  });

  it('awards nothing when this habit was already awarded today', () => {
    expect(awardsForCheckIn({ ...baseCheckIn, alreadyAwardedHabitIds: [10] })).toEqual([]);
  });

  it('adds the full-day bonus when the last habit of the day is ticked', () => {
    const awards = awardsForCheckIn({ ...baseCheckIn, completedAfter: 4 });
    expect(awards).toHaveLength(2);
    expect(awards[1]).toEqual({
      kind: 'full_day_bonus', dayIndex: 3, programmeHabitId: null, xp: 25, points: 5,
    });
  });

  it('does not repeat the full-day bonus', () => {
    const awards = awardsForCheckIn({
      ...baseCheckIn, completedAfter: 4, alreadyAwardedHabitIds: [10], fullDayAlreadyAwarded: true,
    });
    expect(awards).toEqual([]);
  });

  it('still grants the full-day bonus when the final habit was already awarded', () => {
    // Re-ticking a habit that was un-ticked: no check-in award, but the day is
    // now complete and the bonus has not been paid.
    const awards = awardsForCheckIn({ ...baseCheckIn, completedAfter: 4, alreadyAwardedHabitIds: [10] });
    expect(awards).toEqual([
      { kind: 'full_day_bonus', dayIndex: 3, programmeHabitId: null, xp: 25, points: 5 },
    ]);
  });

  it('gives no full-day bonus when nothing is scheduled', () => {
    expect(awardsForCheckIn({ ...baseCheckIn, scheduled: 0, completedAfter: 0 })).toHaveLength(1);
  });
});

describe('awardsForReflection', () => {
  it('awards the reflection amount once', () => {
    expect(awardsForReflection(7, false)).toEqual([
      { kind: 'weekly_reflection', dayIndex: 7, programmeHabitId: null, xp: 50, points: 15 },
    ]);
  });

  it('awards nothing on a re-save', () => {
    expect(awardsForReflection(7, true)).toEqual([]);
  });

  it('rejects a non-reflection day', () => {
    expect(() => awardsForReflection(8, false)).toThrow(/reflection day/i);
  });
});

describe('applyAwards', () => {
  const totals: Totals = { xpTotal: 240, level: 2, pointsEarnedTotal: 48, pointsBalance: 8 };

  it('adds XP and points and recalculates the level', () => {
    const next = applyAwards(totals, [
      { kind: 'habit_check_in', dayIndex: 1, programmeHabitId: 1, xp: 10, points: 2 },
    ]);
    expect(next).toEqual({ xpTotal: 250, level: 3, pointsEarnedTotal: 50, pointsBalance: 10 });
  });

  it('is a no-op for an empty award list', () => {
    expect(applyAwards(totals, [])).toEqual(totals);
  });

  it('never reduces XP', () => {
    const next = applyAwards(totals, [
      { kind: 'habit_check_in', dayIndex: 1, programmeHabitId: 1, xp: AWARDS.habit_check_in.xp, points: 2 },
    ]);
    expect(next.xpTotal).toBeGreaterThan(totals.xpTotal);
  });

  it('leaves an existing spent balance intact', () => {
    const spent: Totals = { xpTotal: 500, level: 4, pointsEarnedTotal: 100, pointsBalance: 20 };
    const next = applyAwards(spent, [
      { kind: 'weekly_reflection', dayIndex: 14, programmeHabitId: null, xp: 50, points: 15 },
    ]);
    expect(next.pointsBalance).toBe(35);
    expect(next.pointsEarnedTotal).toBe(115);
  });
});

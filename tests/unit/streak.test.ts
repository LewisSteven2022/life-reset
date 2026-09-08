import { describe, it, expect } from 'vitest';
import {
  requiredForStreak, dayQualifies, settleDay, applyOpenDay, rollForward,
  type StreakState,
} from '@/lib/domain/streak';

const fresh: StreakState = {
  streakCurrent: 0, streakLongest: 0, shieldCount: 0, lastCountedDay: 0, lastSettledDay: 0,
};

describe('requiredForStreak', () => {
  it('is half the scheduled habits, rounded up', () => {
    expect(requiredForStreak(2)).toBe(1);
    expect(requiredForStreak(3)).toBe(2);
    expect(requiredForStreak(4)).toBe(2);
    expect(requiredForStreak(5)).toBe(3);
    expect(requiredForStreak(8)).toBe(4);
  });

  it('requires at least one when any habits exist', () => {
    expect(requiredForStreak(1)).toBe(1);
  });

  it('requires nothing when no habits are scheduled', () => {
    expect(requiredForStreak(0)).toBe(0);
  });
});

describe('dayQualifies', () => {
  it('qualifies at exactly the threshold', () => {
    expect(dayQualifies(4, 2)).toBe(true);
  });

  it('does not qualify below the threshold', () => {
    expect(dayQualifies(4, 1)).toBe(false);
    expect(dayQualifies(3, 1)).toBe(false);
  });

  it('does not qualify on zero completions when habits exist', () => {
    expect(dayQualifies(1, 0)).toBe(false);
  });
});

describe('settleDay', () => {
  it('increments the streak on a qualifying day', () => {
    const next = settleDay({ ...fresh, streakCurrent: 3, streakLongest: 3 }, { dayIndex: 4, scheduled: 4, completed: 2 });
    expect(next.streakCurrent).toBe(4);
    expect(next.streakLongest).toBe(4);
    expect(next.lastCountedDay).toBe(4);
    expect(next.lastSettledDay).toBe(4);
  });

  it('awards a shield on a 100% day when none is held', () => {
    const next = settleDay(fresh, { dayIndex: 1, scheduled: 3, completed: 3 });
    expect(next.shieldCount).toBe(1);
  });

  it('never grants a second shield', () => {
    const next = settleDay({ ...fresh, shieldCount: 1 }, { dayIndex: 1, scheduled: 3, completed: 3 });
    expect(next.shieldCount).toBe(1);
  });

  it('resets the streak on a miss with no shield', () => {
    const next = settleDay({ ...fresh, streakCurrent: 6, streakLongest: 6 }, { dayIndex: 7, scheduled: 4, completed: 1 });
    expect(next.streakCurrent).toBe(0);
    expect(next.shieldCount).toBe(0);
    expect(next.streakLongest).toBe(6);
  });

  it('consumes the shield on a miss and preserves the streak without incrementing it', () => {
    const before = { ...fresh, streakCurrent: 6, streakLongest: 6, shieldCount: 1 };
    const next = settleDay(before, { dayIndex: 7, scheduled: 4, completed: 0 });
    expect(next.streakCurrent).toBe(6);
    expect(next.shieldCount).toBe(0);
    expect(next.lastCountedDay).toBe(0);
  });

  it('leaves the streak untouched on a day with no scheduled habits', () => {
    const before = { ...fresh, streakCurrent: 5, streakLongest: 5 };
    const next = settleDay(before, { dayIndex: 3, scheduled: 0, completed: 0 });
    expect(next.streakCurrent).toBe(5);
    expect(next.lastSettledDay).toBe(3);
  });

  it('does not double-count a day already counted while it was open', () => {
    const before = { ...fresh, streakCurrent: 1, streakLongest: 1, lastCountedDay: 1 };
    const next = settleDay(before, { dayIndex: 1, scheduled: 2, completed: 2 });
    expect(next.streakCurrent).toBe(1);
  });
});

describe('applyOpenDay', () => {
  it('increments the streak as soon as today qualifies', () => {
    const next = applyOpenDay({ ...fresh, streakCurrent: 2, streakLongest: 2 }, { dayIndex: 3, scheduled: 4, completed: 2 });
    expect(next.streakCurrent).toBe(3);
    expect(next.lastCountedDay).toBe(3);
  });

  it('never resets the streak for a day still in progress', () => {
    const before = { ...fresh, streakCurrent: 5, streakLongest: 5 };
    const next = applyOpenDay(before, { dayIndex: 6, scheduled: 4, completed: 0 });
    expect(next.streakCurrent).toBe(5);
    expect(next.shieldCount).toBe(0);
  });

  it('never settles the day', () => {
    const next = applyOpenDay(fresh, { dayIndex: 3, scheduled: 2, completed: 2 });
    expect(next.lastSettledDay).toBe(0);
  });

  it('awards the shield immediately on a 100% day', () => {
    const next = applyOpenDay(fresh, { dayIndex: 3, scheduled: 2, completed: 2 });
    expect(next.shieldCount).toBe(1);
  });

  it('is idempotent when called twice', () => {
    const once = applyOpenDay(fresh, { dayIndex: 3, scheduled: 2, completed: 2 });
    expect(applyOpenDay(once, { dayIndex: 3, scheduled: 2, completed: 2 })).toEqual(once);
  });
});

describe('rollForward', () => {
  const days = (spec: Array<[number, number, number]>) =>
    spec.map(([dayIndex, scheduled, completed]) => ({ dayIndex, scheduled, completed }));

  it('builds a streak across settled days and today', () => {
    const next = rollForward(fresh, days([[1, 4, 4], [2, 4, 2], [3, 4, 3]]), 3);
    expect(next.streakCurrent).toBe(3);
    expect(next.lastSettledDay).toBe(2);
    expect(next.lastCountedDay).toBe(3);
    expect(next.shieldCount).toBe(1);
  });

  it('spends the shield on the first settled miss', () => {
    const next = rollForward(fresh, days([[1, 4, 4], [2, 4, 0], [3, 4, 4]]), 3);
    expect(next.streakCurrent).toBe(2); // day 1 counted, day 2 shielded, day 3 counted
    expect(next.shieldCount).toBe(1);   // day 3 was 100%, so a new shield is earned
  });

  it('resets after a second unshielded miss', () => {
    const next = rollForward(fresh, days([[1, 4, 2], [2, 4, 0], [3, 4, 2]]), 3);
    expect(next.streakCurrent).toBe(1);
    expect(next.streakLongest).toBe(1);
  });

  it('skips days already settled', () => {
    const before = { ...fresh, streakCurrent: 2, streakLongest: 2, lastCountedDay: 2, lastSettledDay: 2 };
    const next = rollForward(before, days([[1, 4, 4], [2, 4, 4], [3, 4, 4]]), 3);
    expect(next.streakCurrent).toBe(3);
    expect(next.lastSettledDay).toBe(2);
  });

  it('produces the same state when run twice with unchanged inputs', () => {
    const input = days([[1, 4, 4], [2, 4, 1], [3, 4, 2]]);
    const once = rollForward(fresh, input, 3);
    expect(rollForward(once, input, 3)).toEqual(once);
  });
});

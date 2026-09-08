import { AWARDS, REFLECTION_DAYS, type AwardKind } from './constants';
import { levelForXp } from './levels';

export type PendingAward = {
  kind: AwardKind;
  dayIndex: number;
  programmeHabitId: number | null;
  xp: number;
  points: number;
};

export type CheckInAwardInput = {
  programmeHabitId: number;
  dayIndex: number;
  scheduled: number;
  completedAfter: number;
  /** Habit ids that already have a habit_check_in ledger row for this day. */
  alreadyAwardedHabitIds: number[];
  fullDayAlreadyAwarded: boolean;
};

function award(kind: AwardKind, dayIndex: number, programmeHabitId: number | null): PendingAward {
  return { kind, dayIndex, programmeHabitId, ...AWARDS[kind] };
}

/**
 * Awards are earned once per habit per day and once per full day. Un-ticking a
 * habit never removes XP, so re-ticking it must not pay again.
 */
export function awardsForCheckIn(input: CheckInAwardInput): PendingAward[] {
  const pending: PendingAward[] = [];

  if (!input.alreadyAwardedHabitIds.includes(input.programmeHabitId)) {
    pending.push(award('habit_check_in', input.dayIndex, input.programmeHabitId));
  }

  const isFullDay = input.scheduled > 0 && input.completedAfter >= input.scheduled;
  if (isFullDay && !input.fullDayAlreadyAwarded) {
    pending.push(award('full_day_bonus', input.dayIndex, null));
  }

  return pending;
}

export function awardsForReflection(dayIndex: number, alreadyAwarded: boolean): PendingAward[] {
  if (!(REFLECTION_DAYS as readonly number[]).includes(dayIndex)) {
    throw new Error(`Day ${dayIndex} is not a reflection day`);
  }
  if (alreadyAwarded) return [];
  return [award('weekly_reflection', dayIndex, null)];
}

export type Totals = {
  xpTotal: number;
  level: number;
  pointsEarnedTotal: number;
  pointsBalance: number;
};

export function applyAwards(totals: Totals, awards: PendingAward[]): Totals {
  if (awards.length === 0) return totals;

  const xp = awards.reduce((sum, a) => sum + a.xp, 0);
  const points = awards.reduce((sum, a) => sum + a.points, 0);
  const xpTotal = totals.xpTotal + xp;

  return {
    xpTotal,
    level: levelForXp(xpTotal).level,
    pointsEarnedTotal: totals.pointsEarnedTotal + points,
    pointsBalance: totals.pointsBalance + points,
  };
}

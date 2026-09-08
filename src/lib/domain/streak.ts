import { MAX_SHIELDS } from './constants';

export type StreakState = {
  streakCurrent: number;
  streakLongest: number;
  shieldCount: number;
  lastCountedDay: number;
  lastSettledDay: number;
};

export type DayCounts = { dayIndex: number; scheduled: number; completed: number };

/** At least 50% of the day's scheduled habits, rounded up, minimum 1 if any exist. */
export function requiredForStreak(scheduled: number): number {
  if (scheduled <= 0) return 0;
  return Math.max(1, Math.ceil(scheduled / 2));
}

export function dayQualifies(scheduled: number, completed: number): boolean {
  const required = requiredForStreak(scheduled);
  if (required === 0) return false;
  return completed >= required;
}

function maybeAwardShield(state: StreakState, day: DayCounts): StreakState {
  const isFullDay = day.scheduled > 0 && day.completed >= day.scheduled;
  if (!isFullDay || state.shieldCount >= MAX_SHIELDS) return state;
  return { ...state, shieldCount: MAX_SHIELDS };
}

function countDay(state: StreakState, day: DayCounts): StreakState {
  if (day.dayIndex <= state.lastCountedDay) return state;
  const streakCurrent = state.streakCurrent + 1;
  return {
    ...state,
    streakCurrent,
    streakLongest: Math.max(state.streakLongest, streakCurrent),
    lastCountedDay: day.dayIndex,
  };
}

/** Applies the full rules for a day that is over, then marks it settled. */
export function settleDay(state: StreakState, day: DayCounts): StreakState {
  if (day.dayIndex <= state.lastSettledDay) return state;

  // A day with nothing scheduled is neutral: it neither builds nor breaks a streak.
  if (day.scheduled === 0) {
    return { ...state, lastSettledDay: day.dayIndex };
  }

  let next = state;
  if (dayQualifies(day.scheduled, day.completed)) {
    next = countDay(next, day);
    next = maybeAwardShield(next, day);
  } else if (next.shieldCount > 0) {
    // Shield consumed. Streak value is preserved, not incremented.
    next = { ...next, shieldCount: next.shieldCount - 1 };
  } else {
    next = { ...next, streakCurrent: 0 };
  }

  return { ...next, lastSettledDay: day.dayIndex };
}

/**
 * Applies only the positive outcomes for the day currently in progress, so the
 * streak and shield update the moment the user earns them. A miss is never
 * applied here — it waits until the day is over and settleDay runs.
 */
export function applyOpenDay(state: StreakState, day: DayCounts): StreakState {
  if (day.scheduled === 0) return state;
  let next = state;
  if (dayQualifies(day.scheduled, day.completed)) {
    next = countDay(next, day);
  }
  return maybeAwardShield(next, day);
}

/**
 * Rolls state forward from its watermarks to `currentDay`. Idempotent: calling
 * it repeatedly with the same inputs produces the same state, which is what
 * lets it run on every page load without a scheduler.
 */
export function rollForward(state: StreakState, days: DayCounts[], currentDay: number): StreakState {
  const byDay = new Map(days.map((d) => [d.dayIndex, d]));
  let next = state;

  for (let day = state.lastSettledDay + 1; day < currentDay; day += 1) {
    next = settleDay(next, byDay.get(day) ?? { dayIndex: day, scheduled: 0, completed: 0 });
  }

  const today = byDay.get(currentDay);
  if (today) next = applyOpenDay(next, today);

  return next;
}

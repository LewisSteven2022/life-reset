import { PROGRAMME_DAYS } from './constants';

const MS_PER_DAY = 86_400_000;

/** Returns the calendar date in `timeZone` as YYYY-MM-DD. */
export function localDateInTimeZone(now: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD, which is exactly what we want.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function toUtcMidnight(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** 1-based day index. Below 1 means "not started", above 21 means "finished". */
export function dayIndexFor(startDate: string, localDate: string): number {
  const diff = toUtcMidnight(localDate) - toUtcMidnight(startDate);
  return Math.round(diff / MS_PER_DAY) + 1;
}

export type DayStateInput = {
  startDate: string;
  timeZone: string;
  now: Date;
  dayOffset?: number;
};

export type DayState = {
  localDate: string;
  rawDayIndex: number;
  currentDay: number;
  isBeforeStart: boolean;
  isComplete: boolean;
};

export function programmeDayState({ startDate, timeZone, now, dayOffset = 0 }: DayStateInput): DayState {
  const localDate = localDateInTimeZone(now, timeZone);
  const rawDayIndex = dayIndexFor(startDate, localDate) + dayOffset;
  return {
    localDate,
    rawDayIndex,
    currentDay: Math.min(PROGRAMME_DAYS, Math.max(1, rawDayIndex)),
    isBeforeStart: rawDayIndex < 1,
    isComplete: rawDayIndex > PROGRAMME_DAYS,
  };
}

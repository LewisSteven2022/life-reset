import { describe, it, expect } from 'vitest';
import { localDateInTimeZone, dayIndexFor, programmeDayState } from '@/lib/domain/day';

describe('localDateInTimeZone', () => {
  it('returns the local calendar date, not the UTC one', () => {
    // 23:30 UTC on 5 Sep is already 6 Sep in Sydney.
    const at = new Date('2026-09-05T23:30:00Z');
    expect(localDateInTimeZone(at, 'Australia/Sydney')).toBe('2026-09-06');
    expect(localDateInTimeZone(at, 'Europe/London')).toBe('2026-09-06');
    expect(localDateInTimeZone(at, 'America/Los_Angeles')).toBe('2026-09-05');
  });

  it('handles a British Summer Time boundary', () => {
    const at = new Date('2026-10-25T00:30:00Z');
    expect(localDateInTimeZone(at, 'Europe/London')).toBe('2026-10-25');
  });
});

describe('dayIndexFor', () => {
  it('makes the start date day 1', () => {
    expect(dayIndexFor('2026-09-07', '2026-09-07')).toBe(1);
  });

  it('counts calendar days forward', () => {
    expect(dayIndexFor('2026-09-07', '2026-09-08')).toBe(2);
    expect(dayIndexFor('2026-09-07', '2026-09-27')).toBe(21);
  });

  it('returns a value above 21 once the programme is over', () => {
    expect(dayIndexFor('2026-09-07', '2026-09-28')).toBe(22);
  });

  it('returns zero or less before the start date', () => {
    expect(dayIndexFor('2026-09-07', '2026-09-06')).toBe(0);
  });

  it('spans a month boundary correctly', () => {
    expect(dayIndexFor('2026-09-25', '2026-10-01')).toBe(7);
  });
});

describe('programmeDayState', () => {
  const base = { startDate: '2026-09-07', timeZone: 'Europe/London' };

  it('clamps the current day into 1..21', () => {
    const state = programmeDayState({ ...base, now: new Date('2026-10-10T09:00:00Z') });
    expect(state.rawDayIndex).toBe(34);
    expect(state.currentDay).toBe(21);
    expect(state.isComplete).toBe(true);
  });

  it('flags a programme that has not started', () => {
    const state = programmeDayState({ ...base, now: new Date('2026-09-05T09:00:00Z') });
    expect(state.isBeforeStart).toBe(true);
    expect(state.currentDay).toBe(1);
  });

  it('applies the QA day offset', () => {
    const state = programmeDayState({ ...base, now: new Date('2026-09-07T09:00:00Z'), dayOffset: 6 });
    expect(state.currentDay).toBe(7);
  });

  it('ignores a QA offset of zero', () => {
    const state = programmeDayState({ ...base, now: new Date('2026-09-07T09:00:00Z'), dayOffset: 0 });
    expect(state.currentDay).toBe(1);
  });
});

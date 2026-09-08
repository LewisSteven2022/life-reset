import { describe, it, expect } from 'vitest';
import { isScheduledOnDay, scheduledCountForDay, type HabitWindow } from '@/lib/domain/schedule';

const openEnded: HabitWindow = { id: 1, activeFromDay: 1, activeToDay: null };
const retiredAtDay11: HabitWindow = { id: 2, activeFromDay: 1, activeToDay: 11 };
const addedAtDay12: HabitWindow = { id: 3, activeFromDay: 12, activeToDay: null };

describe('isScheduledOnDay', () => {
  it('includes an open-ended habit on every day', () => {
    expect(isScheduledOnDay(openEnded, 1)).toBe(true);
    expect(isScheduledOnDay(openEnded, 21)).toBe(true);
  });

  it('keeps a retired habit on its historical days', () => {
    expect(isScheduledOnDay(retiredAtDay11, 11)).toBe(true);
  });

  it('drops a retired habit from future days', () => {
    expect(isScheduledOnDay(retiredAtDay11, 12)).toBe(false);
  });

  it('excludes a habit added later from earlier days', () => {
    expect(isScheduledOnDay(addedAtDay12, 11)).toBe(false);
    expect(isScheduledOnDay(addedAtDay12, 12)).toBe(true);
  });
});

describe('scheduledCountForDay', () => {
  const habits = [openEnded, retiredAtDay11, addedAtDay12];

  it('counts only habits whose window covers the day', () => {
    expect(scheduledCountForDay(habits, 5)).toBe(2);
    expect(scheduledCountForDay(habits, 12)).toBe(2);
  });

  it('returns zero for an empty programme', () => {
    expect(scheduledCountForDay([], 3)).toBe(0);
  });
});

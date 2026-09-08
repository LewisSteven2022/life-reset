export type HabitWindow = { id: number; activeFromDay: number; activeToDay: number | null };

/**
 * Habits are daily within their active window. Retiring a habit mid-programme
 * sets activeToDay to yesterday, which preserves historical scheduled counts.
 */
export function isScheduledOnDay(habit: HabitWindow, day: number): boolean {
  if (day < habit.activeFromDay) return false;
  if (habit.activeToDay !== null && day > habit.activeToDay) return false;
  return true;
}

export function habitsScheduledOnDay<T extends HabitWindow>(habits: T[], day: number): T[] {
  return habits.filter((habit) => isScheduledOnDay(habit, day));
}

export function scheduledCountForDay(habits: HabitWindow[], day: number): number {
  return habitsScheduledOnDay(habits, day).length;
}

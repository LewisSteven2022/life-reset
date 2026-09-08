export const PROGRAMME_DAYS = 21 as const;
export const REFLECTION_DAYS = [7, 14, 21] as const;
export const MAX_SHIELDS = 1 as const;

/** Soft guidance only. Never enforced as a hard limit. */
export const RECOMMENDED_AREAS = { min: 3, max: 5 } as const;

export const MAX_TOTAL_HABITS = 8 as const;
export const MAX_HABITS_PER_AREA = 2 as const;

export type AwardKind = 'habit_check_in' | 'full_day_bonus' | 'weekly_reflection';
export type AwardValue = { xp: number; points: number };

/**
 * Ordering is locked by the spec: check-in < full-day bonus < weekly reflection.
 * XP is never subtracted anywhere in the app.
 */
export const AWARDS: Record<AwardKind, AwardValue> = {
  habit_check_in: { xp: 10, points: 2 },
  full_day_bonus: { xp: 25, points: 5 },
  weekly_reflection: { xp: 50, points: 15 },
};

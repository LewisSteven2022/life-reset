import 'server-only';
import { requireUser } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase/server';
import { currentDayState, getOpenProgramme, listProgrammeHabits } from '@/lib/data/programme';
import { getOrCreateProgress, toProgress, type ProgressRow } from '@/lib/data/progress';
import { habitsScheduledOnDay, scheduledCountForDay } from '@/lib/domain/schedule';
import { requiredForStreak, rollForward, type DayCounts } from '@/lib/domain/streak';
import { levelForXp } from '@/lib/domain/levels';
import { REFLECTION_DAYS } from '@/lib/domain/constants';

export type TodayHabit = {
  id: number; title: string; detail: string | null; areaLabel: string;
  completed: boolean; note: string | null;
};

export type TodayView = {
  programmeId: number;
  currentDay: number;
  isComplete: boolean;
  habits: TodayHabit[];
  scheduled: number;
  completed: number;
  requiredForStreak: number;
  reflectionDue: boolean;
  reflectionDone: boolean;
  progress: ProgressRow;
  levelTitle: string;
};

/** Completed check-ins grouped by day for the whole programme. */
async function completionsByDay(programmeId: number): Promise<Map<number, number>> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('habit_check_in')
    .select('day_index')
    .eq('programme_id', programmeId)
    .eq('completed', true);
  if (error) throw error;

  const counts = new Map<number, number>();
  for (const row of data) counts.set(row.day_index, (counts.get(row.day_index) ?? 0) + 1);
  return counts;
}

/**
 * Rolls streak state forward to today and persists it. Safe to call on every
 * request: rollForward is idempotent, so repeats write the same values.
 */
export async function refreshProgress(programmeId: number): Promise<ProgressRow> {
  const user = await requireUser();
  const programme = await getOpenProgramme();
  const progress = await getOrCreateProgress();
  if (!programme || programme.id !== programmeId || !programme.startDate) return progress;

  const [habits, completions, dayState] = await Promise.all([
    listProgrammeHabits(programmeId),
    completionsByDay(programmeId),
    currentDayState(programme),
  ]);

  const days: DayCounts[] = [];
  for (let day = 1; day <= dayState.currentDay; day += 1) {
    days.push({
      dayIndex: day,
      scheduled: scheduledCountForDay(habits, day),
      completed: completions.get(day) ?? 0,
    });
  }

  const next = rollForward(progress, days, dayState.currentDay);
  if (
    next.streakCurrent === progress.streakCurrent &&
    next.streakLongest === progress.streakLongest &&
    next.shieldCount === progress.shieldCount &&
    next.lastCountedDay === progress.lastCountedDay &&
    next.lastSettledDay === progress.lastSettledDay
  ) {
    return progress;
  }

  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('progress')
    .update({
      streak_current: next.streakCurrent,
      streak_longest: next.streakLongest,
      shield_count: next.shieldCount,
      last_counted_day: next.lastCountedDay,
      last_settled_day: next.lastSettledDay,
    })
    .eq('user_id', user.id)
    .select(
      'xp_total, level, points_earned_total, points_balance, streak_current, streak_longest, shield_count, last_counted_day, last_settled_day, active_programme_id',
    )
    .single();
  if (error) throw error;
  return toProgress(data);
}

export async function getTodayView(): Promise<TodayView | null> {
  const programme = await getOpenProgramme();
  if (!programme || programme.status !== 'active' || !programme.startDate) return null;

  const dayState = await currentDayState(programme);
  const progress = await refreshProgress(programme.id);

  const supabase = await createServerSupabase();
  const [habits, checkIns, reflection] = await Promise.all([
    listProgrammeHabits(programme.id),
    supabase
      .from('habit_check_in')
      .select('programme_habit_id, completed, note')
      .eq('programme_id', programme.id)
      .eq('day_index', dayState.currentDay),
    supabase
      .from('reflection')
      .select('day_index')
      .eq('programme_id', programme.id)
      .eq('day_index', dayState.currentDay)
      .maybeSingle(),
  ]);
  if (checkIns.error) throw checkIns.error;

  const byHabit = new Map(checkIns.data.map((c) => [c.programme_habit_id, c]));
  const scheduledHabits = habitsScheduledOnDay(habits, dayState.currentDay);

  const todayHabits: TodayHabit[] = scheduledHabits.map((habit) => {
    const checkIn = byHabit.get(habit.id);
    return {
      id: habit.id,
      title: habit.title,
      detail: habit.detail,
      areaLabel: habit.areaLabel,
      completed: checkIn?.completed ?? false,
      note: checkIn?.note ?? null,
    };
  });

  const completed = todayHabits.filter((h) => h.completed).length;

  return {
    programmeId: programme.id,
    currentDay: dayState.currentDay,
    isComplete: dayState.isComplete,
    habits: todayHabits,
    scheduled: todayHabits.length,
    completed,
    requiredForStreak: requiredForStreak(todayHabits.length),
    reflectionDue: (REFLECTION_DAYS as readonly number[]).includes(dayState.currentDay),
    reflectionDone: reflection.data !== null,
    progress,
    levelTitle: levelForXp(progress.xpTotal).title,
  };
}

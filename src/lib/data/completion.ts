import 'server-only';
import { createServerSupabase } from '@/lib/supabase/server';
import { listProgrammeHabits } from '@/lib/data/programme';
import { listReflections, type ReflectionRow } from '@/lib/data/reflections';
import { scheduledCountForDay } from '@/lib/domain/schedule';
import { dayQualifies } from '@/lib/domain/streak';
import { PROGRAMME_DAYS } from '@/lib/domain/constants';

export type CompletionSummary = {
  programmeId: number;
  daysQualified: number;
  totalCheckIns: number;
  bestHabits: { title: string; count: number }[];
  reflections: ReflectionRow[];
  xpEarned: number;
  pointsEarned: number;
};

export async function getCompletionSummary(programmeId: number): Promise<CompletionSummary> {
  const supabase = await createServerSupabase();
  const [habits, checkIns, ledger, reflections] = await Promise.all([
    listProgrammeHabits(programmeId),
    supabase
      .from('habit_check_in')
      .select('programme_habit_id, day_index')
      .eq('programme_id', programmeId)
      .eq('completed', true),
    supabase.from('xp_event').select('xp, points').eq('programme_id', programmeId),
    listReflections(programmeId),
  ]);
  if (checkIns.error) throw checkIns.error;
  if (ledger.error) throw ledger.error;

  const perDay = new Map<number, number>();
  const perHabit = new Map<number, number>();
  for (const row of checkIns.data) {
    perDay.set(row.day_index, (perDay.get(row.day_index) ?? 0) + 1);
    perHabit.set(row.programme_habit_id, (perHabit.get(row.programme_habit_id) ?? 0) + 1);
  }

  let daysQualified = 0;
  for (let day = 1; day <= PROGRAMME_DAYS; day += 1) {
    if (dayQualifies(scheduledCountForDay(habits, day), perDay.get(day) ?? 0)) daysQualified += 1;
  }

  const titleById = new Map(habits.map((h) => [h.id, h.title]));
  const bestHabits = [...perHabit.entries()]
    .map(([id, count]) => ({ title: titleById.get(id) ?? 'Removed habit', count }))
    .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title))
    .slice(0, 3);

  return {
    programmeId,
    daysQualified,
    totalCheckIns: checkIns.data.length,
    bestHabits,
    reflections,
    xpEarned: ledger.data.reduce((sum, e) => sum + e.xp, 0),
    pointsEarned: ledger.data.reduce((sum, e) => sum + e.points, 0),
  };
}

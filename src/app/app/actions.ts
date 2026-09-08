'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase/server';
import { getOpenProgramme, listProgrammeHabits } from '@/lib/data/programme';
import { getOrCreateProgress } from '@/lib/data/progress';
import { refreshProgress } from '@/lib/data/today';
import { scheduledCountForDay } from '@/lib/domain/schedule';
import { applyAwards, awardsForCheckIn } from '@/lib/domain/awards';

export async function toggleCheckIn(formData: FormData): Promise<void> {
  const user = await requireUser();
  const habitId = Number(formData.get('habitId'));
  const dayIndex = Number(formData.get('dayIndex'));
  const completed = formData.get('completed') === 'true';

  const programme = await getOpenProgramme();
  if (!programme || programme.status !== 'active') return;

  const supabase = await createServerSupabase();

  const upsert = await supabase
    .from('habit_check_in')
    .upsert(
      {
        user_id: user.id,
        programme_id: programme.id,
        programme_habit_id: habitId,
        day_index: dayIndex,
        completed,
        completed_at: new Date().toISOString(),
      },
      { onConflict: 'programme_habit_id,day_index' },
    );
  if (upsert.error) throw upsert.error;

  if (completed) {
    await grantCheckInAwards(user.id, programme.id, habitId, dayIndex);
  }

  await refreshProgress(programme.id);
  revalidatePath('/app');
}

async function grantCheckInAwards(
  userId: string, programmeId: number, habitId: number, dayIndex: number,
): Promise<void> {
  const supabase = await createServerSupabase();

  const [habits, completedToday, ledger] = await Promise.all([
    listProgrammeHabits(programmeId),
    supabase
      .from('habit_check_in')
      .select('programme_habit_id')
      .eq('programme_id', programmeId)
      .eq('day_index', dayIndex)
      .eq('completed', true),
    supabase
      .from('xp_event')
      .select('kind, programme_habit_id')
      .eq('programme_id', programmeId)
      .eq('day_index', dayIndex),
  ]);
  if (completedToday.error) throw completedToday.error;
  if (ledger.error) throw ledger.error;

  const awards = awardsForCheckIn({
    programmeHabitId: habitId,
    dayIndex,
    scheduled: scheduledCountForDay(habits, dayIndex),
    completedAfter: completedToday.data.length,
    alreadyAwardedHabitIds: ledger.data
      .filter((e) => e.kind === 'habit_check_in' && e.programme_habit_id !== null)
      .map((e) => e.programme_habit_id as number),
    fullDayAlreadyAwarded: ledger.data.some((e) => e.kind === 'full_day_bonus'),
  });
  if (awards.length === 0) return;

  // Unique indexes on xp_event make this exactly-once even under a double click.
  const inserted = await supabase
    .from('xp_event')
    .insert(
      awards.map((a) => ({
        user_id: userId,
        programme_id: programmeId,
        kind: a.kind,
        day_index: a.dayIndex,
        programme_habit_id: a.programmeHabitId,
        xp: a.xp,
        points: a.points,
      })),
    )
    .select('kind, xp, points');

  // 23505 = the award was already paid by a concurrent request. Nothing to do.
  if (inserted.error) {
    if (inserted.error.code === '23505') return;
    throw inserted.error;
  }

  const progress = await getOrCreateProgress();
  const totals = applyAwards(
    {
      xpTotal: progress.xpTotal,
      level: progress.level,
      pointsEarnedTotal: progress.pointsEarnedTotal,
      pointsBalance: progress.pointsBalance,
    },
    awards,
  );

  const update = await supabase
    .from('progress')
    .update({
      xp_total: totals.xpTotal,
      level: totals.level,
      points_earned_total: totals.pointsEarnedTotal,
      points_balance: totals.pointsBalance,
    })
    .eq('user_id', userId);
  if (update.error) throw update.error;
}

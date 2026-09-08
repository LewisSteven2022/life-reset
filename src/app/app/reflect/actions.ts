'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase/server';
import { getOpenProgramme } from '@/lib/data/programme';
import { getWeeklyPrompt } from '@/lib/data/catalogue';
import { getOrCreateProgress } from '@/lib/data/progress';
import { applyAwards, awardsForReflection } from '@/lib/domain/awards';
import { REFLECTION_DAYS } from '@/lib/domain/constants';

export type ReflectState = { error: string | null; saved: boolean };

export async function saveReflection(_prev: ReflectState, formData: FormData): Promise<ReflectState> {
  const user = await requireUser();
  const dayIndex = Number(formData.get('dayIndex'));
  const body = String(formData.get('body') ?? '');

  if (!(REFLECTION_DAYS as readonly number[]).includes(dayIndex)) {
    return { error: 'Reflections open on days 7, 14 and 21.', saved: false };
  }

  const programme = await getOpenProgramme();
  if (!programme || programme.status !== 'active') {
    return { error: 'No active programme.', saved: false };
  }

  const prompt = await getWeeklyPrompt(dayIndex);
  const supabase = await createServerSupabase();

  // Empty bodies are allowed by design, and a reflection can be revisited.
  const upsert = await supabase.from('reflection').upsert(
    {
      user_id: user.id,
      programme_id: programme.id,
      day_index: dayIndex,
      prompt_key: prompt.key,
      prompt_text: prompt.prompt,
      body,
    },
    { onConflict: 'programme_id,day_index' },
  );
  if (upsert.error) return { error: upsert.error.message, saved: false };

  const ledger = await supabase
    .from('xp_event')
    .select('id')
    .eq('programme_id', programme.id)
    .eq('day_index', dayIndex)
    .eq('kind', 'weekly_reflection')
    .maybeSingle();
  if (ledger.error) return { error: ledger.error.message, saved: false };

  const awards = awardsForReflection(dayIndex, ledger.data !== null);
  if (awards.length > 0) {
    const insert = await supabase.from('xp_event').insert(
      awards.map((a) => ({
        user_id: user.id,
        programme_id: programme.id,
        kind: a.kind,
        day_index: a.dayIndex,
        programme_habit_id: null,
        xp: a.xp,
        points: a.points,
      })),
    );
    if (insert.error && insert.error.code !== '23505') {
      return { error: insert.error.message, saved: false };
    }
    if (!insert.error) {
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
        .eq('user_id', user.id);
      if (update.error) return { error: update.error.message, saved: false };
    }
  }

  revalidatePath('/app/reflect');
  revalidatePath('/app');
  return { error: null, saved: true };
}

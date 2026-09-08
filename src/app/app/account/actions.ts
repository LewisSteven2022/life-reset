'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase/server';
import { abandonProgramme, getOpenProgramme } from '@/lib/data/programme';

export type AccountState = { error: string | null };

export async function abandonProgrammeAction(_prev: AccountState, formData: FormData): Promise<AccountState> {
  const user = await requireUser();
  if (formData.get('confirm') !== 'yes') return { error: 'Tick the box to confirm.' };

  const programme = await getOpenProgramme();
  if (!programme) return { error: 'Nothing to abandon.' };

  await abandonProgramme(programme.id);

  // A new cycle starts from zero streak but keeps every point of XP.
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from('progress')
    .update({
      active_programme_id: null,
      streak_current: 0,
      shield_count: 0,
      last_counted_day: 0,
      last_settled_day: 0,
    })
    .eq('user_id', user.id);
  if (error) return { error: error.message };

  revalidatePath('/app', 'layout');
  redirect('/app/setup');
}

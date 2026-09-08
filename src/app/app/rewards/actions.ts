'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase/server';

export type RewardState = { error: string | null; unlockedKey: string | null };

export async function redeemReward(_prev: RewardState, formData: FormData): Promise<RewardState> {
  await requireUser();
  const rewardKey = String(formData.get('rewardKey') ?? '');

  const supabase = await createServerSupabase();
  const { error } = await supabase.rpc('redeem_reward', { p_reward_key: rewardKey });

  if (error) {
    if (/insufficient points/i.test(error.message)) {
      return { error: 'Not enough reset points yet. Keep checking in.', unlockedKey: null };
    }
    if (/already unlocked/i.test(error.message)) {
      return { error: 'You already own that one.', unlockedKey: null };
    }
    return { error: 'That did not go through. Try again.', unlockedKey: null };
  }

  revalidatePath('/app/rewards');
  revalidatePath('/app');
  return { error: null, unlockedKey: rewardKey };
}

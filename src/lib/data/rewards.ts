import 'server-only';
import { createServerSupabase } from '@/lib/supabase/server';
import { listRewards, type RewardRow } from '@/lib/data/catalogue';
import { getOrCreateProgress } from '@/lib/data/progress';

export type RewardWithOwnership = RewardRow & { owned: boolean; affordable: boolean };

export async function listUnlocks(): Promise<{ rewardKey: string; unlockedAt: string }[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.from('unlock').select('reward_key, unlocked_at');
  if (error) throw error;
  return data.map((row) => ({ rewardKey: row.reward_key, unlockedAt: row.unlocked_at }));
}

export async function listRewardsWithOwnership(): Promise<{
  rewards: RewardWithOwnership[];
  pointsBalance: number;
}> {
  const supabase = await createServerSupabase();
  const [catalogue, progress, unlocks] = await Promise.all([
    listRewards(),
    getOrCreateProgress(),
    supabase.from('unlock').select('reward_key'),
  ]);
  if (unlocks.error) throw unlocks.error;

  const owned = new Set(unlocks.data.map((u) => u.reward_key));
  return {
    pointsBalance: progress.pointsBalance,
    rewards: catalogue.map((r) => ({
      ...r,
      owned: owned.has(r.key),
      affordable: progress.pointsBalance >= r.costPoints,
    })),
  };
}

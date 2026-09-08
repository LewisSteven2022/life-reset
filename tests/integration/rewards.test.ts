import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { adminClient, createTestUser, deleteTestUser, userClient, type TestUser } from '../helpers/supabase-admin';

let user: TestUser;

beforeAll(async () => {
  user = await createTestUser(`rewards+${Date.now()}@example.test`);
  const { error } = await adminClient()
    .from('progress')
    .insert({ user_id: user.id, xp_total: 500, level: 4, points_earned_total: 100, points_balance: 100 });
  if (error) throw error;
});

afterAll(async () => {
  await deleteTestUser(user.id);
});

describe('redeem_reward', () => {
  it('spends points and records the unlock', async () => {
    const client = userClient(user.accessToken);
    const { data, error } = await client.rpc('redeem_reward', { p_reward_key: 'theme_dawn' });
    expect(error).toBeNull();
    expect(data?.points_balance).toBe(20);

    const unlocks = await client.from('unlock').select('reward_key');
    expect(unlocks.data?.map((u) => u.reward_key)).toEqual(['theme_dawn']);
  });

  it('never lets XP fall when points are spent', async () => {
    const { data } = await userClient(user.accessToken).from('progress').select('xp_total').single();
    expect(data?.xp_total).toBe(500);
  });

  it('refuses to buy the same reward twice', async () => {
    const { error } = await userClient(user.accessToken).rpc('redeem_reward', { p_reward_key: 'theme_dawn' });
    expect(error?.message).toMatch(/already unlocked/i);
  });

  it('refuses a purchase the balance cannot cover', async () => {
    const { error } = await userClient(user.accessToken).rpc('redeem_reward', { p_reward_key: 'badge_finisher' });
    expect(error?.message).toMatch(/insufficient points/i);
  });

  it('refuses an unknown reward key', async () => {
    const { error } = await userClient(user.accessToken).rpc('redeem_reward', { p_reward_key: 'not_a_reward' });
    expect(error?.message).toMatch(/unknown reward/i);
  });

  it('lets exactly one of two concurrent redemptions succeed', async () => {
    // Top the balance back up so exactly one 40-point pack is affordable.
    await adminClient().from('progress').update({ points_balance: 40 }).eq('user_id', user.id);

    const client = userClient(user.accessToken);
    const results = await Promise.all([
      client.rpc('redeem_reward', { p_reward_key: 'coach_pack_grit' }),
      client.rpc('redeem_reward', { p_reward_key: 'coach_pack_calm' }),
    ]);

    const succeeded = results.filter((r) => r.error === null);
    expect(succeeded).toHaveLength(1);

    const { data } = await client.from('progress').select('points_balance').single();
    expect(data?.points_balance).toBe(0);
  });
});

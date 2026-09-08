import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { adminClient, anonClient, createTestUser, deleteTestUser, userClient, type TestUser } from '../helpers/supabase-admin';

let alice: TestUser;
let bob: TestUser;
let aliceProgrammeId: number;

beforeAll(async () => {
  alice = await createTestUser(`alice+${Date.now()}@example.test`);
  bob = await createTestUser(`bob+${Date.now()}@example.test`);

  const { data, error } = await adminClient()
    .from('programme')
    .insert({ user_id: alice.id, status: 'active', start_date: '2026-09-01', timezone: 'Europe/London' })
    .select('id')
    .single();
  if (error) throw error;
  aliceProgrammeId = data.id;
});

afterAll(async () => {
  await deleteTestUser(alice.id);
  await deleteTestUser(bob.id);
});

describe('RLS isolation', () => {
  it('lets Alice read her own programme', async () => {
    const { data, error } = await userClient(alice.accessToken).from('programme').select('id');
    expect(error).toBeNull();
    expect(data?.map((r) => r.id)).toContain(aliceProgrammeId);
  });

  it('hides Alice’s programme from Bob', async () => {
    const { data, error } = await userClient(bob.accessToken).from('programme').select('id');
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('stops Bob updating Alice’s programme', async () => {
    const { data } = await userClient(bob.accessToken)
      .from('programme')
      .update({ status: 'abandoned' })
      .eq('id', aliceProgrammeId)
      .select('id');
    expect(data).toEqual([]);
  });

  it('stops Bob inserting a row owned by Alice', async () => {
    const { error } = await userClient(bob.accessToken)
      .from('user_area')
      .insert({ user_id: alice.id, area_key: 'sleep', name: 'Sleep', is_custom: false });
    expect(error).not.toBeNull();
    expect(error?.code).toBe('42501');
  });

  it('stops a signed-out client reading any programme', async () => {
    const { data } = await anonClient().from('programme').select('id');
    expect(data ?? []).toEqual([]);
  });

  it('lets an authenticated user read the content catalogue', async () => {
    const { data, error } = await userClient(bob.accessToken).from('area_catalogue').select('key');
    expect(error).toBeNull();
    expect((data ?? []).length).toBeGreaterThan(0);
  });
});

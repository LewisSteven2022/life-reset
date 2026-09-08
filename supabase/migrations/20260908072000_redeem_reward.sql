-- Atomic reward purchase. SECURITY DEFINER because it must update progress in
-- the same transaction as the unlock insert. The user is always derived from
-- auth.uid() inside the function and never taken as a parameter.
create or replace function public.redeem_reward(p_reward_key text)
returns public.progress
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user     uuid := (select auth.uid());
  v_cost     integer;
  v_progress public.progress;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select cost_points into v_cost
    from public.reward_catalogue
   where key = p_reward_key and is_active;

  if v_cost is null then
    raise exception 'unknown reward %', p_reward_key using errcode = 'P0002';
  end if;

  if exists (select 1 from public.unlock where user_id = v_user and reward_key = p_reward_key) then
    raise exception 'already unlocked' using errcode = 'P0001';
  end if;

  update public.progress
     set points_balance = points_balance - v_cost
   where user_id = v_user
     and points_balance >= v_cost
  returning * into v_progress;

  if not found then
    raise exception 'insufficient points' using errcode = 'P0001';
  end if;

  insert into public.unlock (user_id, reward_key, cost_points)
  values (v_user, p_reward_key, v_cost);

  return v_progress;
end;
$$;

revoke execute on function public.redeem_reward(text) from public, anon;
grant execute on function public.redeem_reward(text) to authenticated;

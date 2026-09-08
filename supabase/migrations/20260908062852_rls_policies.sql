-- Content tables: readable by any signed-in user, never writable from the client.
alter table public.area_catalogue   enable row level security;
alter table public.habit_template   enable row level security;
alter table public.weekly_prompt    enable row level security;
alter table public.reward_catalogue enable row level security;

create policy area_catalogue_read on public.area_catalogue
  for select to authenticated using (true);
create policy habit_template_read on public.habit_template
  for select to authenticated using (true);
create policy weekly_prompt_read on public.weekly_prompt
  for select to authenticated using (true);
create policy reward_catalogue_read on public.reward_catalogue
  for select to authenticated using (is_active);

-- User-owned tables: full CRUD scoped to the owner.
-- auth.uid() is wrapped in a subselect so Postgres evaluates it once per query,
-- not once per row.
alter table public.user_area       enable row level security;
alter table public.programme       enable row level security;
alter table public.programme_habit enable row level security;
alter table public.habit_check_in  enable row level security;
alter table public.reflection      enable row level security;
alter table public.unlock          enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'user_area', 'programme', 'programme_habit', 'habit_check_in', 'reflection', 'unlock'
  ] loop
    execute format(
      'create policy %1$s_select on public.%1$I for select to authenticated
         using ((select auth.uid()) = user_id)', t);
    execute format(
      'create policy %1$s_insert on public.%1$I for insert to authenticated
         with check ((select auth.uid()) = user_id)', t);
    execute format(
      'create policy %1$s_update on public.%1$I for update to authenticated
         using ((select auth.uid()) = user_id)
         with check ((select auth.uid()) = user_id)', t);
    execute format(
      'create policy %1$s_delete on public.%1$I for delete to authenticated
         using ((select auth.uid()) = user_id)', t);
  end loop;
end;
$$;

-- progress: owner-scoped, keyed on user_id as the primary key.
alter table public.progress enable row level security;
create policy progress_select on public.progress
  for select to authenticated using ((select auth.uid()) = user_id);
create policy progress_insert on public.progress
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy progress_update on public.progress
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- xp_event: append-only from the client. No update or delete policy exists,
-- which is what makes "XP is never subtracted" a database guarantee.
alter table public.xp_event enable row level security;
create policy xp_event_select on public.xp_event
  for select to authenticated using ((select auth.uid()) = user_id);
create policy xp_event_insert on public.xp_event
  for insert to authenticated with check ((select auth.uid()) = user_id);

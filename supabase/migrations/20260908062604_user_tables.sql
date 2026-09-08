create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- A life area the user has chosen, either from the catalogue or their own.
create table public.user_area (
  id         bigint generated always as identity primary key,
  user_id    uuid    not null references auth.users(id) on delete cascade,
  area_key   text    references public.area_catalogue(key) on update cascade on delete set null,
  name       text    not null check (char_length(btrim(name)) between 1 and 60),
  is_custom  boolean not null default false,
  sort_order smallint not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_area_custom_chk check (
    (is_custom and area_key is null) or (not is_custom and area_key is not null)
  )
);
create index user_area_user_id_idx on public.user_area (user_id, sort_order);
create index user_area_area_key_idx on public.user_area (area_key);
create unique index user_area_user_catalogue_uniq
  on public.user_area (user_id, area_key) where area_key is not null;
create trigger user_area_set_updated_at before update on public.user_area
  for each row execute function public.set_updated_at();

-- One 21-day cycle.
create table public.programme (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  status        text not null default 'setup'
                check (status in ('setup', 'active', 'completed', 'abandoned')),
  start_date    date,
  timezone      text not null default 'Europe/London',
  duration_days smallint not null default 21 check (duration_days = 21),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  started_at    timestamptz,
  ended_at      timestamptz,
  constraint programme_started_needs_date check (status = 'setup' or start_date is not null)
);
create index programme_user_id_idx on public.programme (user_id, created_at desc);
-- Enforces "one active programme per user"; also prevents two half-finished setups.
create unique index programme_one_open_per_user
  on public.programme (user_id) where status in ('setup', 'active');
create trigger programme_set_updated_at before update on public.programme
  for each row execute function public.set_updated_at();

-- Denormalised copy of a habit for this programme. Template edits never rewrite
-- an active programme. active_from_day/active_to_day is how mid-programme edits
-- affect future days only.
create table public.programme_habit (
  id                  bigint generated always as identity primary key,
  user_id             uuid    not null references auth.users(id) on delete cascade,
  programme_id        bigint  not null references public.programme(id) on delete cascade,
  user_area_id        bigint  references public.user_area(id) on delete set null,
  source_template_key text,
  area_label          text    not null,
  title               text    not null check (char_length(btrim(title)) between 1 and 120),
  detail              text,
  active_from_day     smallint not null default 1 check (active_from_day between 1 and 21),
  active_to_day       smallint check (active_to_day between 1 and 21),
  sort_order          smallint not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint programme_habit_window_chk check (
    active_to_day is null or active_to_day >= active_from_day
  )
);
create index programme_habit_programme_idx on public.programme_habit (programme_id, sort_order);
create index programme_habit_user_id_idx on public.programme_habit (user_id);
create index programme_habit_user_area_idx on public.programme_habit (user_area_id);
create trigger programme_habit_set_updated_at before update on public.programme_habit
  for each row execute function public.set_updated_at();

-- One row per habit per day. Append-only history relative to habit edits.
create table public.habit_check_in (
  id                 bigint generated always as identity primary key,
  user_id            uuid    not null references auth.users(id) on delete cascade,
  programme_id       bigint  not null references public.programme(id) on delete cascade,
  programme_habit_id bigint  not null references public.programme_habit(id) on delete cascade,
  day_index          smallint not null check (day_index between 1 and 21),
  completed          boolean not null default true,
  note               text    check (note is null or char_length(note) <= 500),
  completed_at       timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint habit_check_in_one_per_day unique (programme_habit_id, day_index)
);
create index habit_check_in_day_idx on public.habit_check_in (programme_id, day_index);
create index habit_check_in_user_id_idx on public.habit_check_in (user_id);
create trigger habit_check_in_set_updated_at before update on public.habit_check_in
  for each row execute function public.set_updated_at();

-- Weekly journal entry. Empty body is allowed and can be revisited.
create table public.reflection (
  id           bigint generated always as identity primary key,
  user_id      uuid    not null references auth.users(id) on delete cascade,
  programme_id bigint  not null references public.programme(id) on delete cascade,
  day_index    smallint not null check (day_index in (7, 14, 21)),
  prompt_key   text,
  prompt_text  text    not null,
  body         text    not null default '',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint reflection_one_per_day unique (programme_id, day_index)
);
create index reflection_user_id_idx on public.reflection (user_id);
create trigger reflection_set_updated_at before update on public.reflection
  for each row execute function public.set_updated_at();

-- Per-user rollup. XP and points-earned never decrease. Streak state resets
-- when a new programme starts. last_counted_day / last_settled_day are the
-- watermarks that make lazy day evaluation idempotent.
create table public.progress (
  user_id             uuid primary key references auth.users(id) on delete cascade,
  xp_total            integer  not null default 0 check (xp_total >= 0),
  level               smallint not null default 1 check (level >= 1),
  points_earned_total integer  not null default 0 check (points_earned_total >= 0),
  points_balance      integer  not null default 0 check (points_balance >= 0),
  streak_current      smallint not null default 0 check (streak_current >= 0),
  streak_longest      smallint not null default 0 check (streak_longest >= 0),
  shield_count        smallint not null default 0 check (shield_count between 0 and 1),
  last_counted_day    smallint not null default 0 check (last_counted_day between 0 and 21),
  last_settled_day    smallint not null default 0 check (last_settled_day between 0 and 21),
  active_programme_id bigint   references public.programme(id) on delete set null,
  updated_at          timestamptz not null default now()
);
create index progress_active_programme_idx on public.progress (active_programme_id);
create trigger progress_set_updated_at before update on public.progress
  for each row execute function public.set_updated_at();

-- Owned cosmetic/content unlocks.
create table public.unlock (
  id          bigint generated always as identity primary key,
  user_id     uuid    not null references auth.users(id) on delete cascade,
  reward_key  text    not null references public.reward_catalogue(key) on update cascade on delete restrict,
  cost_points integer not null check (cost_points >= 0),
  unlocked_at timestamptz not null default now(),
  constraint unlock_one_per_reward unique (user_id, reward_key)
);
create index unlock_user_id_idx on public.unlock (user_id);
create index unlock_reward_key_idx on public.unlock (reward_key);

-- Append-only award ledger. Makes every award exactly-once and gives progress
-- a recomputable source of truth. Rows are never deleted or updated.
create table public.xp_event (
  id                 bigint generated always as identity primary key,
  user_id            uuid    not null references auth.users(id) on delete cascade,
  programme_id       bigint  not null references public.programme(id) on delete cascade,
  kind               text    not null
                     check (kind in ('habit_check_in', 'full_day_bonus', 'weekly_reflection')),
  day_index          smallint not null check (day_index between 1 and 21),
  programme_habit_id bigint  references public.programme_habit(id) on delete cascade,
  xp                 integer not null check (xp >= 0),
  points             integer not null check (points >= 0),
  created_at         timestamptz not null default now(),
  constraint xp_event_habit_ref_chk check (
    (kind = 'habit_check_in' and programme_habit_id is not null)
    or (kind <> 'habit_check_in' and programme_habit_id is null)
  )
);
create index xp_event_user_id_idx on public.xp_event (user_id);
create index xp_event_programme_idx on public.xp_event (programme_id, day_index);
create index xp_event_habit_idx on public.xp_event (programme_habit_id);
create unique index xp_event_habit_uniq
  on public.xp_event (programme_id, day_index, programme_habit_id)
  where kind = 'habit_check_in';
create unique index xp_event_day_uniq
  on public.xp_event (programme_id, day_index, kind)
  where kind in ('full_day_bonus', 'weekly_reflection');

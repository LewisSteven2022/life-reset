-- Content catalogue. Read-only reference data, seeded by migration.

create table public.area_catalogue (
  id          bigint generated always as identity primary key,
  key         text    not null unique,
  name        text    not null,
  description text    not null,
  sort_order  smallint not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.habit_template (
  id         bigint generated always as identity primary key,
  key        text    not null unique,
  area_key   text    not null references public.area_catalogue(key) on update cascade on delete cascade,
  title      text    not null,
  detail     text,
  effort     smallint not null default 1 check (effort between 1 and 3),
  sort_order smallint not null default 0,
  is_default boolean not null default true,
  created_at timestamptz not null default now()
);
create index habit_template_area_key_idx on public.habit_template (area_key, effort, sort_order);

create table public.weekly_prompt (
  id         bigint generated always as identity primary key,
  key        text    not null unique,
  day_index  smallint not null check (day_index in (7, 14, 21)),
  prompt     text    not null,
  sort_order smallint not null default 0
);
create index weekly_prompt_day_idx on public.weekly_prompt (day_index, sort_order);

create table public.reward_catalogue (
  id          bigint generated always as identity primary key,
  key         text    not null unique,
  name        text    not null,
  description text    not null,
  cost_points integer not null check (cost_points > 0),
  reward_type text    not null check (reward_type in ('coach_note_pack', 'theme', 'badge')),
  payload     jsonb   not null default '{}'::jsonb,
  sort_order  smallint not null default 0,
  is_active   boolean not null default true
);

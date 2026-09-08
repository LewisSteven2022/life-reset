# Life Reset v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a private, account-gated web app that runs a user through a 21-day guided life reset — pick life areas, get a generated daily habit plan, check in each day, write weekly reflections, and earn XP / streak / reset points along the way.

**Architecture:** A single Next.js 16 App Router application with a public landing page and an authenticated area under `/app`. Supabase provides auth (email + password) and Postgres with Row Level Security on every user-owned table. All programme rules — plan generation, streak qualification, shield handling, XP and point awards — live in pure TypeScript modules under `src/lib/domain/` with no database dependency, so they are unit-testable in isolation; database access is confined to `src/lib/data/` modules called from Server Components and Server Actions. Progress totals are derived from an append-only `xp_event` ledger, which makes every award idempotent at the database level via unique constraints. The one operation that genuinely races (spending reset points) is a `SECURITY DEFINER` RPC.

**Tech Stack:** Next.js 16.3.4 (App Router, React 19, TypeScript, Turbopack), Tailwind CSS 4.3.3, Supabase (Postgres 17, Auth, RLS) via `@supabase/ssr` 0.12.6 and `@supabase/supabase-js` 2.115.0, Supabase CLI 2.116.0 for local development and migrations, Vitest 5.0.0 for unit and integration tests, Vercel for hosting, npm for package management, Node 22.

## Global Constraints

These apply to every task. Values are taken from `docs/superpowers/specs/2026-09-06-life-reset-design.md`.

- Programme duration is fixed at **21 days** from `programme.start_date`. Missed days stay unchecked and **do not extend the programme**.
- **One active programme per user** at a time. Abandoned and completed programmes are kept as history.
- Weekly reflections occur on days **7, 14 and 21** only. Empty reflections are allowed and can be revisited.
- Streak day rule (locked): a day counts when the user completes **at least 50% of that day's scheduled habits, rounded up, minimum 1 if any habits exist**.
- Weekly reflection completion awards bonus XP/points but is **not** required for the streak that day.
- Completing **100% of that day's habits** awards a **streak shield** if the user does not already hold one. Maximum **one** shield held at a time.
- On a missed qualifying day: if a shield is held it is **consumed and the streak value is preserved (not incremented)**; otherwise the streak resets to 0.
- **XP is never subtracted.** Un-checking a habit does not remove XP. Missing days does not remove XP.
- Award ordering is fixed: habit check-in < full-day bonus < weekly reflection.
- Reset points may only be spent on **cosmetic / content unlocks**. The core programme is never paywalled and currency can never buy programme advantage.
- v1 reward catalogue ships with a small fixed set of **5 items**.
- Soft recommend **3–5 active areas** — guidance in copy, never a hard lock.
- **RLS is enabled on every table in the `public` schema.** User-owned tables use `(select auth.uid()) = user_id` predicates with `TO authenticated`. `UPDATE` policies always have both `USING` and `WITH CHECK`.
- Every foreign key column has an index.
- Mid-programme habit edits affect **future days only**; past check-ins remain history.
- Mobile-first. Today is designed for thumb reach. XP / streak / points appear as **one compact status row**, not a second game UI.
- Visual direction: minimal, clean, atmospheric. **No purple gradients, no dense dashboards, no card-heavy heroes.** Warm coach microcopy throughout; supportive on missed days, never shaming.
- The day fast-forward QA helper must be **unreachable in production** — gated on a server-only env var that is never set on Vercel production.
- Never expose `SUPABASE_SERVICE_ROLE_KEY` to the browser. Only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` may carry the `NEXT_PUBLIC_` prefix.
- Pin exact dependency versions and commit `package-lock.json`.

---

## Fixed Values Decided In This Plan

The spec deferred these to the implementation plan. They are now fixed. The ten items in **Open Decisions** were resolved on 2026-09-08 (accepted defaults; decision 6 upgraded so owned rewards change the UI).

**Award amounts** (satisfies the required ordering):

| Award | XP | Reset points |
|-------|-----|--------------|
| Habit check-in | 10 | 2 |
| Full-day bonus (100% of that day's scheduled habits) | 25 | 5 |
| Weekly reflection saved | 50 | 15 |

A typical 4-habit programme completed perfectly earns 840 + 525 + 150 = **1515 XP** and 168 + 105 + 45 = **318 reset points** across 21 days.

**Level curve** (cumulative XP thresholds, coach-flavoured titles):

| Level | Min XP | Title |
|-------|--------|-------|
| 1 | 0 | Day one energy |
| 2 | 100 | Getting started |
| 3 | 250 | Finding your rhythm |
| 4 | 450 | Building momentum |
| 5 | 700 | Locked in |
| 6 | 1000 | Reset in motion |
| 7 | 1400 | This is who you are now |

**Reward catalogue** (5 items, 390 points total — deliberately more than one cycle can buy):

| Key | Name | Cost | Type |
|-----|------|------|------|
| `coach_pack_grit` | Grit note pack | 40 | `coach_note_pack` |
| `coach_pack_calm` | Calm note pack | 40 | `coach_note_pack` |
| `theme_dawn` | Dawn theme | 80 | `theme` |
| `theme_deep` | Deep theme | 80 | `theme` |
| `badge_finisher` | 21-day finisher badge | 150 | `badge` |

**Ambiguities resolved:**

1. *"Calendar day" needs a timezone.* Each `programme` row stores an IANA `timezone` captured from the browser at setup (`Intl.DateTimeFormat().resolvedOptions().timeZone`). The current day index is always computed server-side in that timezone.
2. *When does the streak update?* Positive outcomes apply **immediately** — hitting the 50% threshold bumps the streak today, hitting 100% grants the shield today. Negative outcomes (miss → shield consume or reset) only apply once the day is **over**. Two watermark columns on `progress` (`last_counted_day`, `last_settled_day`) keep this idempotent with no cron job; evaluation rolls forward lazily on every `/app` page load.
3. *How do mid-programme edits "update future days"?* Each `programme_habit` carries an `active_from_day` / `active_to_day` window. Removing a habit on day 12 sets `active_to_day = 11`. Days 1–11 keep their check-ins and their original scheduled counts.
4. *Where do awards live — SQL or TypeScript?* TypeScript, for testability. Idempotency is enforced by partial unique indexes on the `xp_event` ledger, and `progress` is a rollup that is recomputed on every evaluation, so partial failures self-heal on the next request. The single exception is reward redemption, which is a `SECURITY DEFINER` RPC to prevent double-spend.
5. *`progress` is writable by its owner under RLS.* In a personal single-user app the "user forges their own XP" threat is not real. Documented hardening path: move progress writes behind `SECURITY DEFINER` RPCs and drop the update policy.

---

## File Structure

```
life-reset/
├── docs/superpowers/{specs,plans}/
├── supabase/
│   ├── config.toml
│   └── migrations/
│       ├── 20260907120000_content_tables.sql      # area_catalogue, habit_template, weekly_prompt, reward_catalogue
│       ├── 20260907120100_user_tables.sql         # user_area, programme, programme_habit, habit_check_in,
│       │                                          #   reflection, progress, unlock, xp_event
│       ├── 20260907120200_rls_policies.sql        # RLS enable + all policies + grants
│       ├── 20260907120300_redeem_reward.sql       # SECURITY DEFINER spend RPC
│       └── 20260907120400_seed_content.sql        # idempotent content seed
├── src/
│   ├── app/
│   │   ├── layout.tsx                 # root layout, fonts, metadata
│   │   ├── globals.css                # Tailwind 4 entry + design tokens
│   │   ├── page.tsx                   # public landing
│   │   ├── login/{page.tsx,actions.ts}
│   │   ├── signup/{page.tsx,actions.ts}
│   │   ├── auth/sign-out/route.ts
│   │   ├── app/                       # → URL /app (authenticated area)
│   │   │   ├── layout.tsx             # auth gate + app shell
│   │   │   ├── page.tsx               # Today
│   │   │   ├── actions.ts             # check-in server actions
│   │   │   ├── setup/{page.tsx,actions.ts,areas-step.tsx,plan-step.tsx}
│   │   │   ├── areas/{page.tsx,actions.ts}
│   │   │   ├── plan/{page.tsx,actions.ts}
│   │   │   ├── reflect/{page.tsx,actions.ts}
│   │   │   ├── rewards/{page.tsx,actions.ts}
│   │   │   ├── account/{page.tsx,actions.ts}
│   │   │   └── complete/page.tsx
│   │   └── api/qa/fast-forward/route.ts   # env-gated, dev only
│   ├── components/
│   │   ├── status-row.tsx             # XP / streak / shield / points compact row
│   │   ├── habit-item.tsx             # single check-in row with optimistic toggle
│   │   ├── coach-line.tsx
│   │   └── ui/{button.tsx,field.tsx,sheet.tsx}
│   ├── lib/
│   │   ├── supabase/{client.ts,server.ts,admin.ts}
│   │   ├── domain/                    # pure TypeScript, zero imports from lib/data or supabase
│   │   │   ├── constants.ts           # award amounts, level curve, caps
│   │   │   ├── day.ts                 # timezone → local date → day index
│   │   │   ├── plan.ts                # generatePlan()
│   │   │   ├── schedule.ts            # scheduledCountForDay()
│   │   │   ├── streak.ts              # settleDay/applyOpenDay/rollForward
│   │   │   ├── awards.ts              # award computation + applyAwards
│   │   │   └── levels.ts              # levelForXp()
│   │   ├── data/                      # all Supabase reads/writes
│   │   │   ├── catalogue.ts
│   │   │   ├── programme.ts
│   │   │   ├── today.ts
│   │   │   ├── areas.ts
│   │   │   ├── reflections.ts
│   │   │   ├── rewards.ts
│   │   │   └── progress.ts
│   │   ├── auth.ts                    # requireUser()
│   │   ├── qa.ts                      # isQaEnabled(), getQaDayOffset()
│   │   ├── appearance.ts              # owned unlocks → active theme + coach pack
│   │   └── db.types.ts                # generated Supabase types
│   └── content/coach.ts               # coach microcopy (default / grit / calm packs)
├── tests/
│   ├── unit/{plan,streak,awards,levels,day,schedule,qa,appearance}.test.ts
│   ├── integration/{rls.test.ts,auth-gate.test.ts}
│   └── helpers/{supabase-admin.ts,server.ts}
├── proxy.ts                           # Next.js 16 request proxy (session refresh)
├── vitest.config.ts
├── vitest.integration.config.ts
├── .env.local.example
└── package.json
```

**Why this decomposition:** `src/lib/domain/` is the entire rulebook and has no I/O, so every business rule in spec sections 5 and 6 is a pure function with a fast unit test. `src/lib/data/` is the only place that talks to Supabase, so RLS behaviour and query shape live in one reviewable layer. Route files stay thin — they compose a data call, a domain call, and a component.

> **Note on `src/app/app/`:** because the project uses the `src/` directory, the App Router root is `src/app/`. The authenticated area at URL `/app` therefore lives at `src/app/app/`. This looks odd but is correct. Do not "fix" it to a route group — `(app)` would not produce the `/app` URL prefix the spec requires.

---

# Phase 0 — Scaffold and landing page

## Task 1: Next.js scaffold, Tailwind, Vitest, landing page

**Files:**
- Create: whole project skeleton via `create-next-app`
- Create: `vitest.config.ts`
- Create: `src/app/page.tsx`, `src/app/layout.tsx`, `src/app/globals.css`
- Create: `src/content/coach.ts`
- Create: `tests/unit/smoke.test.ts`
- Modify: `README.md`
- Modify: `.gitignore`

**Interfaces:**
- Produces: an installable, buildable Next.js app; `npm run dev`, `npm run build`, `npm run test` all work. Path alias `@/*` → `src/*`.

- [x] **Step 1: Scaffold the app into the existing repo**

Run from the repo root. `create-next-app` refuses a non-empty directory, so scaffold into a temp dir and move the files in.

```bash
cd /Users/steve/Projects/life-reset
npx create-next-app@16.3.4 tmp-scaffold \
  --ts --tailwind --eslint --app --src-dir --turbopack \
  --import-alias "@/*" --use-npm --yes
rsync -a --exclude .git --exclude node_modules tmp-scaffold/ ./
rm -rf tmp-scaffold
npm install
```

`create-next-app` rejects a directory whose name starts with a period (`npm` naming rules), so use `tmp-scaffold` rather than `.tmp-scaffold`. After pinning, also install `@types/node@22` — Vitest 5.0.0's optional peer is `@types/node@^22`, and the create-next-app scaffold ships `^20`. Pin `tailwindcss@4.3.3` and `@tailwindcss/postcss@4.3.3` to match the stack.

- [x] **Step 2: Pin exact versions and add test tooling**

```bash
npm install --save-exact next@16.3.4 react@19.2.0 react-dom@19.2.0
npm install --save-exact --save-dev vitest@5.0.0 @vitejs/plugin-react@5.0.4 jsdom@28.0.0
```

- [x] **Step 3: Add Vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
  },
});
```

Add scripts to `package.json`:

```json
{
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [x] **Step 4: Write a smoke test**

Create `tests/unit/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { coachLineForSetup } from '@/content/coach';

describe('coach copy', () => {
  it('greets without shaming', () => {
    expect(coachLineForSetup()).toMatch(/reset/i);
  });
});
```

- [x] **Step 5: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Failed to resolve import "@/content/coach"`.

- [x] **Step 6: Add coach copy module**

Create `src/content/coach.ts`:

```ts
export function coachLineForSetup(): string {
  return "Twenty-one days. Small things, done often. Let's pick where your reset starts.";
}

export function coachLineForDay(
  day: number,
  { completed, scheduled }: { completed: number; scheduled: number },
): string {
  if (scheduled === 0) return `Day ${day}. Nothing scheduled today — rest counts too.`;
  if (completed === 0) return `Day ${day}. Nothing ticked yet. Pick the easiest one and start there.`;
  if (completed >= scheduled) return `Day ${day}. All of it. That's a full day — well done.`;
  return `Day ${day}. ${completed} of ${scheduled} down. Keep going, you're in it.`;
}

export function coachLineForMiss(): string {
  return "Yesterday got away from you. That happens — today is a clean page.";
}
```

- [x] **Step 7: Run the test to verify it passes**

Run: `npm test`
Expected: PASS, 1 test.

- [x] **Step 8: Build the landing page**

Replace `src/app/page.tsx`:

```tsx
import Link from 'next/link';
import { coachLineForSetup } from '@/content/coach';

export default function LandingPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-between px-6 py-16">
      <div className="space-y-6">
        <p className="text-xs uppercase tracking-[0.2em] text-stone-500">21 days</p>
        <h1 className="text-4xl font-semibold leading-tight text-stone-900">
          Reset the parts of your life that have drifted.
        </h1>
        <p className="text-lg leading-relaxed text-stone-600">{coachLineForSetup()}</p>
      </div>
      <div className="space-y-4">
        <Link
          href="/signup"
          className="block rounded-full bg-stone-900 px-6 py-4 text-center text-base font-medium text-stone-50"
        >
          Start your reset
        </Link>
        <p className="text-center text-sm text-stone-500">
          Already started? <Link href="/login" className="underline">Sign in</Link>
        </p>
      </div>
    </main>
  );
}
```

Replace `src/app/layout.tsx`:

```tsx
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Life Reset',
  description: 'A 21-day guided reset for the parts of your life that have drifted.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-stone-50 text-stone-900 antialiased">{children}</body>
    </html>
  );
}
```

- [x] **Step 9: Verify the app builds and renders**

Run: `npm run build && npm run typecheck && npm run lint`
Expected: build succeeds, no type errors, no lint errors.

Run: `npm run dev`, open `http://localhost:3000`.
Expected: landing page with headline, one primary CTA, one secondary sign-in link. No gradients, no cards.

- [x] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js app with Tailwind, Vitest and landing page"
```

---

# Phase 1 — Database schema and RLS

## Task 2: Supabase local project and content tables

**Files:**
- Create: `supabase/config.toml` (generated)
- Create: `supabase/migrations/20260907120000_content_tables.sql`
- Create: `.env.local.example`
- Modify: `.gitignore`

**Interfaces:**
- Produces: tables `public.area_catalogue`, `public.habit_template`, `public.weekly_prompt`, `public.reward_catalogue`. All keyed by a stable text `key` column that later tasks reference.

- [ ] **Step 1: Initialise and start Supabase locally**

```bash
npx supabase@2.116.0 init
npx supabase start
npx supabase status
```

Expected: `supabase/config.toml` created; `supabase status` prints `API URL: http://127.0.0.1:54321`, a publishable key and a service_role key.

- [ ] **Step 2: Record env var template**

Create `.env.local.example`:

```bash
# Local Supabase (from `npx supabase status`)
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=

# Server-only. Used by integration tests to create fixture users. Never set on Vercel production.
SUPABASE_SERVICE_ROLE_KEY=

# Server-only QA day fast-forward. Never set on Vercel production.
LIFE_RESET_QA_MODE=
```

Append to `.gitignore`:

```
.env.local
.env*.local
supabase/.branches
supabase/.temp
```

- [ ] **Step 3: Create the content tables migration**

```bash
npx supabase migration new content_tables
```

Write the generated file (rename the timestamp prefix to match if the CLI produced a different one — always use the CLI-generated filename, never a hand-invented one):

```sql
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
```

- [ ] **Step 4: Apply and verify**

```bash
npx supabase db reset
npx supabase migration list --local
```

Expected: migration listed as applied locally, no errors.

- [ ] **Step 5: Commit**

```bash
git add supabase .env.local.example .gitignore
git commit -m "feat(db): add content catalogue tables"
```

---

## Task 3: User-owned tables

**Files:**
- Create: `supabase/migrations/<ts>_user_tables.sql`

**Interfaces:**
- Produces: `public.user_area`, `public.programme`, `public.programme_habit`, `public.habit_check_in`, `public.reflection`, `public.progress`, `public.unlock`, `public.xp_event`, and the trigger function `public.set_updated_at()`.
- Key invariants later tasks rely on: one open programme per user (`programme_one_open_per_user`), one check-in per habit per day (`habit_check_in_one_per_day`), one reflection per programme per day (`reflection_one_per_day`), award idempotency (`xp_event_habit_uniq`, `xp_event_day_uniq`).

- [ ] **Step 1: Create the migration**

```bash
npx supabase migration new user_tables
```

- [ ] **Step 2: Write the shared `updated_at` trigger**

Put this at the top of the migration file:

```sql
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
```

- [ ] **Step 3: Write `user_area` and `programme`**

Append to the same migration file:

```sql
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
```

- [ ] **Step 4: Write `programme_habit`, `habit_check_in` and `reflection`**

```sql
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
```

- [ ] **Step 5: Write `progress`, `unlock` and `xp_event`**

```sql
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
```

- [ ] **Step 6: Apply and verify constraints exist**

```bash
npx supabase db reset
npx supabase migration list --local
```

Expected: all migrations applied. Then confirm the uniqueness rules bite:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "\d public.habit_check_in"
```

Expected output includes `"habit_check_in_one_per_day" UNIQUE CONSTRAINT, btree (programme_habit_id, day_index)`.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations
git commit -m "feat(db): add user-owned programme, check-in, reflection and progress tables"
```

---

## Task 4: RLS policies and RLS isolation integration test

**Files:**
- Create: `supabase/migrations/<ts>_rls_policies.sql`
- Create: `tests/helpers/supabase-admin.ts`
- Create: `tests/integration/rls.test.ts`
- Create: `vitest.integration.config.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: RLS enabled on all 12 public tables. Content tables are readable by `authenticated` only. User tables are fully scoped to the owner.
- Produces: `tests/helpers/supabase-admin.ts` exporting `adminClient()`, `createTestUser(email)`, `deleteTestUser(id)`, `userClient(accessToken)` — used again in later integration tasks.

- [ ] **Step 1: Write the failing test first**

Create `tests/helpers/supabase-admin.ts`:

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export function adminClient(): SupabaseClient {
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export type TestUser = { id: string; email: string; password: string; accessToken: string };

export async function createTestUser(email: string): Promise<TestUser> {
  const password = 'test-password-12345';
  const admin = adminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;

  const anon = createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const signIn = await anon.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;

  return { id: data.user!.id, email, password, accessToken: signIn.data.session!.access_token };
}

export async function deleteTestUser(id: string): Promise<void> {
  const { error } = await adminClient().auth.admin.deleteUser(id);
  if (error) throw error;
}

export function userClient(accessToken: string): SupabaseClient {
  return createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

/** Signed-out client. Carries the publishable key only, so it acts as `anon`. */
export function anonClient(): SupabaseClient {
  return createClient(url, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
```

Create `tests/integration/rls.test.ts`:

```ts
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
```

- [ ] **Step 2: Add the integration test runner**

```bash
npm install --save-exact @supabase/supabase-js@2.115.0
npm install --save-exact --save-dev dotenv@17.2.4
```

Create `vitest.integration.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

config({ path: '.env.local' });

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
```

Add to `package.json` scripts:

```json
{
  "test:integration": "vitest run --config vitest.integration.config.ts"
}
```

Fill `.env.local` with the values from `npx supabase status`.

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test:integration`
Expected: FAIL. Without RLS, Bob can read Alice's programme, so `hides Alice's programme from Bob` fails with a non-empty array.

- [ ] **Step 4: Write the RLS migration**

```bash
npx supabase migration new rls_policies
```

Write:

```sql
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
```

- [ ] **Step 5: Add the content seed so the catalogue test has data**

```bash
npx supabase migration new seed_content
```

Write the full seed. Every statement is idempotent so `db reset` and re-runs both work.

```sql
insert into public.area_catalogue (key, name, description, sort_order) values
  ('sleep',             'Sleep',              'Wind down earlier and wake up steadier.',                1),
  ('fitness',           'Fitness',            'Move your body most days. No gym required.',             2),
  ('nutrition',         'Nutrition',          'Eat in a way that leaves you steady, not stuffed.',      3),
  ('hydration',         'Hydration',          'Drink enough water that your head stops arguing.',       4),
  ('digital_detox',     'Digital detox',      'Put the phone down before it puts you down.',            5),
  ('focus',             'Focus / deep work',  'Protect one block of real concentration a day.',         6),
  ('work_boundaries',   'Work boundaries',    'Clock off properly, and mean it.',                       7),
  ('money',             'Money basics',       'Know what is coming in and what is going out.',          8),
  ('home_reset',        'Home reset',         'Ten minutes a day keeps the chaos down.',                9),
  ('declutter',         'Declutter',          'Let go of a little more each day.',                     10),
  ('relationships',     'Relationships',      'Show up for the people closest to you.',                11),
  ('social',            'Social connection',  'Stay in touch with the wider circle.',                  12),
  ('mindfulness',       'Mindfulness',        'Give your head somewhere quiet to land.',               13),
  ('outdoor',           'Outdoor time',       'Get outside, whatever the weather is doing.',           14),
  ('creative',          'Creative practice',  'Make something small, often.',                          15),
  ('learning',          'Learning',           'Feed your curiosity in small doses.',                   16),
  ('self_care',         'Self-care',          'Treat yourself like someone you are responsible for.',  17),
  ('morning_routine',   'Morning routine',    'Start the day on purpose.',                             18),
  ('evening_winddown',  'Evening wind-down',  'Give the day a proper ending.',                         19)
on conflict (key) do update
  set name = excluded.name,
      description = excluded.description,
      sort_order = excluded.sort_order;

insert into public.habit_template (key, area_key, title, detail, effort, sort_order) values
  ('sleep_lights_out',        'sleep',            'Lights out by your target time',                'Pick a time and treat it like an appointment.',     2, 1),
  ('sleep_no_screens',        'sleep',            'No screens for 30 minutes before bed',          'Phone charges in another room if you can manage it.', 2, 2),
  ('fitness_walk',            'fitness',          'Walk for 20 minutes',                           'Pace does not matter. Getting out does.',           1, 1),
  ('fitness_strength',        'fitness',          'Do a 10-minute strength set',                   'Bodyweight is fine. Press-ups, squats, planks.',    2, 2),
  ('nutrition_veg',           'nutrition',        'Eat vegetables with two meals',                 'Frozen counts. Tinned counts.',                     1, 1),
  ('nutrition_no_late',       'nutrition',        'No snacks after 9pm',                           'Close the kitchen and mean it.',                    2, 2),
  ('hydration_bottle',        'hydration',        'Finish a full water bottle',                    'Fill it once in the morning, once after lunch.',    1, 1),
  ('hydration_morning_glass', 'hydration',        'Drink a glass of water before coffee',          'Water first, then the good stuff.',                 1, 2),
  ('digital_phone_out',       'digital_detox',    'Keep your phone out of the bedroom',            'Buy a cheap alarm clock. It is worth it.',          2, 1),
  ('digital_no_scroll_hour',  'digital_detox',    'No scrolling for the first hour awake',         'Let your own thoughts go first.',                   2, 2),
  ('focus_block',             'focus',            'Do one 25-minute focus block',                  'Timer on, notifications off, one thing only.',      1, 1),
  ('focus_single_task',       'focus',            'Pick one priority and finish it',               'Decide it before you open anything else.',          2, 2),
  ('work_stop_time',          'work_boundaries',  'Stop work at your set time',                    'Say the time out loud in the morning.',             2, 1),
  ('work_no_email_evening',   'work_boundaries',  'No work email after dinner',                    'It will still be there tomorrow.',                  1, 2),
  ('money_check_balance',     'money',            'Check your balance once',                       'Once. Looking is not the same as worrying.',        1, 1),
  ('money_log_spend',         'money',            'Log everything you spent today',                'Notes app is fine. Accuracy beats neatness.',       2, 2),
  ('home_ten_minutes',        'home_reset',       'Do a 10-minute tidy',                           'Set a timer and stop when it goes.',                1, 1),
  ('home_clear_surface',      'home_reset',       'Clear one surface completely',                  'One table, one counter, one desk.',                 1, 2),
  ('declutter_one_item',      'declutter',        'Get rid of one thing',                          'Bin, charity bag, or sell pile.',                   1, 1),
  ('declutter_one_drawer',    'declutter',        'Sort one drawer or shelf',                      'Small container, finite job.',                      2, 2),
  ('rel_real_conversation',   'relationships',    'Have one proper conversation, phone away',      'Ten minutes of actual attention.',                  2, 1),
  ('rel_small_kindness',      'relationships',    'Do one small kind thing for someone close',     'Unprompted, unannounced.',                          1, 2),
  ('social_message',          'social',           'Message someone you have not spoken to lately', 'No agenda needed.',                                 1, 1),
  ('social_plan',             'social',           'Make or confirm one plan',                      'A date in the diary beats a vague intention.',      2, 2),
  ('mind_breathe',            'mindfulness',      'Take five slow breaths, eyes closed',           'Sixty seconds. That is the whole habit.',           1, 1),
  ('mind_sit',                'mindfulness',      'Sit quietly for 10 minutes',                    'No app required. A chair and a timer.',             2, 2),
  ('outdoor_daylight',        'outdoor',          'Get 15 minutes of daylight',                    'Earlier is better. Cloud still counts.',            1, 1),
  ('outdoor_no_headphones',   'outdoor',          'Take one walk without headphones',              'Let the world be the soundtrack.',                  1, 2),
  ('creative_ten',            'creative',         'Spend 10 minutes making something',             'Bad output is still output.',                       1, 1),
  ('creative_capture',        'creative',         'Capture one idea in writing',                   'One line is enough.',                               1, 2),
  ('learning_read',           'learning',         'Read 10 pages',                                 'Paper or screen, your call.',                       1, 1),
  ('learning_lesson',         'learning',         'Do one lesson or one chapter',                  'Finish the unit, do not just start it.',            2, 2),
  ('care_one_kind_thing',     'self_care',        'Do one thing purely because it is good for you','Not productive. Just good.',                        1, 1),
  ('care_reframe',            'self_care',        'Catch one harsh thought and reframe it',        'Notice it, then say the kinder version.',           2, 2),
  ('morning_no_snooze',       'morning_routine',  'Get up on the first alarm',                     'Feet on floor before the second thought.',          2, 1),
  ('morning_three_things',    'morning_routine',  'Write your three things for the day',           'Three. Not ten.',                                   1, 2),
  ('evening_shutdown',        'evening_winddown', 'Do a five-minute shutdown routine',             'Close the laptop, write tomorrow''s first task.',   1, 1),
  ('evening_tomorrow_ready',  'evening_winddown', 'Set out what you need for tomorrow',            'Clothes, bag, bottle. Future you says thanks.',     1, 2)
on conflict (key) do update
  set area_key = excluded.area_key,
      title = excluded.title,
      detail = excluded.detail,
      effort = excluded.effort,
      sort_order = excluded.sort_order;

insert into public.weekly_prompt (key, day_index, prompt, sort_order) values
  ('wk1_settling', 7,
   'One week in. What has actually felt different, and what has been harder than you expected?', 1),
  ('wk2_halfway', 14,
   'Two weeks down. Which habit has started to feel automatic, and which one are you still forcing?', 1),
  ('wk3_finish', 21,
   'Last day. What is worth keeping, what are you letting go of, and what would you tell yourself on day one?', 1)
on conflict (key) do update
  set day_index = excluded.day_index, prompt = excluded.prompt;

insert into public.reward_catalogue (key, name, description, cost_points, reward_type, payload, sort_order) values
  ('coach_pack_grit',  'Grit note pack',         'Blunter coach lines for the days you need pushing.',  40,  'coach_note_pack', '{"pack":"grit"}',      1),
  ('coach_pack_calm',  'Calm note pack',         'Gentler coach lines for the days you need holding.',  40,  'coach_note_pack', '{"pack":"calm"}',      2),
  ('theme_dawn',       'Dawn theme',             'Warm light palette for the whole app.',               80,  'theme',           '{"theme":"dawn"}',     3),
  ('theme_deep',       'Deep theme',             'Low-light palette for evening check-ins.',            80,  'theme',           '{"theme":"deep"}',     4),
  ('badge_finisher',   '21-day finisher badge',  'A quiet mark on your account for finishing a cycle.', 150, 'badge',           '{"badge":"finisher"}', 5)
on conflict (key) do update
  set name = excluded.name,
      description = excluded.description,
      cost_points = excluded.cost_points,
      reward_type = excluded.reward_type,
      payload = excluded.payload,
      sort_order = excluded.sort_order;
```

- [ ] **Step 6: Apply and re-run the test**

```bash
npx supabase db reset
npm run test:integration
```

Expected: PASS, 6 tests.

- [ ] **Step 7: Check the Supabase advisors are clean**

Run: `npx supabase db advisors --local` (or the MCP `get_advisors` tool with type `security`).
Expected: no `rls_disabled_in_public` findings. Resolve anything else it reports before committing.

- [ ] **Step 8: Generate database types**

```bash
npx supabase gen types typescript --local > src/lib/db.types.ts
```

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(db): add RLS policies, content seed and RLS isolation tests"
```

---

# Phase 2 — Auth and the `/app` gate

## Task 5: Supabase clients and session refresh proxy

**Files:**
- Create: `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/admin.ts`
- Create: `proxy.ts`
- Create: `src/lib/auth.ts`

**Interfaces:**
- Produces: `createBrowserSupabase()` from `client.ts`; `createServerSupabase(): Promise<SupabaseClient<Database>>` from `server.ts`; `createAdminSupabase()` from `admin.ts`.
- Produces: `requireUser(): Promise<{ id: string; email: string }>` from `src/lib/auth.ts` — redirects to `/login` when there is no session. Every authenticated data module and Server Action calls this first.

- [ ] **Step 1: Install the SSR package**

```bash
npm install --save-exact @supabase/ssr@0.12.6
```

- [ ] **Step 2: Write the browser client**

Create `src/lib/supabase/client.ts`:

```ts
import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/lib/db.types';

export function createBrowserSupabase() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
```

- [ ] **Step 3: Write the server client**

Create `src/lib/supabase/server.ts`:

```ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/lib/db.types';

export async function createServerSupabase() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component. proxy.ts refreshes the session,
            // so this is safe to swallow.
          }
        },
      },
    },
  );
}
```

Create `src/lib/supabase/admin.ts`:

```ts
import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/db.types';

/** Service-role client. Never import this from a Client Component. */
export function createAdminSupabase() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
```

```bash
npm install --save-exact server-only@0.0.1
```

- [ ] **Step 4: Write the proxy**

Next.js 16 renamed `middleware.ts` to `proxy.ts`. Create `proxy.ts` at the repo root (sibling of `package.json`, not inside `src/`):

```ts
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
          for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
        },
      },
    },
  );

  // Do not put code between createServerClient and getClaims. Anything that
  // touches cookies in between causes random sign-outs that are painful to debug.
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims && request.nextUrl.pathname.startsWith('/app')) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)'],
};
```

- [ ] **Step 5: Write the server-side gate helper**

The proxy is a first line of defence, not the authorisation boundary. Every authenticated page and action independently verifies the user. Create `src/lib/auth.ts`:

```ts
import 'server-only';
import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';

export type AppUser = { id: string; email: string };

export async function requireUser(): Promise<AppUser> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect('/login');
  return { id: data.user.id, email: data.user.email ?? '' };
}

export async function getOptionalUser(): Promise<AppUser | null> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  return data.user ? { id: data.user.id, email: data.user.email ?? '' } : null;
}
```

- [ ] **Step 6: Verify the build**

Run: `npm run build && npm run typecheck`
Expected: build succeeds, `proxy.ts` compiled (the build output lists a "Proxy" entry).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(auth): add Supabase browser/server clients, session proxy and requireUser gate"
```

---

## Task 6: Sign up, sign in, sign out, and the auth-gate integration test

**Files:**
- Create: `src/app/login/page.tsx`, `src/app/login/actions.ts`
- Create: `src/app/signup/page.tsx`, `src/app/signup/actions.ts`
- Create: `src/app/auth/sign-out/route.ts`
- Create: `src/app/app/layout.tsx`, `src/app/app/page.tsx` (placeholder Today)
- Create: `src/components/ui/{button.tsx,field.tsx}`
- Create: `tests/helpers/server.ts`
- Create: `tests/integration/auth-gate.test.ts`

**Interfaces:**
- Consumes: `requireUser` from `src/lib/auth.ts`, `createServerSupabase` from `src/lib/supabase/server.ts`.
- Produces: working `/login`, `/signup`, `POST /auth/sign-out`; `/app` redirects unauthenticated visitors to `/login`.
- Produces: `tests/helpers/server.ts` exporting `startAppServer(): Promise<{ baseUrl: string; stop: () => Promise<void> }>` — reused by later integration tests.

- [ ] **Step 1: Write the failing auth-gate test**

Create `tests/helpers/server.ts`:

```ts
import { spawn, type ChildProcess } from 'node:child_process';

const PORT = 3123;

export async function startAppServer() {
  const child: ChildProcess = spawn('npm', ['run', 'start', '--', '--port', String(PORT)], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NODE_ENV: 'production' },
  });

  const baseUrl = `http://127.0.0.1:${PORT}`;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      await fetch(baseUrl, { redirect: 'manual' });
      return { baseUrl, stop: async () => void child.kill('SIGTERM') };
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  child.kill('SIGTERM');
  throw new Error('app server did not start within 60s');
}
```

Create `tests/integration/auth-gate.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startAppServer } from '../helpers/server';

let baseUrl: string;
let stop: () => Promise<void>;

beforeAll(async () => {
  ({ baseUrl, stop } = await startAppServer());
});

afterAll(async () => {
  await stop();
});

describe('auth gate', () => {
  it('serves the landing page to anonymous visitors', async () => {
    const res = await fetch(baseUrl, { redirect: 'manual' });
    expect(res.status).toBe(200);
  });

  it('redirects anonymous visitors away from /app', async () => {
    const res = await fetch(`${baseUrl}/app`, { redirect: 'manual' });
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login');
  });

  it('redirects anonymous visitors away from nested /app routes', async () => {
    const res = await fetch(`${baseUrl}/app/rewards`, { redirect: 'manual' });
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login');
  });

  it('serves /login to anonymous visitors', async () => {
    const res = await fetch(`${baseUrl}/login`, { redirect: 'manual' });
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run build && npm run test:integration -- auth-gate`
Expected: FAIL — `/app` returns 404 because no route exists yet.

- [ ] **Step 3: Add shared form primitives**

Create `src/components/ui/button.tsx`:

```tsx
import type { ComponentProps } from 'react';

export function Button({ className = '', ...props }: ComponentProps<'button'>) {
  return (
    <button
      {...props}
      className={`w-full rounded-full bg-stone-900 px-6 py-4 text-base font-medium text-stone-50 disabled:opacity-50 ${className}`}
    />
  );
}
```

Create `src/components/ui/field.tsx`:

```tsx
import type { ComponentProps } from 'react';

export function Field({ label, ...props }: ComponentProps<'input'> & { label: string }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm text-stone-600">{label}</span>
      <input
        {...props}
        className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-base outline-none focus:border-stone-900"
      />
    </label>
  );
}
```

- [ ] **Step 4: Add sign-up**

Create `src/app/signup/actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';

export type AuthFormState = { error: string | null };

export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!email || password.length < 8) {
    return { error: 'Enter an email and a password of at least 8 characters.' };
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signUp({ email, password });
  if (error) return { error: error.message };

  revalidatePath('/', 'layout');
  redirect('/app');
}
```

Create `src/app/signup/page.tsx`:

```tsx
'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { signUp, type AuthFormState } from './actions';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';

const initial: AuthFormState = { error: null };

export default function SignUpPage() {
  const [state, action, pending] = useActionState(signUp, initial);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-6 py-16">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold">Start your reset</h1>
        <p className="text-stone-600">Twenty-one days, from wherever you are today.</p>
      </div>
      <form action={action} className="space-y-4">
        <Field label="Email" name="email" type="email" autoComplete="email" required />
        <Field label="Password" name="password" type="password" autoComplete="new-password" required minLength={8} />
        {state.error ? <p className="text-sm text-red-700">{state.error}</p> : null}
        <Button type="submit" disabled={pending}>{pending ? 'Creating…' : 'Create account'}</Button>
      </form>
      <p className="text-center text-sm text-stone-500">
        Already started? <Link href="/login" className="underline">Sign in</Link>
      </p>
    </main>
  );
}
```

- [ ] **Step 5: Add sign-in and sign-out**

Create `src/app/login/actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';

export type AuthFormState = { error: string | null };

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const next = String(formData.get('next') ?? '/app');

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: 'That email and password did not match. Try again.' };

  revalidatePath('/', 'layout');
  redirect(next.startsWith('/app') ? next : '/app');
}
```

Create `src/app/login/page.tsx` — identical shape to the sign-up page but calling `signIn`, with a hidden `next` field populated from `searchParams`:

```tsx
'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { signIn, type AuthFormState } from './actions';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';

const initial: AuthFormState = { error: null };

function LoginForm() {
  const [state, action, pending] = useActionState(signIn, initial);
  const next = useSearchParams().get('next') ?? '/app';

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <Field label="Email" name="email" type="email" autoComplete="email" required />
      <Field label="Password" name="password" type="password" autoComplete="current-password" required />
      {state.error ? <p className="text-sm text-red-700">{state.error}</p> : null}
      <Button type="submit" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-6 py-16">
      <h1 className="text-3xl font-semibold">Welcome back</h1>
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
      <p className="text-center text-sm text-stone-500">
        New here? <Link href="/signup" className="underline">Start your reset</Link>
      </p>
    </main>
  );
}
```

`useSearchParams` bails out to client rendering, which is why the form is wrapped in `Suspense`.

Create `src/app/auth/sign-out/route.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/', request.url), { status: 303 });
}
```

- [ ] **Step 6: Add the `/app` shell and placeholder Today**

Create `src/app/app/layout.tsx`:

```tsx
import Link from 'next/link';
import { requireUser } from '@/lib/auth';

const NAV = [
  { href: '/app', label: 'Today' },
  { href: '/app/plan', label: 'Plan' },
  { href: '/app/reflect', label: 'Reflect' },
  { href: '/app/rewards', label: 'Rewards' },
  { href: '/app/account', label: 'Account' },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <div className="flex-1 px-6 pb-28 pt-10">{children}</div>
      <nav className="fixed inset-x-0 bottom-0 mx-auto flex max-w-md justify-between border-t border-stone-200 bg-stone-50/95 px-6 py-3 backdrop-blur">
        {NAV.map((item) => (
          <Link key={item.href} href={item.href} className="text-xs text-stone-600">
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
```

Create `src/app/app/page.tsx` as a placeholder that Task 15 replaces:

```tsx
import { requireUser } from '@/lib/auth';

export default async function TodayPage() {
  const user = await requireUser();
  return <p className="text-stone-600">Signed in as {user.email}.</p>;
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npm run build && npm run test:integration`
Expected: PASS — 4 auth-gate tests plus the 6 RLS tests.

- [ ] **Step 8: Manual check**

Run `npm run dev`, sign up with a new email, and confirm you land on `/app`. In the Supabase Studio Auth tab (`http://127.0.0.1:54323`) the new user appears. Sign out via a `POST` to `/auth/sign-out` and confirm `/app` bounces to `/login`.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(auth): add sign up, sign in, sign out and the /app route gate"
```

---

# Phase 3 — Domain rules (pure TypeScript, TDD)

Every task in this phase is pure logic with no I/O. These are the tests spec section 11 requires.

## Task 7: Constants and the level curve

**Files:**
- Create: `src/lib/domain/constants.ts`, `src/lib/domain/levels.ts`
- Test: `tests/unit/levels.test.ts`

**Interfaces:**
- Produces: `AWARDS: Record<AwardKind, AwardValue>`, `AwardKind`, `AwardValue`, `MAX_SHIELDS`, `PROGRAMME_DAYS`, `REFLECTION_DAYS`, `MAX_TOTAL_HABITS`, `MAX_HABITS_PER_AREA`, `RECOMMENDED_AREAS`.
- Produces: `levelForXp(xp: number): LevelInfo` where `LevelInfo = { level: number; title: string; minXp: number; nextAtXp: number | null }`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/levels.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { levelForXp } from '@/lib/domain/levels';
import { AWARDS } from '@/lib/domain/constants';

describe('levelForXp', () => {
  it('starts everyone at level 1', () => {
    expect(levelForXp(0)).toEqual({ level: 1, title: 'Day one energy', minXp: 0, nextAtXp: 100 });
  });

  it('holds the level until the next threshold is reached', () => {
    expect(levelForXp(99).level).toBe(1);
    expect(levelForXp(100).level).toBe(2);
    expect(levelForXp(249).level).toBe(2);
    expect(levelForXp(250).level).toBe(3);
  });

  it('names level 3 with the coach flavour from the spec', () => {
    expect(levelForXp(250).title).toBe('Finding your rhythm');
  });

  it('caps at the top level with no next threshold', () => {
    expect(levelForXp(99_999)).toEqual({
      level: 7, title: 'This is who you are now', minXp: 1400, nextAtXp: null,
    });
  });

  it('treats negative XP as level 1 rather than throwing', () => {
    expect(levelForXp(-5).level).toBe(1);
  });
});

describe('award amounts', () => {
  it('orders check-in below full day below reflection', () => {
    expect(AWARDS.habit_check_in.xp).toBeLessThan(AWARDS.full_day_bonus.xp);
    expect(AWARDS.full_day_bonus.xp).toBeLessThan(AWARDS.weekly_reflection.xp);
    expect(AWARDS.habit_check_in.points).toBeLessThan(AWARDS.full_day_bonus.points);
    expect(AWARDS.full_day_bonus.points).toBeLessThan(AWARDS.weekly_reflection.points);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- levels`
Expected: FAIL — `Failed to resolve import "@/lib/domain/levels"`.

- [ ] **Step 3: Write the constants**

Create `src/lib/domain/constants.ts`:

```ts
export const PROGRAMME_DAYS = 21 as const;
export const REFLECTION_DAYS = [7, 14, 21] as const;
export const MAX_SHIELDS = 1 as const;

/** Soft guidance only. Never enforced as a hard limit. */
export const RECOMMENDED_AREAS = { min: 3, max: 5 } as const;

export const MAX_TOTAL_HABITS = 8 as const;
export const MAX_HABITS_PER_AREA = 2 as const;

export type AwardKind = 'habit_check_in' | 'full_day_bonus' | 'weekly_reflection';
export type AwardValue = { xp: number; points: number };

/**
 * Ordering is locked by the spec: check-in < full-day bonus < weekly reflection.
 * XP is never subtracted anywhere in the app.
 */
export const AWARDS: Record<AwardKind, AwardValue> = {
  habit_check_in: { xp: 10, points: 2 },
  full_day_bonus: { xp: 25, points: 5 },
  weekly_reflection: { xp: 50, points: 15 },
};
```

- [ ] **Step 4: Write the level curve**

Create `src/lib/domain/levels.ts`:

```ts
export type LevelInfo = { level: number; title: string; minXp: number; nextAtXp: number | null };

export const LEVELS: ReadonlyArray<{ level: number; minXp: number; title: string }> = [
  { level: 1, minXp: 0, title: 'Day one energy' },
  { level: 2, minXp: 100, title: 'Getting started' },
  { level: 3, minXp: 250, title: 'Finding your rhythm' },
  { level: 4, minXp: 450, title: 'Building momentum' },
  { level: 5, minXp: 700, title: 'Locked in' },
  { level: 6, minXp: 1000, title: 'Reset in motion' },
  { level: 7, minXp: 1400, title: 'This is who you are now' },
];

export function levelForXp(xp: number): LevelInfo {
  const safeXp = Number.isFinite(xp) ? Math.max(0, Math.floor(xp)) : 0;
  let index = 0;
  for (let i = 0; i < LEVELS.length; i += 1) {
    if (safeXp >= LEVELS[i].minXp) index = i;
  }
  const current = LEVELS[index];
  const next = LEVELS[index + 1] ?? null;
  return { level: current.level, title: current.title, minXp: current.minXp, nextAtXp: next?.minXp ?? null };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- levels`
Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add src/lib/domain tests/unit/levels.test.ts
git commit -m "feat(domain): add award constants and XP level curve"
```

---

## Task 8: Timezone-aware day index

**Files:**
- Create: `src/lib/domain/day.ts`
- Test: `tests/unit/day.test.ts`

**Interfaces:**
- Produces: `localDateInTimeZone(now: Date, timeZone: string): string` returning `YYYY-MM-DD`.
- Produces: `dayIndexFor(startDate: string, localDate: string): number` — 1-based, may be `< 1` (not started) or `> 21` (finished).
- Produces: `programmeDayState(input: DayStateInput): DayState` where
  `DayStateInput = { startDate: string; timeZone: string; now: Date; dayOffset?: number }` and
  `DayState = { localDate: string; rawDayIndex: number; currentDay: number; isBeforeStart: boolean; isComplete: boolean }`.
  `currentDay` is clamped to 1..21.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/day.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { localDateInTimeZone, dayIndexFor, programmeDayState } from '@/lib/domain/day';

describe('localDateInTimeZone', () => {
  it('returns the local calendar date, not the UTC one', () => {
    // 23:30 UTC on 5 Sep is already 6 Sep in Sydney.
    const at = new Date('2026-09-05T23:30:00Z');
    expect(localDateInTimeZone(at, 'Australia/Sydney')).toBe('2026-09-06');
    expect(localDateInTimeZone(at, 'Europe/London')).toBe('2026-09-06');
    expect(localDateInTimeZone(at, 'America/Los_Angeles')).toBe('2026-09-05');
  });

  it('handles a British Summer Time boundary', () => {
    const at = new Date('2026-10-25T00:30:00Z');
    expect(localDateInTimeZone(at, 'Europe/London')).toBe('2026-10-25');
  });
});

describe('dayIndexFor', () => {
  it('makes the start date day 1', () => {
    expect(dayIndexFor('2026-09-07', '2026-09-07')).toBe(1);
  });

  it('counts calendar days forward', () => {
    expect(dayIndexFor('2026-09-07', '2026-09-08')).toBe(2);
    expect(dayIndexFor('2026-09-07', '2026-09-27')).toBe(21);
  });

  it('returns a value above 21 once the programme is over', () => {
    expect(dayIndexFor('2026-09-07', '2026-09-28')).toBe(22);
  });

  it('returns zero or less before the start date', () => {
    expect(dayIndexFor('2026-09-07', '2026-09-06')).toBe(0);
  });

  it('spans a month boundary correctly', () => {
    expect(dayIndexFor('2026-09-25', '2026-10-01')).toBe(7);
  });
});

describe('programmeDayState', () => {
  const base = { startDate: '2026-09-07', timeZone: 'Europe/London' };

  it('clamps the current day into 1..21', () => {
    const state = programmeDayState({ ...base, now: new Date('2026-10-10T09:00:00Z') });
    expect(state.rawDayIndex).toBe(34);
    expect(state.currentDay).toBe(21);
    expect(state.isComplete).toBe(true);
  });

  it('flags a programme that has not started', () => {
    const state = programmeDayState({ ...base, now: new Date('2026-09-05T09:00:00Z') });
    expect(state.isBeforeStart).toBe(true);
    expect(state.currentDay).toBe(1);
  });

  it('applies the QA day offset', () => {
    const state = programmeDayState({ ...base, now: new Date('2026-09-07T09:00:00Z'), dayOffset: 6 });
    expect(state.currentDay).toBe(7);
  });

  it('ignores a QA offset of zero', () => {
    const state = programmeDayState({ ...base, now: new Date('2026-09-07T09:00:00Z'), dayOffset: 0 });
    expect(state.currentDay).toBe(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- day`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/domain/day.ts`:

```ts
import { PROGRAMME_DAYS } from './constants';

const MS_PER_DAY = 86_400_000;

/** Returns the calendar date in `timeZone` as YYYY-MM-DD. */
export function localDateInTimeZone(now: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD, which is exactly what we want.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function toUtcMidnight(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** 1-based day index. Below 1 means "not started", above 21 means "finished". */
export function dayIndexFor(startDate: string, localDate: string): number {
  const diff = toUtcMidnight(localDate) - toUtcMidnight(startDate);
  return Math.round(diff / MS_PER_DAY) + 1;
}

export type DayStateInput = {
  startDate: string;
  timeZone: string;
  now: Date;
  dayOffset?: number;
};

export type DayState = {
  localDate: string;
  rawDayIndex: number;
  currentDay: number;
  isBeforeStart: boolean;
  isComplete: boolean;
};

export function programmeDayState({ startDate, timeZone, now, dayOffset = 0 }: DayStateInput): DayState {
  const localDate = localDateInTimeZone(now, timeZone);
  const rawDayIndex = dayIndexFor(startDate, localDate) + dayOffset;
  return {
    localDate,
    rawDayIndex,
    currentDay: Math.min(PROGRAMME_DAYS, Math.max(1, rawDayIndex)),
    isBeforeStart: rawDayIndex < 1,
    isComplete: rawDayIndex > PROGRAMME_DAYS,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- day`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/day.ts tests/unit/day.test.ts
git commit -m "feat(domain): add timezone-aware programme day index"
```

---

## Task 9: Plan generation

**Files:**
- Create: `src/lib/domain/plan.ts`
- Test: `tests/unit/plan.test.ts`

**Interfaces:**
- Consumes: `MAX_TOTAL_HABITS`, `MAX_HABITS_PER_AREA` from `src/lib/domain/constants.ts`.
- Produces:
  ```ts
  type TemplateInput = { key: string; areaKey: string; title: string; detail: string | null; effort: number; sortOrder: number; isDefault: boolean };
  type SelectedArea = { userAreaId: number; areaKey: string | null; name: string; isCustom: boolean; sortOrder: number };
  type DraftHabit = { userAreaId: number; areaLabel: string; sourceTemplateKey: string | null; title: string; detail: string | null; sortOrder: number };
  function generatePlan(areas: SelectedArea[], templates: TemplateInput[]): DraftHabit[];
  ```

Rules encoded: areas are processed in `sortOrder` order; each catalogue area draws from its own default templates ordered by `effort` then `sortOrder`; each custom area gets exactly one generic starter habit so no area is left empty; per-area allowance is 2 when 3 or fewer areas are selected and 1 otherwise; habits are picked round-robin across areas so a cap never starves the last area; the total is capped at `MAX_TOTAL_HABITS`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/plan.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { generatePlan, customStarterTitle, type SelectedArea, type TemplateInput } from '@/lib/domain/plan';
import { MAX_TOTAL_HABITS } from '@/lib/domain/constants';

function template(key: string, areaKey: string, effort: number, sortOrder: number, isDefault = true): TemplateInput {
  return { key, areaKey, title: `Habit ${key}`, detail: null, effort, sortOrder, isDefault };
}

function area(id: number, areaKey: string | null, name: string, sortOrder: number): SelectedArea {
  return { userAreaId: id, areaKey, name, isCustom: areaKey === null, sortOrder };
}

const TEMPLATES: TemplateInput[] = [
  template('sleep_a', 'sleep', 2, 1),
  template('sleep_b', 'sleep', 1, 2),
  template('sleep_c', 'sleep', 3, 3),
  template('fitness_a', 'fitness', 1, 1),
  template('fitness_b', 'fitness', 2, 2),
  template('money_a', 'money', 1, 1),
  template('money_b', 'money', 2, 2),
  template('focus_a', 'focus', 1, 1),
  template('focus_b', 'focus', 2, 2),
  template('outdoor_a', 'outdoor', 1, 1),
  template('outdoor_b', 'outdoor', 2, 2),
];

describe('generatePlan', () => {
  it('returns nothing when no areas are selected', () => {
    expect(generatePlan([], TEMPLATES)).toEqual([]);
  });

  it('gives two habits per area when three or fewer areas are chosen', () => {
    const plan = generatePlan([area(1, 'sleep', 'Sleep', 1), area(2, 'fitness', 'Fitness', 2)], TEMPLATES);
    expect(plan).toHaveLength(4);
    expect(plan.filter((h) => h.userAreaId === 1)).toHaveLength(2);
    expect(plan.filter((h) => h.userAreaId === 2)).toHaveLength(2);
  });

  it('drops to one habit per area when more than three areas are chosen', () => {
    const areas = [
      area(1, 'sleep', 'Sleep', 1),
      area(2, 'fitness', 'Fitness', 2),
      area(3, 'money', 'Money basics', 3),
      area(4, 'focus', 'Focus', 4),
    ];
    const plan = generatePlan(areas, TEMPLATES);
    expect(plan).toHaveLength(4);
    expect(new Set(plan.map((h) => h.userAreaId)).size).toBe(4);
  });

  it('prefers the lowest-effort template first', () => {
    const plan = generatePlan([area(1, 'sleep', 'Sleep', 1)], TEMPLATES);
    expect(plan[0].sourceTemplateKey).toBe('sleep_b'); // effort 1 beats effort 2
    expect(plan[1].sourceTemplateKey).toBe('sleep_a');
  });

  it('ignores templates that are not marked as defaults', () => {
    const templates = [template('sleep_a', 'sleep', 1, 1, false), template('sleep_b', 'sleep', 2, 2)];
    const plan = generatePlan([area(1, 'sleep', 'Sleep', 1)], templates);
    expect(plan.map((h) => h.sourceTemplateKey)).toEqual(['sleep_b']);
  });

  it('gives every custom area one starter habit', () => {
    const plan = generatePlan([area(9, null, 'Guitar', 1)], TEMPLATES);
    expect(plan).toEqual([
      {
        userAreaId: 9,
        areaLabel: 'Guitar',
        sourceTemplateKey: null,
        title: customStarterTitle('Guitar'),
        detail: 'Swap this for something specific before you start.',
        sortOrder: 0,
      },
    ]);
  });

  it('never leaves a selected area with zero habits', () => {
    const areas = [
      area(1, 'sleep', 'Sleep', 1),
      area(2, 'fitness', 'Fitness', 2),
      area(3, 'money', 'Money basics', 3),
      area(4, 'focus', 'Focus', 4),
      area(5, 'outdoor', 'Outdoor time', 5),
      area(6, null, 'Guitar', 6),
    ];
    const plan = generatePlan(areas, TEMPLATES);
    for (const a of areas) {
      expect(plan.filter((h) => h.userAreaId === a.userAreaId).length).toBeGreaterThanOrEqual(1);
    }
  });

  it('caps the total number of habits', () => {
    const areas = Array.from({ length: 8 }, (_, i) => area(i + 1, null, `Custom ${i + 1}`, i + 1));
    const bigTemplates = [...TEMPLATES];
    const plan = generatePlan(areas, bigTemplates);
    expect(plan.length).toBeLessThanOrEqual(MAX_TOTAL_HABITS);
  });

  it('numbers sortOrder contiguously from zero', () => {
    const plan = generatePlan([area(1, 'sleep', 'Sleep', 1), area(2, 'fitness', 'Fitness', 2)], TEMPLATES);
    expect(plan.map((h) => h.sortOrder)).toEqual([0, 1, 2, 3]);
  });

  it('snapshots the area name as the label', () => {
    const plan = generatePlan([area(1, 'sleep', 'Bedtime', 1)], TEMPLATES);
    expect(plan.every((h) => h.areaLabel === 'Bedtime')).toBe(true);
  });

  it('is deterministic', () => {
    const areas = [area(1, 'sleep', 'Sleep', 1), area(2, 'fitness', 'Fitness', 2)];
    expect(generatePlan(areas, TEMPLATES)).toEqual(generatePlan(areas, TEMPLATES));
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- plan`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/domain/plan.ts`:

```ts
import { MAX_HABITS_PER_AREA, MAX_TOTAL_HABITS } from './constants';

export type TemplateInput = {
  key: string;
  areaKey: string;
  title: string;
  detail: string | null;
  effort: number;
  sortOrder: number;
  isDefault: boolean;
};

export type SelectedArea = {
  userAreaId: number;
  areaKey: string | null;
  name: string;
  isCustom: boolean;
  sortOrder: number;
};

export type DraftHabit = {
  userAreaId: number;
  areaLabel: string;
  sourceTemplateKey: string | null;
  title: string;
  detail: string | null;
  sortOrder: number;
};

export function customStarterTitle(areaName: string): string {
  return `Do one small thing for ${areaName}`;
}

const CUSTOM_STARTER_DETAIL = 'Swap this for something specific before you start.';

/**
 * Builds the starting 21-day habit set. Deterministic: same inputs, same output.
 * The user refines this before Day 1, so it errs towards fewer, easier habits.
 */
export function generatePlan(areas: SelectedArea[], templates: TemplateInput[]): DraftHabit[] {
  if (areas.length === 0) return [];

  const ordered = [...areas].sort((a, b) => a.sortOrder - b.sortOrder || a.userAreaId - b.userAreaId);
  const perArea = ordered.length <= 3 ? MAX_HABITS_PER_AREA : 1;

  // Candidate list per area, best-first.
  const candidates = new Map<number, DraftHabit[]>();
  for (const a of ordered) {
    if (a.isCustom || a.areaKey === null) {
      candidates.set(a.userAreaId, [
        {
          userAreaId: a.userAreaId,
          areaLabel: a.name,
          sourceTemplateKey: null,
          title: customStarterTitle(a.name),
          detail: CUSTOM_STARTER_DETAIL,
          sortOrder: 0,
        },
      ]);
      continue;
    }

    const forArea = templates
      .filter((t) => t.isDefault && t.areaKey === a.areaKey)
      .sort((x, y) => x.effort - y.effort || x.sortOrder - y.sortOrder || x.key.localeCompare(y.key))
      .slice(0, perArea)
      .map<DraftHabit>((t) => ({
        userAreaId: a.userAreaId,
        areaLabel: a.name,
        sourceTemplateKey: t.key,
        title: t.title,
        detail: t.detail,
        sortOrder: 0,
      }));

    candidates.set(a.userAreaId, forArea);
  }

  // Round-robin so a total cap trims the second habit of each area before it
  // removes any area's first habit.
  const picked: DraftHabit[] = [];
  for (let round = 0; round < perArea; round += 1) {
    for (const a of ordered) {
      if (picked.length >= MAX_TOTAL_HABITS) break;
      const habit = candidates.get(a.userAreaId)?.[round];
      if (habit) picked.push(habit);
    }
    if (picked.length >= MAX_TOTAL_HABITS) break;
  }

  return picked.map((habit, index) => ({ ...habit, sortOrder: index }));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- plan`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/plan.ts tests/unit/plan.test.ts
git commit -m "feat(domain): add deterministic 21-day plan generation"
```

---

## Task 10: Scheduling and streak/shield evaluation

**Files:**
- Create: `src/lib/domain/schedule.ts`, `src/lib/domain/streak.ts`
- Test: `tests/unit/schedule.test.ts`, `tests/unit/streak.test.ts`

**Interfaces:**
- Produces from `schedule.ts`:
  ```ts
  type HabitWindow = { id: number; activeFromDay: number; activeToDay: number | null };
  function isScheduledOnDay(habit: HabitWindow, day: number): boolean;
  function habitsScheduledOnDay(habits: HabitWindow[], day: number): HabitWindow[];
  function scheduledCountForDay(habits: HabitWindow[], day: number): number;
  ```
- Produces from `streak.ts`:
  ```ts
  function requiredForStreak(scheduled: number): number;
  function dayQualifies(scheduled: number, completed: number): boolean;
  type StreakState = { streakCurrent: number; streakLongest: number; shieldCount: number; lastCountedDay: number; lastSettledDay: number };
  type DayCounts = { dayIndex: number; scheduled: number; completed: number };
  function settleDay(state: StreakState, day: DayCounts): StreakState;
  function applyOpenDay(state: StreakState, day: DayCounts): StreakState;
  function rollForward(state: StreakState, days: DayCounts[], currentDay: number): StreakState;
  ```

- [ ] **Step 1: Write the failing schedule test**

Create `tests/unit/schedule.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isScheduledOnDay, scheduledCountForDay, type HabitWindow } from '@/lib/domain/schedule';

const openEnded: HabitWindow = { id: 1, activeFromDay: 1, activeToDay: null };
const retiredAtDay11: HabitWindow = { id: 2, activeFromDay: 1, activeToDay: 11 };
const addedAtDay12: HabitWindow = { id: 3, activeFromDay: 12, activeToDay: null };

describe('isScheduledOnDay', () => {
  it('includes an open-ended habit on every day', () => {
    expect(isScheduledOnDay(openEnded, 1)).toBe(true);
    expect(isScheduledOnDay(openEnded, 21)).toBe(true);
  });

  it('keeps a retired habit on its historical days', () => {
    expect(isScheduledOnDay(retiredAtDay11, 11)).toBe(true);
  });

  it('drops a retired habit from future days', () => {
    expect(isScheduledOnDay(retiredAtDay11, 12)).toBe(false);
  });

  it('excludes a habit added later from earlier days', () => {
    expect(isScheduledOnDay(addedAtDay12, 11)).toBe(false);
    expect(isScheduledOnDay(addedAtDay12, 12)).toBe(true);
  });
});

describe('scheduledCountForDay', () => {
  const habits = [openEnded, retiredAtDay11, addedAtDay12];

  it('counts only habits whose window covers the day', () => {
    expect(scheduledCountForDay(habits, 5)).toBe(2);
    expect(scheduledCountForDay(habits, 12)).toBe(2);
  });

  it('returns zero for an empty programme', () => {
    expect(scheduledCountForDay([], 3)).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- schedule`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement scheduling**

Create `src/lib/domain/schedule.ts`:

```ts
export type HabitWindow = { id: number; activeFromDay: number; activeToDay: number | null };

/**
 * Habits are daily within their active window. Retiring a habit mid-programme
 * sets activeToDay to yesterday, which preserves historical scheduled counts.
 */
export function isScheduledOnDay(habit: HabitWindow, day: number): boolean {
  if (day < habit.activeFromDay) return false;
  if (habit.activeToDay !== null && day > habit.activeToDay) return false;
  return true;
}

export function habitsScheduledOnDay<T extends HabitWindow>(habits: T[], day: number): T[] {
  return habits.filter((habit) => isScheduledOnDay(habit, day));
}

export function scheduledCountForDay(habits: HabitWindow[], day: number): number {
  return habitsScheduledOnDay(habits, day).length;
}
```

- [ ] **Step 4: Run the schedule test to verify it passes**

Run: `npm test -- schedule`
Expected: PASS, 6 tests.

- [ ] **Step 5: Write the failing streak test**

Create `tests/unit/streak.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  requiredForStreak, dayQualifies, settleDay, applyOpenDay, rollForward,
  type StreakState,
} from '@/lib/domain/streak';

const fresh: StreakState = {
  streakCurrent: 0, streakLongest: 0, shieldCount: 0, lastCountedDay: 0, lastSettledDay: 0,
};

describe('requiredForStreak', () => {
  it('is half the scheduled habits, rounded up', () => {
    expect(requiredForStreak(2)).toBe(1);
    expect(requiredForStreak(3)).toBe(2);
    expect(requiredForStreak(4)).toBe(2);
    expect(requiredForStreak(5)).toBe(3);
    expect(requiredForStreak(8)).toBe(4);
  });

  it('requires at least one when any habits exist', () => {
    expect(requiredForStreak(1)).toBe(1);
  });

  it('requires nothing when no habits are scheduled', () => {
    expect(requiredForStreak(0)).toBe(0);
  });
});

describe('dayQualifies', () => {
  it('qualifies at exactly the threshold', () => {
    expect(dayQualifies(4, 2)).toBe(true);
  });

  it('does not qualify below the threshold', () => {
    expect(dayQualifies(4, 1)).toBe(false);
    expect(dayQualifies(3, 1)).toBe(false);
  });

  it('does not qualify on zero completions when habits exist', () => {
    expect(dayQualifies(1, 0)).toBe(false);
  });
});

describe('settleDay', () => {
  it('increments the streak on a qualifying day', () => {
    const next = settleDay({ ...fresh, streakCurrent: 3, streakLongest: 3 }, { dayIndex: 4, scheduled: 4, completed: 2 });
    expect(next.streakCurrent).toBe(4);
    expect(next.streakLongest).toBe(4);
    expect(next.lastCountedDay).toBe(4);
    expect(next.lastSettledDay).toBe(4);
  });

  it('awards a shield on a 100% day when none is held', () => {
    const next = settleDay(fresh, { dayIndex: 1, scheduled: 3, completed: 3 });
    expect(next.shieldCount).toBe(1);
  });

  it('never grants a second shield', () => {
    const next = settleDay({ ...fresh, shieldCount: 1 }, { dayIndex: 1, scheduled: 3, completed: 3 });
    expect(next.shieldCount).toBe(1);
  });

  it('resets the streak on a miss with no shield', () => {
    const next = settleDay({ ...fresh, streakCurrent: 6, streakLongest: 6 }, { dayIndex: 7, scheduled: 4, completed: 1 });
    expect(next.streakCurrent).toBe(0);
    expect(next.shieldCount).toBe(0);
    expect(next.streakLongest).toBe(6);
  });

  it('consumes the shield on a miss and preserves the streak without incrementing it', () => {
    const before = { ...fresh, streakCurrent: 6, streakLongest: 6, shieldCount: 1 };
    const next = settleDay(before, { dayIndex: 7, scheduled: 4, completed: 0 });
    expect(next.streakCurrent).toBe(6);
    expect(next.shieldCount).toBe(0);
    expect(next.lastCountedDay).toBe(0);
  });

  it('leaves the streak untouched on a day with no scheduled habits', () => {
    const before = { ...fresh, streakCurrent: 5, streakLongest: 5 };
    const next = settleDay(before, { dayIndex: 3, scheduled: 0, completed: 0 });
    expect(next.streakCurrent).toBe(5);
    expect(next.lastSettledDay).toBe(3);
  });

  it('does not double-count a day already counted while it was open', () => {
    const before = { ...fresh, streakCurrent: 1, streakLongest: 1, lastCountedDay: 1 };
    const next = settleDay(before, { dayIndex: 1, scheduled: 2, completed: 2 });
    expect(next.streakCurrent).toBe(1);
  });
});

describe('applyOpenDay', () => {
  it('increments the streak as soon as today qualifies', () => {
    const next = applyOpenDay({ ...fresh, streakCurrent: 2, streakLongest: 2 }, { dayIndex: 3, scheduled: 4, completed: 2 });
    expect(next.streakCurrent).toBe(3);
    expect(next.lastCountedDay).toBe(3);
  });

  it('never resets the streak for a day still in progress', () => {
    const before = { ...fresh, streakCurrent: 5, streakLongest: 5 };
    const next = applyOpenDay(before, { dayIndex: 6, scheduled: 4, completed: 0 });
    expect(next.streakCurrent).toBe(5);
    expect(next.shieldCount).toBe(0);
  });

  it('never settles the day', () => {
    const next = applyOpenDay(fresh, { dayIndex: 3, scheduled: 2, completed: 2 });
    expect(next.lastSettledDay).toBe(0);
  });

  it('awards the shield immediately on a 100% day', () => {
    const next = applyOpenDay(fresh, { dayIndex: 3, scheduled: 2, completed: 2 });
    expect(next.shieldCount).toBe(1);
  });

  it('is idempotent when called twice', () => {
    const once = applyOpenDay(fresh, { dayIndex: 3, scheduled: 2, completed: 2 });
    expect(applyOpenDay(once, { dayIndex: 3, scheduled: 2, completed: 2 })).toEqual(once);
  });
});

describe('rollForward', () => {
  const days = (spec: Array<[number, number, number]>) =>
    spec.map(([dayIndex, scheduled, completed]) => ({ dayIndex, scheduled, completed }));

  it('builds a streak across settled days and today', () => {
    const next = rollForward(fresh, days([[1, 4, 4], [2, 4, 2], [3, 4, 3]]), 3);
    expect(next.streakCurrent).toBe(3);
    expect(next.lastSettledDay).toBe(2);
    expect(next.lastCountedDay).toBe(3);
    expect(next.shieldCount).toBe(1);
  });

  it('spends the shield on the first settled miss', () => {
    const next = rollForward(fresh, days([[1, 4, 4], [2, 4, 0], [3, 4, 4]]), 3);
    expect(next.streakCurrent).toBe(2); // day 1 counted, day 2 shielded, day 3 counted
    expect(next.shieldCount).toBe(1);   // day 3 was 100%, so a new shield is earned
  });

  it('resets after a second unshielded miss', () => {
    const next = rollForward(fresh, days([[1, 4, 2], [2, 4, 0], [3, 4, 2]]), 3);
    expect(next.streakCurrent).toBe(1);
    expect(next.streakLongest).toBe(1);
  });

  it('skips days already settled', () => {
    const before = { ...fresh, streakCurrent: 2, streakLongest: 2, lastCountedDay: 2, lastSettledDay: 2 };
    const next = rollForward(before, days([[1, 4, 4], [2, 4, 4], [3, 4, 4]]), 3);
    expect(next.streakCurrent).toBe(3);
    expect(next.lastSettledDay).toBe(2);
  });

  it('produces the same state when run twice with unchanged inputs', () => {
    const input = days([[1, 4, 4], [2, 4, 1], [3, 4, 2]]);
    const once = rollForward(fresh, input, 3);
    expect(rollForward(once, input, 3)).toEqual(once);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npm test -- streak`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement streak and shield rules**

Create `src/lib/domain/streak.ts`:

```ts
import { MAX_SHIELDS } from './constants';

export type StreakState = {
  streakCurrent: number;
  streakLongest: number;
  shieldCount: number;
  lastCountedDay: number;
  lastSettledDay: number;
};

export type DayCounts = { dayIndex: number; scheduled: number; completed: number };

/** At least 50% of the day's scheduled habits, rounded up, minimum 1 if any exist. */
export function requiredForStreak(scheduled: number): number {
  if (scheduled <= 0) return 0;
  return Math.max(1, Math.ceil(scheduled / 2));
}

export function dayQualifies(scheduled: number, completed: number): boolean {
  const required = requiredForStreak(scheduled);
  if (required === 0) return false;
  return completed >= required;
}

function maybeAwardShield(state: StreakState, day: DayCounts): StreakState {
  const isFullDay = day.scheduled > 0 && day.completed >= day.scheduled;
  if (!isFullDay || state.shieldCount >= MAX_SHIELDS) return state;
  return { ...state, shieldCount: MAX_SHIELDS };
}

function countDay(state: StreakState, day: DayCounts): StreakState {
  if (day.dayIndex <= state.lastCountedDay) return state;
  const streakCurrent = state.streakCurrent + 1;
  return {
    ...state,
    streakCurrent,
    streakLongest: Math.max(state.streakLongest, streakCurrent),
    lastCountedDay: day.dayIndex,
  };
}

/** Applies the full rules for a day that is over, then marks it settled. */
export function settleDay(state: StreakState, day: DayCounts): StreakState {
  if (day.dayIndex <= state.lastSettledDay) return state;

  // A day with nothing scheduled is neutral: it neither builds nor breaks a streak.
  if (day.scheduled === 0) {
    return { ...state, lastSettledDay: day.dayIndex };
  }

  let next = state;
  if (dayQualifies(day.scheduled, day.completed)) {
    next = countDay(next, day);
    next = maybeAwardShield(next, day);
  } else if (next.shieldCount > 0) {
    // Shield consumed. Streak value is preserved, not incremented.
    next = { ...next, shieldCount: next.shieldCount - 1 };
  } else {
    next = { ...next, streakCurrent: 0 };
  }

  return { ...next, lastSettledDay: day.dayIndex };
}

/**
 * Applies only the positive outcomes for the day currently in progress, so the
 * streak and shield update the moment the user earns them. A miss is never
 * applied here — it waits until the day is over and settleDay runs.
 */
export function applyOpenDay(state: StreakState, day: DayCounts): StreakState {
  if (day.scheduled === 0) return state;
  let next = state;
  if (dayQualifies(day.scheduled, day.completed)) {
    next = countDay(next, day);
  }
  return maybeAwardShield(next, day);
}

/**
 * Rolls state forward from its watermarks to `currentDay`. Idempotent: calling
 * it repeatedly with the same inputs produces the same state, which is what
 * lets it run on every page load without a scheduler.
 */
export function rollForward(state: StreakState, days: DayCounts[], currentDay: number): StreakState {
  const byDay = new Map(days.map((d) => [d.dayIndex, d]));
  let next = state;

  for (let day = state.lastSettledDay + 1; day < currentDay; day += 1) {
    next = settleDay(next, byDay.get(day) ?? { dayIndex: day, scheduled: 0, completed: 0 });
  }

  const today = byDay.get(currentDay);
  if (today) next = applyOpenDay(next, today);

  return next;
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npm test -- streak`
Expected: PASS, 21 tests.

- [ ] **Step 9: Commit**

```bash
git add src/lib/domain/schedule.ts src/lib/domain/streak.ts tests/unit/schedule.test.ts tests/unit/streak.test.ts
git commit -m "feat(domain): add habit scheduling windows and streak/shield rules"
```

---

## Task 11: Award computation

**Files:**
- Create: `src/lib/domain/awards.ts`
- Test: `tests/unit/awards.test.ts`

**Interfaces:**
- Consumes: `AWARDS`, `AwardKind` from `constants.ts`; `levelForXp` from `levels.ts`.
- Produces:
  ```ts
  type PendingAward = { kind: AwardKind; dayIndex: number; programmeHabitId: number | null; xp: number; points: number };
  type CheckInAwardInput = { programmeHabitId: number; dayIndex: number; scheduled: number; completedAfter: number; alreadyAwardedHabitIds: number[]; fullDayAlreadyAwarded: boolean };
  function awardsForCheckIn(input: CheckInAwardInput): PendingAward[];
  function awardsForReflection(dayIndex: number, alreadyAwarded: boolean): PendingAward[];
  type Totals = { xpTotal: number; level: number; pointsEarnedTotal: number; pointsBalance: number };
  function applyAwards(totals: Totals, awards: PendingAward[]): Totals;
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/unit/awards.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { awardsForCheckIn, awardsForReflection, applyAwards, type Totals } from '@/lib/domain/awards';
import { AWARDS } from '@/lib/domain/constants';

const baseCheckIn = {
  programmeHabitId: 10,
  dayIndex: 3,
  scheduled: 4,
  completedAfter: 1,
  alreadyAwardedHabitIds: [] as number[],
  fullDayAlreadyAwarded: false,
};

describe('awardsForCheckIn', () => {
  it('awards the check-in amount for a newly completed habit', () => {
    const awards = awardsForCheckIn(baseCheckIn);
    expect(awards).toEqual([
      { kind: 'habit_check_in', dayIndex: 3, programmeHabitId: 10, xp: 10, points: 2 },
    ]);
  });

  it('awards nothing when this habit was already awarded today', () => {
    expect(awardsForCheckIn({ ...baseCheckIn, alreadyAwardedHabitIds: [10] })).toEqual([]);
  });

  it('adds the full-day bonus when the last habit of the day is ticked', () => {
    const awards = awardsForCheckIn({ ...baseCheckIn, completedAfter: 4 });
    expect(awards).toHaveLength(2);
    expect(awards[1]).toEqual({
      kind: 'full_day_bonus', dayIndex: 3, programmeHabitId: null, xp: 25, points: 5,
    });
  });

  it('does not repeat the full-day bonus', () => {
    const awards = awardsForCheckIn({
      ...baseCheckIn, completedAfter: 4, alreadyAwardedHabitIds: [10], fullDayAlreadyAwarded: true,
    });
    expect(awards).toEqual([]);
  });

  it('still grants the full-day bonus when the final habit was already awarded', () => {
    // Re-ticking a habit that was un-ticked: no check-in award, but the day is
    // now complete and the bonus has not been paid.
    const awards = awardsForCheckIn({ ...baseCheckIn, completedAfter: 4, alreadyAwardedHabitIds: [10] });
    expect(awards).toEqual([
      { kind: 'full_day_bonus', dayIndex: 3, programmeHabitId: null, xp: 25, points: 5 },
    ]);
  });

  it('gives no full-day bonus when nothing is scheduled', () => {
    expect(awardsForCheckIn({ ...baseCheckIn, scheduled: 0, completedAfter: 0 })).toHaveLength(1);
  });
});

describe('awardsForReflection', () => {
  it('awards the reflection amount once', () => {
    expect(awardsForReflection(7, false)).toEqual([
      { kind: 'weekly_reflection', dayIndex: 7, programmeHabitId: null, xp: 50, points: 15 },
    ]);
  });

  it('awards nothing on a re-save', () => {
    expect(awardsForReflection(7, true)).toEqual([]);
  });

  it('rejects a non-reflection day', () => {
    expect(() => awardsForReflection(8, false)).toThrow(/reflection day/i);
  });
});

describe('applyAwards', () => {
  const totals: Totals = { xpTotal: 240, level: 2, pointsEarnedTotal: 48, pointsBalance: 8 };

  it('adds XP and points and recalculates the level', () => {
    const next = applyAwards(totals, [
      { kind: 'habit_check_in', dayIndex: 1, programmeHabitId: 1, xp: 10, points: 2 },
    ]);
    expect(next).toEqual({ xpTotal: 250, level: 3, pointsEarnedTotal: 50, pointsBalance: 10 });
  });

  it('is a no-op for an empty award list', () => {
    expect(applyAwards(totals, [])).toEqual(totals);
  });

  it('never reduces XP', () => {
    const next = applyAwards(totals, [
      { kind: 'habit_check_in', dayIndex: 1, programmeHabitId: 1, xp: AWARDS.habit_check_in.xp, points: 2 },
    ]);
    expect(next.xpTotal).toBeGreaterThan(totals.xpTotal);
  });

  it('leaves an existing spent balance intact', () => {
    const spent: Totals = { xpTotal: 500, level: 4, pointsEarnedTotal: 100, pointsBalance: 20 };
    const next = applyAwards(spent, [
      { kind: 'weekly_reflection', dayIndex: 14, programmeHabitId: null, xp: 50, points: 15 },
    ]);
    expect(next.pointsBalance).toBe(35);
    expect(next.pointsEarnedTotal).toBe(115);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- awards`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/lib/domain/awards.ts`:

```ts
import { AWARDS, REFLECTION_DAYS, type AwardKind } from './constants';
import { levelForXp } from './levels';

export type PendingAward = {
  kind: AwardKind;
  dayIndex: number;
  programmeHabitId: number | null;
  xp: number;
  points: number;
};

export type CheckInAwardInput = {
  programmeHabitId: number;
  dayIndex: number;
  scheduled: number;
  completedAfter: number;
  /** Habit ids that already have a habit_check_in ledger row for this day. */
  alreadyAwardedHabitIds: number[];
  fullDayAlreadyAwarded: boolean;
};

function award(kind: AwardKind, dayIndex: number, programmeHabitId: number | null): PendingAward {
  return { kind, dayIndex, programmeHabitId, ...AWARDS[kind] };
}

/**
 * Awards are earned once per habit per day and once per full day. Un-ticking a
 * habit never removes XP, so re-ticking it must not pay again.
 */
export function awardsForCheckIn(input: CheckInAwardInput): PendingAward[] {
  const pending: PendingAward[] = [];

  if (!input.alreadyAwardedHabitIds.includes(input.programmeHabitId)) {
    pending.push(award('habit_check_in', input.dayIndex, input.programmeHabitId));
  }

  const isFullDay = input.scheduled > 0 && input.completedAfter >= input.scheduled;
  if (isFullDay && !input.fullDayAlreadyAwarded) {
    pending.push(award('full_day_bonus', input.dayIndex, null));
  }

  return pending;
}

export function awardsForReflection(dayIndex: number, alreadyAwarded: boolean): PendingAward[] {
  if (!(REFLECTION_DAYS as readonly number[]).includes(dayIndex)) {
    throw new Error(`Day ${dayIndex} is not a reflection day`);
  }
  if (alreadyAwarded) return [];
  return [award('weekly_reflection', dayIndex, null)];
}

export type Totals = {
  xpTotal: number;
  level: number;
  pointsEarnedTotal: number;
  pointsBalance: number;
};

export function applyAwards(totals: Totals, awards: PendingAward[]): Totals {
  if (awards.length === 0) return totals;

  const xp = awards.reduce((sum, a) => sum + a.xp, 0);
  const points = awards.reduce((sum, a) => sum + a.points, 0);
  const xpTotal = totals.xpTotal + xp;

  return {
    xpTotal,
    level: levelForXp(xpTotal).level,
    pointsEarnedTotal: totals.pointsEarnedTotal + points,
    pointsBalance: totals.pointsBalance + points,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- awards`
Expected: PASS, 13 tests.

- [ ] **Step 5: Run the whole unit suite**

Run: `npm test`
Expected: PASS — all unit tests across levels, day, plan, schedule, streak, awards, smoke.

- [ ] **Step 6: Commit**

```bash
git add src/lib/domain/awards.ts tests/unit/awards.test.ts
git commit -m "feat(domain): add XP and reset-point award computation"
```

---

# Phase 4 — Setup wizard

## Task 12: Catalogue and programme data access

**Files:**
- Create: `src/lib/data/catalogue.ts`
- Create: `src/lib/data/programme.ts`
- Create: `src/lib/data/progress.ts`
- Create: `src/lib/qa.ts`

**Interfaces:**
- Produces from `catalogue.ts`: `listAreaCatalogue(): Promise<AreaCatalogueRow[]>`, `listHabitTemplates(): Promise<TemplateInput[]>`, `getWeeklyPrompt(dayIndex: number): Promise<{ key: string; prompt: string }>`, `listRewards(): Promise<RewardRow[]>`.
- Produces from `programme.ts`: `getOpenProgramme(): Promise<ProgrammeRow | null>`, `getOrCreateSetupProgramme(timezone: string): Promise<ProgrammeRow>`, `listProgrammeHabits(programmeId: number): Promise<ProgrammeHabitRow[]>`, `currentDayState(programme: ProgrammeRow): Promise<DayState>`.
- Produces from `progress.ts`: `getOrCreateProgress(): Promise<ProgressRow>`.
- Produces from `qa.ts`: `isQaEnabled(): boolean`, `getQaDayOffset(): Promise<number>`.

- [ ] **Step 1: Write the QA guard test first**

Create `tests/unit/qa.test.ts`:

```ts
import { describe, it, expect, afterEach, vi } from 'vitest';
import { isQaModeAllowed } from '@/lib/qa';

afterEach(() => vi.unstubAllEnvs());

describe('isQaModeAllowed', () => {
  it('is off when the flag is unset', () => {
    expect(isQaModeAllowed({ qaMode: undefined, nodeEnv: 'development' })).toBe(false);
  });

  it('is on in development when the flag is exactly "1"', () => {
    expect(isQaModeAllowed({ qaMode: '1', nodeEnv: 'development' })).toBe(true);
  });

  it('is on in test when the flag is exactly "1"', () => {
    expect(isQaModeAllowed({ qaMode: '1', nodeEnv: 'test' })).toBe(true);
  });

  it('is OFF in production even when the flag is set', () => {
    expect(isQaModeAllowed({ qaMode: '1', nodeEnv: 'production' })).toBe(false);
  });

  it('ignores truthy-looking values that are not exactly "1"', () => {
    expect(isQaModeAllowed({ qaMode: 'true', nodeEnv: 'development' })).toBe(false);
    expect(isQaModeAllowed({ qaMode: 'yes', nodeEnv: 'development' })).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- qa`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the QA module**

Create `src/lib/qa.ts`:

```ts
import { cookies } from 'next/headers';

export const QA_COOKIE = 'lr_qa_day_offset';

/**
 * Pure guard so the production lockout is unit-testable. The QA helper is only
 * ever reachable when LIFE_RESET_QA_MODE is exactly "1" AND we are not running
 * a production build. LIFE_RESET_QA_MODE is never set on Vercel production.
 */
export function isQaModeAllowed({ qaMode, nodeEnv }: { qaMode?: string; nodeEnv?: string }): boolean {
  if (nodeEnv === 'production') return false;
  return qaMode === '1';
}

export function isQaEnabled(): boolean {
  return isQaModeAllowed({
    qaMode: process.env.LIFE_RESET_QA_MODE,
    nodeEnv: process.env.NODE_ENV,
  });
}

export async function getQaDayOffset(): Promise<number> {
  if (!isQaEnabled()) return 0;
  const raw = (await cookies()).get(QA_COOKIE)?.value;
  const parsed = Number.parseInt(raw ?? '0', 10);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(30, Math.max(0, parsed));
}
```

- [ ] **Step 4: Run the QA test to verify it passes**

Run: `npm test -- qa`
Expected: PASS, 5 tests.

- [ ] **Step 5: Write the catalogue data module**

Create `src/lib/data/catalogue.ts`:

```ts
import 'server-only';
import { createServerSupabase } from '@/lib/supabase/server';
import type { TemplateInput } from '@/lib/domain/plan';

export type AreaCatalogueRow = { key: string; name: string; description: string; sortOrder: number };
export type RewardRow = {
  key: string; name: string; description: string; costPoints: number;
  rewardType: 'coach_note_pack' | 'theme' | 'badge';
};

export async function listAreaCatalogue(): Promise<AreaCatalogueRow[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('area_catalogue')
    .select('key, name, description, sort_order')
    .eq('is_active', true)
    .order('sort_order');
  if (error) throw error;
  return data.map((r) => ({ key: r.key, name: r.name, description: r.description, sortOrder: r.sort_order }));
}

export async function listHabitTemplates(): Promise<TemplateInput[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('habit_template')
    .select('key, area_key, title, detail, effort, sort_order, is_default');
  if (error) throw error;
  return data.map((r) => ({
    key: r.key,
    areaKey: r.area_key,
    title: r.title,
    detail: r.detail,
    effort: r.effort,
    sortOrder: r.sort_order,
    isDefault: r.is_default,
  }));
}

export async function getWeeklyPrompt(dayIndex: number): Promise<{ key: string; prompt: string }> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('weekly_prompt')
    .select('key, prompt')
    .eq('day_index', dayIndex)
    .order('sort_order')
    .limit(1)
    .single();
  if (error) throw error;
  return data;
}

export async function listRewards(): Promise<RewardRow[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('reward_catalogue')
    .select('key, name, description, cost_points, reward_type')
    .eq('is_active', true)
    .order('sort_order');
  if (error) throw error;
  return data.map((r) => ({
    key: r.key, name: r.name, description: r.description,
    costPoints: r.cost_points, rewardType: r.reward_type as RewardRow['rewardType'],
  }));
}
```

- [ ] **Step 6: Write the programme and progress data modules**

Create `src/lib/data/programme.ts`:

```ts
import 'server-only';
import { requireUser } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase/server';
import { programmeDayState, type DayState } from '@/lib/domain/day';
import { getQaDayOffset } from '@/lib/qa';

export type ProgrammeRow = {
  id: number;
  status: 'setup' | 'active' | 'completed' | 'abandoned';
  startDate: string | null;
  timezone: string;
};

export type ProgrammeHabitRow = {
  id: number;
  userAreaId: number | null;
  areaLabel: string;
  title: string;
  detail: string | null;
  activeFromDay: number;
  activeToDay: number | null;
  sortOrder: number;
  sourceTemplateKey: string | null;
};

const PROGRAMME_COLUMNS = 'id, status, start_date, timezone';

function toProgramme(row: {
  id: number; status: string; start_date: string | null; timezone: string;
}): ProgrammeRow {
  return {
    id: row.id,
    status: row.status as ProgrammeRow['status'],
    startDate: row.start_date,
    timezone: row.timezone,
  };
}

export async function getOpenProgramme(): Promise<ProgrammeRow | null> {
  await requireUser();
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('programme')
    .select(PROGRAMME_COLUMNS)
    .in('status', ['setup', 'active'])
    .maybeSingle();
  if (error) throw error;
  return data ? toProgramme(data) : null;
}

export async function getOrCreateSetupProgramme(timezone: string): Promise<ProgrammeRow> {
  const existing = await getOpenProgramme();
  if (existing) return existing;

  const user = await requireUser();
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('programme')
    .insert({ user_id: user.id, status: 'setup', timezone })
    .select(PROGRAMME_COLUMNS)
    .single();
  if (error) throw error;
  return toProgramme(data);
}

export async function listProgrammeHabits(programmeId: number): Promise<ProgrammeHabitRow[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('programme_habit')
    .select('id, user_area_id, area_label, title, detail, active_from_day, active_to_day, sort_order, source_template_key')
    .eq('programme_id', programmeId)
    .order('sort_order');
  if (error) throw error;
  return data.map((r) => ({
    id: r.id,
    userAreaId: r.user_area_id,
    areaLabel: r.area_label,
    title: r.title,
    detail: r.detail,
    activeFromDay: r.active_from_day,
    activeToDay: r.active_to_day,
    sortOrder: r.sort_order,
    sourceTemplateKey: r.source_template_key,
  }));
}

export async function currentDayState(programme: ProgrammeRow): Promise<DayState> {
  if (!programme.startDate) {
    return { localDate: '', rawDayIndex: 0, currentDay: 1, isBeforeStart: true, isComplete: false };
  }
  return programmeDayState({
    startDate: programme.startDate,
    timeZone: programme.timezone,
    now: new Date(),
    dayOffset: await getQaDayOffset(),
  });
}
```

Create `src/lib/data/progress.ts`:

```ts
import 'server-only';
import { requireUser } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase/server';

export type ProgressRow = {
  xpTotal: number;
  level: number;
  pointsEarnedTotal: number;
  pointsBalance: number;
  streakCurrent: number;
  streakLongest: number;
  shieldCount: number;
  lastCountedDay: number;
  lastSettledDay: number;
  activeProgrammeId: number | null;
};

const COLUMNS =
  'xp_total, level, points_earned_total, points_balance, streak_current, streak_longest, shield_count, last_counted_day, last_settled_day, active_programme_id';

export function toProgress(row: Record<string, number | null>): ProgressRow {
  return {
    xpTotal: Number(row.xp_total),
    level: Number(row.level),
    pointsEarnedTotal: Number(row.points_earned_total),
    pointsBalance: Number(row.points_balance),
    streakCurrent: Number(row.streak_current),
    streakLongest: Number(row.streak_longest),
    shieldCount: Number(row.shield_count),
    lastCountedDay: Number(row.last_counted_day),
    lastSettledDay: Number(row.last_settled_day),
    activeProgrammeId: row.active_programme_id === null ? null : Number(row.active_programme_id),
  };
}

export async function getOrCreateProgress(): Promise<ProgressRow> {
  const user = await requireUser();
  const supabase = await createServerSupabase();

  const { data, error } = await supabase.from('progress').select(COLUMNS).maybeSingle();
  if (error) throw error;
  if (data) return toProgress(data);

  const inserted = await supabase
    .from('progress')
    .insert({ user_id: user.id })
    .select(COLUMNS)
    .single();
  if (inserted.error) throw inserted.error;
  return toProgress(inserted.data);
}
```

- [ ] **Step 7: Verify the build and full unit suite**

Run: `npm run typecheck && npm test`
Expected: no type errors, all unit tests pass.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(data): add catalogue, programme and progress data access plus QA guard"
```

---

## Task 13: Setup wizard — choose areas

**Files:**
- Create: `src/app/app/setup/page.tsx`
- Create: `src/app/app/setup/actions.ts`
- Create: `src/app/app/setup/areas-step.tsx`
- Create: `src/lib/data/areas.ts`
- Modify: `src/app/app/page.tsx`

**Interfaces:**
- Consumes: `listAreaCatalogue`, `getOrCreateSetupProgramme`, `getOpenProgramme`.
- Produces from `src/lib/data/areas.ts`: `listUserAreas(): Promise<UserAreaRow[]>`, `replaceCatalogueSelections(keys: string[]): Promise<void>`, `addCustomArea(name: string): Promise<UserAreaRow>`, `renameArea(id: number, name: string): Promise<void>`, `deactivateArea(id: number): Promise<void>`.
- Produces server actions: `saveAreaSelection(prev, formData)`, `addCustomAreaAction(prev, formData)`.

- [ ] **Step 1: Write the areas data module**

Create `src/lib/data/areas.ts`:

```ts
import 'server-only';
import { requireUser } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase/server';
import type { SelectedArea } from '@/lib/domain/plan';

export type UserAreaRow = SelectedArea & { isActive: boolean };

const COLUMNS = 'id, area_key, name, is_custom, sort_order, is_active';

function toArea(row: {
  id: number; area_key: string | null; name: string; is_custom: boolean; sort_order: number; is_active: boolean;
}): UserAreaRow {
  return {
    userAreaId: row.id,
    areaKey: row.area_key,
    name: row.name,
    isCustom: row.is_custom,
    sortOrder: row.sort_order,
    isActive: row.is_active,
  };
}

export async function listUserAreas(includeInactive = false): Promise<UserAreaRow[]> {
  await requireUser();
  const supabase = await createServerSupabase();
  let query = supabase.from('user_area').select(COLUMNS).order('sort_order');
  if (!includeInactive) query = query.eq('is_active', true);
  const { data, error } = await query;
  if (error) throw error;
  return data.map(toArea);
}

/** Adds newly ticked catalogue areas and soft-deactivates unticked ones. */
export async function replaceCatalogueSelections(keys: string[]): Promise<void> {
  const user = await requireUser();
  const supabase = await createServerSupabase();
  const existing = await listUserAreas(true);

  const toReactivate = existing.filter((a) => a.areaKey && keys.includes(a.areaKey) && !a.isActive);
  const toDeactivate = existing.filter((a) => a.areaKey && !keys.includes(a.areaKey) && a.isActive);
  const existingKeys = new Set(existing.map((a) => a.areaKey).filter(Boolean));
  const toInsert = keys.filter((k) => !existingKeys.has(k));

  if (toInsert.length > 0) {
    const base = existing.length;
    const { error } = await supabase.from('user_area').insert(
      toInsert.map((key, i) => ({
        user_id: user.id, area_key: key, name: key, is_custom: false, sort_order: base + i,
      })),
    );
    if (error) throw error;
  }

  for (const area of toReactivate) {
    const { error } = await supabase.from('user_area').update({ is_active: true }).eq('id', area.userAreaId);
    if (error) throw error;
  }
  for (const area of toDeactivate) {
    const { error } = await supabase.from('user_area').update({ is_active: false }).eq('id', area.userAreaId);
    if (error) throw error;
  }
}

export async function addCustomArea(name: string): Promise<UserAreaRow> {
  const user = await requireUser();
  const supabase = await createServerSupabase();
  const existing = await listUserAreas(true);
  const { data, error } = await supabase
    .from('user_area')
    .insert({
      user_id: user.id, area_key: null, name: name.trim(), is_custom: true, sort_order: existing.length,
    })
    .select(COLUMNS)
    .single();
  if (error) throw error;
  return toArea(data);
}

export async function renameArea(id: number, name: string): Promise<void> {
  await requireUser();
  const supabase = await createServerSupabase();
  const { error } = await supabase.from('user_area').update({ name: name.trim() }).eq('id', id);
  if (error) throw error;
}

export async function deactivateArea(id: number): Promise<void> {
  await requireUser();
  const supabase = await createServerSupabase();
  const { error } = await supabase.from('user_area').update({ is_active: false }).eq('id', id);
  if (error) throw error;
}
```

Note: newly inserted catalogue areas store the catalogue `key` in `name` initially. Step 2's action overwrites it with the human-readable catalogue name.

- [ ] **Step 2: Write the setup actions**

Create `src/app/app/setup/actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase/server';
import { listAreaCatalogue } from '@/lib/data/catalogue';
import { addCustomArea, listUserAreas, replaceCatalogueSelections } from '@/lib/data/areas';
import { getOrCreateSetupProgramme } from '@/lib/data/programme';

export type SetupState = { error: string | null };

export async function saveAreaSelection(_prev: SetupState, formData: FormData): Promise<SetupState> {
  await requireUser();
  const keys = formData.getAll('areaKey').map(String);
  const timezone = String(formData.get('timezone') || 'Europe/London');

  await getOrCreateSetupProgramme(timezone);
  await replaceCatalogueSelections(keys);

  // Give the freshly inserted rows their human-readable catalogue names.
  const catalogue = new Map((await listAreaCatalogue()).map((a) => [a.key, a.name]));
  const supabase = await createServerSupabase();
  for (const area of await listUserAreas()) {
    const properName = area.areaKey ? catalogue.get(area.areaKey) : null;
    if (properName && area.name !== properName) {
      const { error } = await supabase.from('user_area').update({ name: properName }).eq('id', area.userAreaId);
      if (error) return { error: error.message };
    }
  }

  const active = await listUserAreas();
  if (active.length === 0) return { error: 'Pick at least one area to reset.' };

  revalidatePath('/app/setup');
  return { error: null };
}

export async function addCustomAreaAction(_prev: SetupState, formData: FormData): Promise<SetupState> {
  await requireUser();
  const name = String(formData.get('name') ?? '').trim();
  if (name.length === 0 || name.length > 60) {
    return { error: 'Give your area a name between 1 and 60 characters.' };
  }
  const timezone = String(formData.get('timezone') || 'Europe/London');
  await getOrCreateSetupProgramme(timezone);
  await addCustomArea(name);
  revalidatePath('/app/setup');
  return { error: null };
}
```

- [ ] **Step 3: Write the areas step UI**

Create `src/app/app/setup/areas-step.tsx`:

```tsx
'use client';

import { useActionState, useEffect, useState } from 'react';
import { saveAreaSelection, addCustomAreaAction, type SetupState } from './actions';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import type { AreaCatalogueRow } from '@/lib/data/catalogue';
import type { UserAreaRow } from '@/lib/data/areas';

const initial: SetupState = { error: null };

export function AreasStep({
  catalogue, selected, customAreas,
}: {
  catalogue: AreaCatalogueRow[];
  selected: string[];
  customAreas: UserAreaRow[];
}) {
  const [saveState, saveAction, savePending] = useActionState(saveAreaSelection, initial);
  const [customState, customAction] = useActionState(addCustomAreaAction, initial);
  const [picked, setPicked] = useState<string[]>(selected);
  const [timezone, setTimezone] = useState('Europe/London');

  useEffect(() => {
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);

  const total = picked.length + customAreas.length;

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Where does your reset start?</h1>
        <p className="text-stone-600">
          Three to five areas works best. You can always change your mind before day 1.
        </p>
      </header>

      <form action={saveAction} className="space-y-6">
        <input type="hidden" name="timezone" value={timezone} />
        <ul className="space-y-2">
          {catalogue.map((area) => {
            const isPicked = picked.includes(area.key);
            return (
              <li key={area.key}>
                <label className={`flex cursor-pointer gap-3 rounded-2xl border p-4 ${isPicked ? 'border-stone-900 bg-white' : 'border-stone-200'}`}>
                  <input
                    type="checkbox"
                    name="areaKey"
                    value={area.key}
                    checked={isPicked}
                    onChange={(e) =>
                      setPicked((prev) => (e.target.checked ? [...prev, area.key] : prev.filter((k) => k !== area.key)))
                    }
                    className="mt-1"
                  />
                  <span>
                    <span className="block font-medium">{area.name}</span>
                    <span className="block text-sm text-stone-600">{area.description}</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>

        <p className="text-sm text-stone-500">
          {total} selected{total > 5 ? ' — that is a lot to hold at once, but it is your call.' : ''}
        </p>
        {saveState.error ? <p className="text-sm text-red-700">{saveState.error}</p> : null}
        <Button type="submit" disabled={savePending || total === 0}>
          {savePending ? 'Saving…' : 'Build my plan'}
        </Button>
      </form>

      <form action={customAction} className="space-y-3 border-t border-stone-200 pt-6">
        <input type="hidden" name="timezone" value={timezone} />
        <Field label="Something not on the list?" name="name" maxLength={60} placeholder="e.g. Guitar practice" />
        {customState.error ? <p className="text-sm text-red-700">{customState.error}</p> : null}
        <button type="submit" className="text-sm underline">Add your own area</button>
      </form>

      {customAreas.length > 0 ? (
        <ul className="space-y-1 text-sm text-stone-600">
          {customAreas.map((area) => <li key={area.userAreaId}>Your area: {area.name}</li>)}
        </ul>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Wire the setup page and route new users to it**

Create `src/app/app/setup/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { listAreaCatalogue } from '@/lib/data/catalogue';
import { listUserAreas } from '@/lib/data/areas';
import { getOpenProgramme } from '@/lib/data/programme';
import { AreasStep } from './areas-step';

export default async function SetupPage() {
  const programme = await getOpenProgramme();
  if (programme?.status === 'active') redirect('/app');

  const [catalogue, areas] = await Promise.all([listAreaCatalogue(), listUserAreas()]);

  return (
    <AreasStep
      catalogue={catalogue}
      selected={areas.filter((a) => !a.isCustom && a.areaKey).map((a) => a.areaKey!)}
      customAreas={areas.filter((a) => a.isCustom)}
    />
  );
}
```

Task 14 replaces this file with the full three-stage version. Keeping it single-stage here means the app builds and the area picker is testable on its own.

Replace `src/app/app/page.tsx` with a redirect stub that Task 15 fills in:

```tsx
import { redirect } from 'next/navigation';
import { getOpenProgramme } from '@/lib/data/programme';

export default async function TodayPage() {
  const programme = await getOpenProgramme();
  if (!programme || programme.status === 'setup') redirect('/app/setup');
  return <p className="text-stone-600">Programme {programme.id} is active.</p>;
}
```

- [ ] **Step 5: Manual verification**

Run `npm run dev`, sign in, visit `/app`. Expected: redirect to `/app/setup` showing all 19 catalogue areas. Tick three, submit. In Supabase Studio, `user_area` has three rows with human-readable names and `programme` has one row with `status = 'setup'`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(setup): add area selection step with custom areas"
```

---

## Task 14: Setup wizard — generate, refine and start

**Files:**
- Create: `src/app/app/setup/plan-step.tsx`
- Modify: `src/app/app/setup/actions.ts`
- Modify: `src/lib/data/programme.ts`

**Interfaces:**
- Consumes: `generatePlan` from `@/lib/domain/plan`, `listHabitTemplates`, `listUserAreas`.
- Produces server actions: `generatePlanAction(prev, formData)`, `updateDraftHabit(prev, formData)`, `removeDraftHabit(prev, formData)`, `addDraftHabit(prev, formData)`, `confirmStart(prev, formData)`.
- Produces from `programme.ts`: `insertProgrammeHabits(programmeId, drafts)`, `startProgramme(programmeId, startDate, timezone)`.

- [ ] **Step 1: Extend the programme data module**

Append to `src/lib/data/programme.ts`:

```ts
import type { DraftHabit } from '@/lib/domain/plan';

export async function insertProgrammeHabits(programmeId: number, drafts: DraftHabit[]): Promise<void> {
  const user = await requireUser();
  const supabase = await createServerSupabase();
  if (drafts.length === 0) return;
  const { error } = await supabase.from('programme_habit').insert(
    drafts.map((d) => ({
      user_id: user.id,
      programme_id: programmeId,
      user_area_id: d.userAreaId,
      source_template_key: d.sourceTemplateKey,
      area_label: d.areaLabel,
      title: d.title,
      detail: d.detail,
      active_from_day: 1,
      sort_order: d.sortOrder,
    })),
  );
  if (error) throw error;
}

export async function startProgramme(
  programmeId: number, startDate: string, timezone: string,
): Promise<void> {
  const user = await requireUser();
  const supabase = await createServerSupabase();

  const { error } = await supabase
    .from('programme')
    .update({ status: 'active', start_date: startDate, timezone, started_at: new Date().toISOString() })
    .eq('id', programmeId)
    .eq('status', 'setup');
  if (error) throw error;

  // A new cycle resets streak state but never touches XP or points.
  const progressUpdate = await supabase
    .from('progress')
    .update({
      active_programme_id: programmeId,
      streak_current: 0,
      shield_count: 0,
      last_counted_day: 0,
      last_settled_day: 0,
    })
    .eq('user_id', user.id);
  if (progressUpdate.error) throw progressUpdate.error;
}
```

- [ ] **Step 2: Add the plan actions**

Append to `src/app/app/setup/actions.ts`:

```ts
import { generatePlan } from '@/lib/domain/plan';
import { listHabitTemplates } from '@/lib/data/catalogue';
import { getOpenProgramme, insertProgrammeHabits, listProgrammeHabits, startProgramme } from '@/lib/data/programme';
import { localDateInTimeZone } from '@/lib/domain/day';
import { redirect } from 'next/navigation';

export async function generatePlanAction(_prev: SetupState, formData: FormData): Promise<SetupState> {
  await requireUser();
  const programme = await getOpenProgramme();
  if (!programme || programme.status !== 'setup') return { error: 'No setup in progress.' };

  const existing = await listProgrammeHabits(programme.id);
  if (existing.length > 0) return { error: null };

  const [areas, templates] = await Promise.all([listUserAreas(), listHabitTemplates()]);
  const drafts = generatePlan(areas, templates);
  if (drafts.length === 0) return { error: 'Pick at least one area first.' };

  await insertProgrammeHabits(programme.id, drafts);
  revalidatePath('/app/setup');
  return { error: null };
}

export async function updateDraftHabit(_prev: SetupState, formData: FormData): Promise<SetupState> {
  await requireUser();
  const id = Number(formData.get('habitId'));
  const title = String(formData.get('title') ?? '').trim();
  if (title.length === 0 || title.length > 120) return { error: 'Habits need a title of 1–120 characters.' };

  const supabase = await createServerSupabase();
  const { error } = await supabase.from('programme_habit').update({ title }).eq('id', id);
  if (error) return { error: error.message };
  revalidatePath('/app/setup');
  return { error: null };
}

export async function removeDraftHabit(_prev: SetupState, formData: FormData): Promise<SetupState> {
  await requireUser();
  const programme = await getOpenProgramme();
  if (!programme || programme.status !== 'setup') return { error: 'Setup is already finished.' };

  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from('programme_habit')
    .delete()
    .eq('id', Number(formData.get('habitId')))
    .eq('programme_id', programme.id);
  if (error) return { error: error.message };
  revalidatePath('/app/setup');
  return { error: null };
}

export async function addDraftHabit(_prev: SetupState, formData: FormData): Promise<SetupState> {
  const user = await requireUser();
  const programme = await getOpenProgramme();
  if (!programme || programme.status !== 'setup') return { error: 'Setup is already finished.' };

  const title = String(formData.get('title') ?? '').trim();
  const userAreaId = Number(formData.get('userAreaId'));
  if (title.length === 0 || title.length > 120) return { error: 'Habits need a title of 1–120 characters.' };

  const areas = await listUserAreas();
  const area = areas.find((a) => a.userAreaId === userAreaId);
  if (!area) return { error: 'Pick an area for this habit.' };

  const existing = await listProgrammeHabits(programme.id);
  const supabase = await createServerSupabase();
  const { error } = await supabase.from('programme_habit').insert({
    user_id: user.id,
    programme_id: programme.id,
    user_area_id: area.userAreaId,
    source_template_key: null,
    area_label: area.name,
    title,
    detail: null,
    active_from_day: 1,
    sort_order: existing.length,
  });
  if (error) return { error: error.message };
  revalidatePath('/app/setup');
  return { error: null };
}

export async function confirmStart(_prev: SetupState, formData: FormData): Promise<SetupState> {
  await requireUser();
  const programme = await getOpenProgramme();
  if (!programme || programme.status !== 'setup') return { error: 'Setup is already finished.' };

  const habits = await listProgrammeHabits(programme.id);
  if (habits.length === 0) return { error: 'Add at least one habit before you start.' };

  const timezone = String(formData.get('timezone') || programme.timezone);
  const startDate = localDateInTimeZone(new Date(), timezone);
  await startProgramme(programme.id, startDate, timezone);

  revalidatePath('/app', 'layout');
  redirect('/app');
}
```

- [ ] **Step 3: Build the plan review UI**

Create `src/app/app/setup/plan-step.tsx`:

```tsx
'use client';

import { useActionState, useEffect, useState } from 'react';
import { confirmStart, removeDraftHabit, updateDraftHabit, type SetupState } from './actions';
import { Button } from '@/components/ui/button';
import type { ProgrammeHabitRow } from '@/lib/data/programme';

const initial: SetupState = { error: null };

export function PlanStep({ programmeId, habits }: { programmeId: number; habits: ProgrammeHabitRow[] }) {
  const [startState, startAction, startPending] = useActionState(confirmStart, initial);
  const [, updateAction] = useActionState(updateDraftHabit, initial);
  const [, removeAction] = useActionState(removeDraftHabit, initial);
  const [timezone, setTimezone] = useState('Europe/London');

  useEffect(() => {
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Here is your 21 days</h1>
        <p className="text-stone-600">
          Small on purpose. Change anything that does not fit — after day 1 this gets harder to edit.
        </p>
      </header>

      <ul className="space-y-3">
        {habits.map((habit) => (
          <li key={habit.id} className="rounded-2xl border border-stone-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-stone-500">{habit.areaLabel}</p>
            <form action={updateAction} className="mt-2 flex gap-2">
              <input type="hidden" name="habitId" value={habit.id} />
              <input
                name="title"
                defaultValue={habit.title}
                maxLength={120}
                className="flex-1 border-b border-stone-200 bg-transparent py-1 text-base outline-none focus:border-stone-900"
              />
              <button type="submit" className="text-sm underline">Save</button>
            </form>
            {habit.detail ? <p className="mt-2 text-sm text-stone-600">{habit.detail}</p> : null}
            <form action={removeAction} className="mt-3">
              <input type="hidden" name="habitId" value={habit.id} />
              <button type="submit" className="text-sm text-stone-500 underline">Remove</button>
            </form>
          </li>
        ))}
      </ul>

      <p className="text-sm text-stone-500">
        Programme {programmeId}. Weekly reflections land on days 7, 14 and 21.
      </p>

      <form action={startAction} className="space-y-3">
        <input type="hidden" name="timezone" value={timezone} />
        {startState.error ? <p className="text-sm text-red-700">{startState.error}</p> : null}
        <Button type="submit" disabled={startPending}>
          {startPending ? 'Starting…' : 'Start day 1 today'}
        </Button>
      </form>
    </div>
  );
}
```

Replace `src/app/app/setup/page.tsx` in full so it drives all three wizard stages:

```tsx
import { redirect } from 'next/navigation';
import { listAreaCatalogue } from '@/lib/data/catalogue';
import { listUserAreas } from '@/lib/data/areas';
import { getOpenProgramme, listProgrammeHabits } from '@/lib/data/programme';
import { generatePlanAction } from './actions';
import { AreasStep } from './areas-step';
import { PlanStep } from './plan-step';
import { Button } from '@/components/ui/button';

export default async function SetupPage() {
  const programme = await getOpenProgramme();
  if (programme?.status === 'active') redirect('/app');

  const [catalogue, areas] = await Promise.all([listAreaCatalogue(), listUserAreas()]);
  const habits = programme ? await listProgrammeHabits(programme.id) : [];

  // Stage 3: refine the generated plan and start.
  if (programme && habits.length > 0) {
    return <PlanStep programmeId={programme.id} habits={habits} />;
  }

  // Stage 2: areas are chosen, nothing generated yet.
  if (programme && areas.length > 0) {
    return (
      <form action={generatePlanAction.bind(null, { error: null })} className="space-y-6">
        <h1 className="text-2xl font-semibold">Ready when you are</h1>
        <p className="text-stone-600">
          {areas.length} {areas.length === 1 ? 'area' : 'areas'} chosen. Let us turn that into 21 days.
        </p>
        <Button type="submit">Generate my plan</Button>
      </form>
    );
  }

  // Stage 1: pick areas.
  return (
    <AreasStep
      catalogue={catalogue}
      selected={areas.filter((a) => !a.isCustom && a.areaKey).map((a) => a.areaKey!)}
      customAreas={areas.filter((a) => a.isCustom)}
    />
  );
}
```

`generatePlanAction.bind(null, { error: null })` adapts the `useActionState` signature `(prevState, formData)` for a plain `<form action>`, which passes only the `FormData`.

- [ ] **Step 4: Manual verification of the full wizard**

Run `npm run dev`. From a fresh account: pick Sleep, Fitness and Money basics → Build my plan → Generate my plan → 6 habits appear (2 per area, low-effort first) → edit one title, remove one → Start day 1 today. Expected: redirect to `/app`; `programme.status = 'active'`; `programme.start_date` is today in your timezone; `progress.active_programme_id` is set.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(setup): generate, refine and confirm the 21-day plan"
```

---

# Phase 5 — Today screen and check-ins

## Task 15: Today view assembly

**Files:**
- Create: `src/lib/data/today.ts`
- Create: `src/components/status-row.tsx`, `src/components/coach-line.tsx`, `src/components/habit-item.tsx`
- Modify: `src/app/app/page.tsx`

**Interfaces:**
- Consumes: `programmeDayState`, `habitsScheduledOnDay`, `scheduledCountForDay`, `requiredForStreak`, `rollForward`, `levelForXp`.
- Produces from `today.ts`:
  ```ts
  type TodayHabit = { id: number; title: string; detail: string | null; areaLabel: string; completed: boolean; note: string | null };
  type TodayView = { programmeId: number; currentDay: number; isComplete: boolean; habits: TodayHabit[]; scheduled: number; completed: number; requiredForStreak: number; reflectionDue: boolean; reflectionDone: boolean; progress: ProgressRow; levelTitle: string };
  function getTodayView(): Promise<TodayView | null>;
  function refreshProgress(programmeId: number): Promise<ProgressRow>;
  ```

- [ ] **Step 1: Write the progress refresh and Today assembly**

Create `src/lib/data/today.ts`:

```ts
import 'server-only';
import { requireUser } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase/server';
import { currentDayState, getOpenProgramme, listProgrammeHabits } from '@/lib/data/programme';
import { getOrCreateProgress, toProgress, type ProgressRow } from '@/lib/data/progress';
import { habitsScheduledOnDay, scheduledCountForDay } from '@/lib/domain/schedule';
import { requiredForStreak, rollForward, type DayCounts } from '@/lib/domain/streak';
import { levelForXp } from '@/lib/domain/levels';
import { REFLECTION_DAYS } from '@/lib/domain/constants';

export type TodayHabit = {
  id: number; title: string; detail: string | null; areaLabel: string;
  completed: boolean; note: string | null;
};

export type TodayView = {
  programmeId: number;
  currentDay: number;
  isComplete: boolean;
  habits: TodayHabit[];
  scheduled: number;
  completed: number;
  requiredForStreak: number;
  reflectionDue: boolean;
  reflectionDone: boolean;
  progress: ProgressRow;
  levelTitle: string;
};

/** Completed check-ins grouped by day for the whole programme. */
async function completionsByDay(programmeId: number): Promise<Map<number, number>> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('habit_check_in')
    .select('day_index')
    .eq('programme_id', programmeId)
    .eq('completed', true);
  if (error) throw error;

  const counts = new Map<number, number>();
  for (const row of data) counts.set(row.day_index, (counts.get(row.day_index) ?? 0) + 1);
  return counts;
}

/**
 * Rolls streak state forward to today and persists it. Safe to call on every
 * request: rollForward is idempotent, so repeats write the same values.
 */
export async function refreshProgress(programmeId: number): Promise<ProgressRow> {
  const user = await requireUser();
  const programme = await getOpenProgramme();
  const progress = await getOrCreateProgress();
  if (!programme || programme.id !== programmeId || !programme.startDate) return progress;

  const [habits, completions, dayState] = await Promise.all([
    listProgrammeHabits(programmeId),
    completionsByDay(programmeId),
    currentDayState(programme),
  ]);

  const days: DayCounts[] = [];
  for (let day = 1; day <= dayState.currentDay; day += 1) {
    days.push({
      dayIndex: day,
      scheduled: scheduledCountForDay(habits, day),
      completed: completions.get(day) ?? 0,
    });
  }

  const next = rollForward(progress, days, dayState.currentDay);
  if (
    next.streakCurrent === progress.streakCurrent &&
    next.streakLongest === progress.streakLongest &&
    next.shieldCount === progress.shieldCount &&
    next.lastCountedDay === progress.lastCountedDay &&
    next.lastSettledDay === progress.lastSettledDay
  ) {
    return progress;
  }

  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('progress')
    .update({
      streak_current: next.streakCurrent,
      streak_longest: next.streakLongest,
      shield_count: next.shieldCount,
      last_counted_day: next.lastCountedDay,
      last_settled_day: next.lastSettledDay,
    })
    .eq('user_id', user.id)
    .select(
      'xp_total, level, points_earned_total, points_balance, streak_current, streak_longest, shield_count, last_counted_day, last_settled_day, active_programme_id',
    )
    .single();
  if (error) throw error;
  return toProgress(data);
}

export async function getTodayView(): Promise<TodayView | null> {
  const programme = await getOpenProgramme();
  if (!programme || programme.status !== 'active' || !programme.startDate) return null;

  const dayState = await currentDayState(programme);
  const progress = await refreshProgress(programme.id);

  const supabase = await createServerSupabase();
  const [habits, checkIns, reflection] = await Promise.all([
    listProgrammeHabits(programme.id),
    supabase
      .from('habit_check_in')
      .select('programme_habit_id, completed, note')
      .eq('programme_id', programme.id)
      .eq('day_index', dayState.currentDay),
    supabase
      .from('reflection')
      .select('day_index')
      .eq('programme_id', programme.id)
      .eq('day_index', dayState.currentDay)
      .maybeSingle(),
  ]);
  if (checkIns.error) throw checkIns.error;

  const byHabit = new Map(checkIns.data.map((c) => [c.programme_habit_id, c]));
  const scheduledHabits = habitsScheduledOnDay(habits, dayState.currentDay);

  const todayHabits: TodayHabit[] = scheduledHabits.map((habit) => {
    const checkIn = byHabit.get(habit.id);
    return {
      id: habit.id,
      title: habit.title,
      detail: habit.detail,
      areaLabel: habit.areaLabel,
      completed: checkIn?.completed ?? false,
      note: checkIn?.note ?? null,
    };
  });

  const completed = todayHabits.filter((h) => h.completed).length;

  return {
    programmeId: programme.id,
    currentDay: dayState.currentDay,
    isComplete: dayState.isComplete,
    habits: todayHabits,
    scheduled: todayHabits.length,
    completed,
    requiredForStreak: requiredForStreak(todayHabits.length),
    reflectionDue: (REFLECTION_DAYS as readonly number[]).includes(dayState.currentDay),
    reflectionDone: reflection.data !== null,
    progress,
    levelTitle: levelForXp(progress.xpTotal).title,
  };
}
```

- [ ] **Step 2: Build the compact status row**

The spec is explicit that XP, streak and points are **one compact row**, not a second game UI. Create `src/components/status-row.tsx`:

```tsx
import type { ProgressRow } from '@/lib/data/progress';

export function StatusRow({ progress, levelTitle }: { progress: ProgressRow; levelTitle: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-stone-200 pb-3 text-sm text-stone-600">
      <span title={levelTitle}>Lv {progress.level}</span>
      <span>{progress.xpTotal} XP</span>
      <span>
        {progress.streakCurrent}-day streak{progress.shieldCount > 0 ? ' · shielded' : ''}
      </span>
      <span>{progress.pointsBalance} pts</span>
    </div>
  );
}
```

Create `src/components/coach-line.tsx`:

```tsx
export function CoachLine({ children }: { children: React.ReactNode }) {
  return <p className="text-lg leading-relaxed text-stone-700">{children}</p>;
}
```

- [ ] **Step 3: Build the Today page**

Replace `src/app/app/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getOpenProgramme } from '@/lib/data/programme';
import { getTodayView } from '@/lib/data/today';
import { StatusRow } from '@/components/status-row';
import { CoachLine } from '@/components/coach-line';
import { coachLineForDay } from '@/content/coach';

export default async function TodayPage() {
  const programme = await getOpenProgramme();
  if (!programme || programme.status === 'setup') redirect('/app/setup');

  const view = await getTodayView();
  if (!view) redirect('/app/setup');
  if (view.isComplete) redirect('/app/complete');

  return (
    <div className="space-y-6">
      <StatusRow progress={view.progress} levelTitle={view.levelTitle} />

      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-stone-500">Day {view.currentDay} of 21</p>
        <CoachLine>{coachLineForDay(view.currentDay, view)}</CoachLine>
        {view.scheduled > 0 ? (
          <p className="text-sm text-stone-500">
            {view.requiredForStreak} of {view.scheduled} keeps your streak alive.
          </p>
        ) : null}
      </header>

      {/* Read-only for now. Task 16 swaps this for the interactive HabitItem. */}
      <ul className="space-y-2">
        {view.habits.map((habit) => (
          <li key={habit.id} className="rounded-2xl border border-stone-200 p-4">
            <span className="block text-xs uppercase tracking-wide text-stone-500">{habit.areaLabel}</span>
            <span className="block text-base">{habit.title}</span>
          </li>
        ))}
      </ul>

      {view.reflectionDue ? (
        <Link
          href="/app/reflect"
          className="block rounded-2xl border border-stone-900 px-5 py-4 text-center text-sm font-medium"
        >
          {view.reflectionDone ? 'Revisit this week’s reflection' : 'Write this week’s reflection'}
        </Link>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Verify the day number and streak threshold render**

Run: `npm run typecheck && npm run dev`, then open `/app` on an active programme.
Expected: "Day 1 of 21", the coach line, the compact status row, a read-only habit list, and the line "N of M keeps your streak alive" where N is `ceil(M / 2)`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(today): assemble the Today view with lazy streak evaluation"
```

---

## Task 16: Check-in server action with optimistic UI

**Files:**
- Create: `src/app/app/actions.ts`
- Create: `src/components/habit-item.tsx`

**Interfaces:**
- Consumes: `awardsForCheckIn`, `applyAwards`, `scheduledCountForDay`, `refreshProgress`.
- Produces: `toggleCheckIn(formData: FormData): Promise<void>` — a Server Action taking `habitId`, `dayIndex`, `completed`.

- [ ] **Step 1: Write the check-in action**

Create `src/app/app/actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { createServerSupabase } from '@/lib/supabase/server';
import { getOpenProgramme, listProgrammeHabits } from '@/lib/data/programme';
import { getOrCreateProgress } from '@/lib/data/progress';
import { refreshProgress } from '@/lib/data/today';
import { scheduledCountForDay } from '@/lib/domain/schedule';
import { applyAwards, awardsForCheckIn } from '@/lib/domain/awards';

export async function toggleCheckIn(formData: FormData): Promise<void> {
  const user = await requireUser();
  const habitId = Number(formData.get('habitId'));
  const dayIndex = Number(formData.get('dayIndex'));
  const completed = formData.get('completed') === 'true';

  const programme = await getOpenProgramme();
  if (!programme || programme.status !== 'active') return;

  const supabase = await createServerSupabase();

  const upsert = await supabase
    .from('habit_check_in')
    .upsert(
      {
        user_id: user.id,
        programme_id: programme.id,
        programme_habit_id: habitId,
        day_index: dayIndex,
        completed,
        completed_at: new Date().toISOString(),
      },
      { onConflict: 'programme_habit_id,day_index' },
    );
  if (upsert.error) throw upsert.error;

  if (completed) {
    await grantCheckInAwards(user.id, programme.id, habitId, dayIndex);
  }

  await refreshProgress(programme.id);
  revalidatePath('/app');
}

async function grantCheckInAwards(
  userId: string, programmeId: number, habitId: number, dayIndex: number,
): Promise<void> {
  const supabase = await createServerSupabase();

  const [habits, completedToday, ledger] = await Promise.all([
    listProgrammeHabits(programmeId),
    supabase
      .from('habit_check_in')
      .select('programme_habit_id')
      .eq('programme_id', programmeId)
      .eq('day_index', dayIndex)
      .eq('completed', true),
    supabase
      .from('xp_event')
      .select('kind, programme_habit_id')
      .eq('programme_id', programmeId)
      .eq('day_index', dayIndex),
  ]);
  if (completedToday.error) throw completedToday.error;
  if (ledger.error) throw ledger.error;

  const awards = awardsForCheckIn({
    programmeHabitId: habitId,
    dayIndex,
    scheduled: scheduledCountForDay(habits, dayIndex),
    completedAfter: completedToday.data.length,
    alreadyAwardedHabitIds: ledger.data
      .filter((e) => e.kind === 'habit_check_in' && e.programme_habit_id !== null)
      .map((e) => e.programme_habit_id as number),
    fullDayAlreadyAwarded: ledger.data.some((e) => e.kind === 'full_day_bonus'),
  });
  if (awards.length === 0) return;

  // Unique indexes on xp_event make this exactly-once even under a double click.
  const inserted = await supabase
    .from('xp_event')
    .insert(
      awards.map((a) => ({
        user_id: userId,
        programme_id: programmeId,
        kind: a.kind,
        day_index: a.dayIndex,
        programme_habit_id: a.programmeHabitId,
        xp: a.xp,
        points: a.points,
      })),
    )
    .select('kind, xp, points');

  // 23505 = the award was already paid by a concurrent request. Nothing to do.
  if (inserted.error) {
    if (inserted.error.code === '23505') return;
    throw inserted.error;
  }

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
    .eq('user_id', userId);
  if (update.error) throw update.error;
}
```

- [ ] **Step 2: Build the optimistic habit row and swap it into Today**

Create `src/components/habit-item.tsx`:

```tsx
'use client';

import { useOptimistic, useTransition, useState } from 'react';
import { toggleCheckIn } from '@/app/app/actions';
import type { TodayHabit } from '@/lib/data/today';

export function HabitItem({ habit, dayIndex }: { habit: TodayHabit; dayIndex: number }) {
  const [optimisticDone, setOptimisticDone] = useOptimistic(habit.completed);
  const [, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  function submit(next: boolean) {
    startTransition(async () => {
      setOptimisticDone(next);
      setFailed(false);
      const formData = new FormData();
      formData.set('habitId', String(habit.id));
      formData.set('dayIndex', String(dayIndex));
      formData.set('completed', String(next));
      try {
        await toggleCheckIn(formData);
      } catch {
        setFailed(true);
      }
    });
  }

  return (
    <li className={`rounded-2xl border p-4 ${optimisticDone ? 'border-stone-900 bg-white' : 'border-stone-200'}`}>
      <button
        type="button"
        onClick={() => submit(!optimisticDone)}
        className="flex w-full items-start gap-3 text-left"
      >
        <span
          aria-hidden
          className={`mt-1 size-5 shrink-0 rounded-full border ${optimisticDone ? 'border-stone-900 bg-stone-900' : 'border-stone-400'}`}
        />
        <span>
          <span className="block text-xs uppercase tracking-wide text-stone-500">{habit.areaLabel}</span>
          <span className={`block text-base ${optimisticDone ? 'text-stone-500 line-through' : ''}`}>
            {habit.title}
          </span>
          {habit.detail ? <span className="block text-sm text-stone-500">{habit.detail}</span> : null}
        </span>
      </button>
      {failed ? (
        <p className="mt-2 text-sm text-red-700">
          That did not save.{' '}
          <button type="button" onClick={() => submit(!habit.completed)} className="underline">
            Try again
          </button>
        </p>
      ) : null}
    </li>
  );
}
```

Then replace the read-only list in `src/app/app/page.tsx` with the interactive one, adding `import { HabitItem } from '@/components/habit-item';`:

```tsx
      <ul className="space-y-2">
        {view.habits.map((habit) => (
          <HabitItem key={habit.id} habit={habit} dayIndex={view.currentDay} />
        ))}
      </ul>
```

- [ ] **Step 3: Manual verification of the rules**

Run `npm run dev` on an active programme with 4 habits on day 1.

| Action | Expected |
|--------|----------|
| Tick 1 habit | +10 XP, +2 pts. Streak stays 0 (needs 2 of 4). |
| Tick a 2nd habit | +10 XP, +2 pts. Streak becomes 1. |
| Untick a habit | XP and points unchanged. Streak stays 1. |
| Re-tick it | XP and points unchanged (already paid). |
| Tick all 4 | +25 XP, +5 pts full-day bonus. Status row shows "shielded". |
| Tick a 5th time / double-click | No further XP. `xp_event` has exactly 5 rows for day 1. |

- [ ] **Step 4: Verify the ledger in SQL**

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -c "select kind, count(*), sum(xp), sum(points) from public.xp_event group by kind order by kind;"
```

Expected: `habit_check_in | 4 | 40 | 8` and `full_day_bonus | 1 | 25 | 5`.

- [ ] **Step 5: Run the full suite and commit**

```bash
npm run typecheck && npm test && npm run build
git add -A
git commit -m "feat(today): add optimistic habit check-ins with idempotent XP awards"
```

---

# Phase 6 — Weekly reflections

## Task 17: Reflect screen

**Files:**
- Create: `src/lib/data/reflections.ts`
- Create: `src/app/app/reflect/page.tsx`, `src/app/app/reflect/actions.ts`

**Interfaces:**
- Consumes: `getWeeklyPrompt`, `awardsForReflection`, `applyAwards`, `currentDayState`.
- Produces: `listReflections(programmeId): Promise<ReflectionRow[]>`, `getReflection(programmeId, dayIndex): Promise<ReflectionRow | null>`, `saveReflection(prev, formData)`.

- [ ] **Step 1: Write the reflections data module**

Create `src/lib/data/reflections.ts`:

```ts
import 'server-only';
import { createServerSupabase } from '@/lib/supabase/server';

export type ReflectionRow = {
  dayIndex: number; promptKey: string | null; promptText: string; body: string; updatedAt: string;
};

const COLUMNS = 'day_index, prompt_key, prompt_text, body, updated_at';

function toReflection(row: {
  day_index: number; prompt_key: string | null; prompt_text: string; body: string; updated_at: string;
}): ReflectionRow {
  return {
    dayIndex: row.day_index,
    promptKey: row.prompt_key,
    promptText: row.prompt_text,
    body: row.body,
    updatedAt: row.updated_at,
  };
}

export async function listReflections(programmeId: number): Promise<ReflectionRow[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('reflection')
    .select(COLUMNS)
    .eq('programme_id', programmeId)
    .order('day_index');
  if (error) throw error;
  return data.map(toReflection);
}

export async function getReflection(programmeId: number, dayIndex: number): Promise<ReflectionRow | null> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('reflection')
    .select(COLUMNS)
    .eq('programme_id', programmeId)
    .eq('day_index', dayIndex)
    .maybeSingle();
  if (error) throw error;
  return data ? toReflection(data) : null;
}
```

- [ ] **Step 2: Write the save action**

Create `src/app/app/reflect/actions.ts`:

```ts
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
```

- [ ] **Step 3: Build the Reflect page**

Create `src/app/app/reflect/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { currentDayState, getOpenProgramme } from '@/lib/data/programme';
import { getWeeklyPrompt } from '@/lib/data/catalogue';
import { getReflection, listReflections } from '@/lib/data/reflections';
import { REFLECTION_DAYS } from '@/lib/domain/constants';
import { ReflectionForm } from './reflection-form';

export default async function ReflectPage() {
  const programme = await getOpenProgramme();
  if (!programme || programme.status === 'setup') redirect('/app/setup');

  const dayState = await currentDayState(programme);
  const past = await listReflections(programme.id);
  const dueDay = [...REFLECTION_DAYS].reverse().find((d) => d <= dayState.currentDay) ?? null;

  const current = dueDay ? await getReflection(programme.id, dueDay) : null;
  const prompt = dueDay ? await getWeeklyPrompt(dueDay) : null;
  const nextDay = REFLECTION_DAYS.find((d) => d > dayState.currentDay) ?? null;

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Reflect</h1>
        {dueDay === null && nextDay !== null ? (
          <p className="text-stone-600">
            Your first reflection lands on day {nextDay}. Nothing to write yet — just keep showing up.
          </p>
        ) : null}
      </header>

      {dueDay !== null && prompt !== null ? (
        <ReflectionForm dayIndex={dueDay} prompt={prompt.prompt} body={current?.body ?? ''} />
      ) : null}

      {past.length > 0 ? (
        <section className="space-y-4 border-t border-stone-200 pt-6">
          <h2 className="text-sm uppercase tracking-wide text-stone-500">Earlier entries</h2>
          {past.map((entry) => (
            <article key={entry.dayIndex} className="space-y-1">
              <p className="text-xs text-stone-500">Day {entry.dayIndex}</p>
              <p className="text-sm text-stone-600">{entry.promptText}</p>
              <p className="whitespace-pre-wrap text-base">
                {entry.body || <span className="text-stone-400">Left blank — that is allowed.</span>}
              </p>
            </article>
          ))}
        </section>
      ) : null}
    </div>
  );
}
```

Create `src/app/app/reflect/reflection-form.tsx`:

```tsx
'use client';

import { useActionState } from 'react';
import { saveReflection, type ReflectState } from './actions';
import { Button } from '@/components/ui/button';

const initial: ReflectState = { error: null, saved: false };

export function ReflectionForm({ dayIndex, prompt, body }: { dayIndex: number; prompt: string; body: string }) {
  const [state, action, pending] = useActionState(saveReflection, initial);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="dayIndex" value={dayIndex} />
      <p className="text-lg leading-relaxed text-stone-700">{prompt}</p>
      <textarea
        name="body"
        defaultValue={body}
        rows={10}
        className="w-full rounded-2xl border border-stone-300 bg-white p-4 text-base outline-none focus:border-stone-900"
        placeholder="Whatever comes out. Nobody else reads this."
      />
      {state.error ? <p className="text-sm text-red-700">{state.error}</p> : null}
      {state.saved ? <p className="text-sm text-stone-600">Saved. You can come back and add to it.</p> : null}
      <Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save reflection'}</Button>
    </form>
  );
}
```

- [ ] **Step 4: Manual verification**

With the QA fast-forward not yet built, temporarily set `programme.start_date` back 6 days in Supabase Studio to reach day 7. Expected: Reflect shows the day-7 prompt; saving an **empty** body succeeds and pays 50 XP / 15 pts exactly once; saving again pays nothing more; the entry appears under "Earlier entries".

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(reflect): add weekly reflections on days 7, 14 and 21"
```

---

# Phase 7 — Rewards, Plan, Areas, Account

## Task 18: Reward redemption RPC, Rewards screen, and owned-unlock rendering

**Files:**
- Create: `supabase/migrations/<ts>_redeem_reward.sql`
- Create: `src/lib/data/rewards.ts`
- Create: `src/lib/appearance.ts`
- Create: `src/app/app/rewards/page.tsx`, `src/app/app/rewards/actions.ts`
- Create: `tests/integration/rewards.test.ts`
- Create: `tests/unit/appearance.test.ts`
- Modify: `src/content/coach.ts` — optional pack argument on existing helpers
- Modify: `src/app/globals.css` — `[data-theme='dawn']` and `[data-theme='deep']` token overrides
- Modify: `src/app/app/layout.tsx` — apply the owned theme
- Modify: `src/app/app/page.tsx` — pass the owned coach pack into `coachLineForDay` / `coachLineForMiss`

**Interfaces:**
- Produces: SQL function `public.redeem_reward(p_reward_key text) returns public.progress`.
- Produces: `listRewardsWithOwnership(): Promise<RewardWithOwnership[]>` where `RewardWithOwnership = RewardRow & { owned: boolean; affordable: boolean }`; `redeemReward(prev, formData)`.
- Produces: `appearanceFromUnlocks(unlocks): { theme: 'default' | 'dawn' | 'deep'; coachPack: 'default' | 'grit' | 'calm' }`. If several unlocks of the same type are owned, the most recently unlocked (`unlocked_at`) of that type is active. Owning nothing keeps the default sage tokens and default coach copy.
- Owning a theme **must** change the authenticated UI (CSS custom properties on a `data-theme` wrapper). Owning a coach-note pack **must** change the copy returned by the coach helpers. The finisher badge is still an account mark (shown in Task 19); it does not have to restyle the app.

- [ ] **Step 1: Write the failing double-spend test**

Create `tests/integration/rewards.test.ts`:

```ts
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
```

Two different reward keys are used deliberately: the `unlock_one_per_reward` constraint would mask a double-spend if both calls bought the same item. With different keys the only thing that can stop the second purchase is the balance check inside the function, which is exactly what this test is for.

- [ ] **Step 2: Run it to verify it fails**

Run: `npm run test:integration -- rewards`
Expected: FAIL — `Could not find the function public.redeem_reward`.

- [ ] **Step 3: Write the RPC migration**

```bash
npx supabase migration new redeem_reward
```

```sql
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
```

- [ ] **Step 4: Apply and re-run the test**

```bash
npx supabase db reset
npm run test:integration -- rewards
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Add the rewards data module and screen**

Create `src/lib/data/rewards.ts`:

```ts
import 'server-only';
import { createServerSupabase } from '@/lib/supabase/server';
import { listRewards, type RewardRow } from '@/lib/data/catalogue';
import { getOrCreateProgress } from '@/lib/data/progress';

export type RewardWithOwnership = RewardRow & { owned: boolean; affordable: boolean };

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
```

Create `src/app/app/rewards/actions.ts`:

```ts
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
```

Create `src/app/app/rewards/page.tsx`:

```tsx
import { listRewardsWithOwnership } from '@/lib/data/rewards';
import { RewardList } from './reward-list';

export default async function RewardsPage() {
  const { rewards, pointsBalance } = await listRewardsWithOwnership();

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Rewards</h1>
        <p className="text-stone-600">
          {pointsBalance} reset points. These are for the look and feel — they never change the programme.
        </p>
      </header>
      <RewardList rewards={rewards} />
    </div>
  );
}
```

Create `src/app/app/rewards/reward-list.tsx`:

```tsx
'use client';

import { useActionState } from 'react';
import { redeemReward, type RewardState } from './actions';
import type { RewardWithOwnership } from '@/lib/data/rewards';

const initial: RewardState = { error: null, unlockedKey: null };

export function RewardList({ rewards }: { rewards: RewardWithOwnership[] }) {
  const [state, action, pending] = useActionState(redeemReward, initial);

  return (
    <div className="space-y-3">
      {state.error ? <p className="text-sm text-red-700">{state.error}</p> : null}
      <ul className="space-y-2">
        {rewards.map((reward) => (
          <li key={reward.key} className="flex items-start justify-between gap-4 rounded-2xl border border-stone-200 p-4">
            <div>
              <p className="font-medium">{reward.name}</p>
              <p className="text-sm text-stone-600">{reward.description}</p>
            </div>
            {reward.owned ? (
              <span className="shrink-0 text-sm text-stone-500">Yours</span>
            ) : (
              <form action={action} className="shrink-0">
                <input type="hidden" name="rewardKey" value={reward.key} />
                <button
                  type="submit"
                  disabled={pending || !reward.affordable}
                  className="rounded-full border border-stone-900 px-4 py-2 text-sm disabled:opacity-40"
                >
                  {reward.costPoints} pts
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 6: Wire owned unlocks into rendering**

Purchase without a visible change is not done. Themes and coach-note packs must take effect in the authenticated UI.

Create `tests/unit/appearance.test.ts` and watch it fail, then create `src/lib/appearance.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { appearanceFromUnlocks, type UnlockRecord } from '@/lib/appearance';

function unlock(rewardKey: string, unlockedAt: string): UnlockRecord {
  return { rewardKey, unlockedAt };
}

describe('appearanceFromUnlocks', () => {
  it('keeps defaults when nothing is owned', () => {
    expect(appearanceFromUnlocks([])).toEqual({ theme: 'default', coachPack: 'default' });
  });

  it('applies an owned theme and pack', () => {
    expect(
      appearanceFromUnlocks([
        unlock('theme_dawn', '2026-09-01T00:00:00Z'),
        unlock('coach_pack_grit', '2026-09-01T00:00:00Z'),
        unlock('badge_finisher', '2026-09-01T00:00:00Z'),
      ]),
    ).toEqual({ theme: 'dawn', coachPack: 'grit' });
  });

  it('uses the most recently unlocked item of each type', () => {
    expect(
      appearanceFromUnlocks([
        unlock('theme_dawn', '2026-09-01T00:00:00Z'),
        unlock('theme_deep', '2026-09-08T00:00:00Z'),
        unlock('coach_pack_grit', '2026-09-08T00:00:00Z'),
        unlock('coach_pack_calm', '2026-09-01T00:00:00Z'),
      ]),
    ).toEqual({ theme: 'deep', coachPack: 'grit' });
  });
});
```

```ts
export type UnlockRecord = { rewardKey: string; unlockedAt: string };
export type AppTheme = 'default' | 'dawn' | 'deep';
export type CoachPack = 'default' | 'grit' | 'calm';
export type Appearance = { theme: AppTheme; coachPack: CoachPack };

const THEMES: Record<string, AppTheme> = { theme_dawn: 'dawn', theme_deep: 'deep' };
const PACKS: Record<string, CoachPack> = { coach_pack_grit: 'grit', coach_pack_calm: 'calm' };

function latest(unlocks: UnlockRecord[], map: Record<string, string>): string | undefined {
  const matches = unlocks
    .filter((u) => u.rewardKey in map)
    .sort((a, b) => a.unlockedAt.localeCompare(b.unlockedAt));
  return matches.length === 0 ? undefined : matches[matches.length - 1].rewardKey;
}

export function appearanceFromUnlocks(unlocks: UnlockRecord[]): Appearance {
  const themeKey = latest(unlocks, THEMES);
  const packKey = latest(unlocks, PACKS);
  return {
    theme: themeKey ? THEMES[themeKey] : 'default',
    coachPack: packKey ? PACKS[packKey] : 'default',
  };
}
```

Then:
1. Add an optional `pack: CoachPack = 'default'` argument to `coachLineForSetup`, `coachLineForDay`, and `coachLineForMiss`. Keep today's default strings unchanged so existing tests stay green. Add grit and calm variants of the same four day-states (blunter vs gentler, still never shaming).
2. Load the user's `unlock` rows in `src/app/app/layout.tsx`, call `appearanceFromUnlocks`, and set `data-theme={appearance.theme}` on the authenticated shell wrapper.
3. In `src/app/globals.css`, add `[data-theme='dawn']` and `[data-theme='deep']` blocks that override the same CSS custom properties the default tokens use (paper, mist, ink, quiet). Dawn is a warm light palette; Deep is a low-light evening palette. Do not introduce a third layout.
4. Pass `appearance.coachPack` into `coachLineForDay` / `coachLineForMiss` on Today (Task 15's page). Extend `listRewardsWithOwnership` or add a small `listUnlocks()` helper in `src/lib/data/rewards.ts` so the layout does not query ad hoc.
5. `redeemReward` already revalidates `/app` and `/app/rewards`; after a theme or pack purchase the next render must show the new look or copy. Add a unit test that grit copy differs from default copy for the same day state.

Run: `npm test`
Expected: appearance tests plus existing unit tests PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(rewards): add atomic redemption and apply owned themes and coach packs"
```

---

## Task 19: Plan overview, mid-programme habit edits, Areas and Account

**Files:**
- Create: `src/app/app/plan/page.tsx`, `src/app/app/plan/actions.ts`, `src/app/app/plan/habit-editor.tsx`
- Create: `src/app/app/areas/page.tsx`, `src/app/app/areas/actions.ts`
- Create: `src/app/app/account/page.tsx`
- Modify: `src/lib/data/programme.ts`

**Interfaces:**
- Produces from `programme.ts`: `retireHabit(habitId: number, fromDay: number)`, `addHabitFromDay(programmeId, userAreaId, title, fromDay)`, `renameHabit(habitId, title)`.
- Produces from `plan/actions.ts`: `retireHabitAction`, `addHabitAction`, `renameHabitAction`.
- Produces from `areas/actions.ts`: `renameAreaAction`, `deactivateAreaAction`, `addAreaAction`.

- [ ] **Step 1: Extend the programme data module for mid-programme edits**

Append to `src/lib/data/programme.ts`:

```ts
/**
 * Removes a habit from `fromDay` onwards while keeping every earlier day's
 * check-ins and scheduled count intact. Setting active_to_day to the day
 * before is how "edits update future days" is implemented.
 */
export async function retireHabit(habitId: number, fromDay: number): Promise<void> {
  await requireUser();
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from('programme_habit')
    .update({ active_to_day: Math.max(1, fromDay - 1) })
    .eq('id', habitId);
  if (error) throw error;
}

export async function addHabitFromDay(
  programmeId: number, userAreaId: number, areaLabel: string, title: string, fromDay: number,
): Promise<void> {
  const user = await requireUser();
  const supabase = await createServerSupabase();
  const existing = await listProgrammeHabits(programmeId);
  const { error } = await supabase.from('programme_habit').insert({
    user_id: user.id,
    programme_id: programmeId,
    user_area_id: userAreaId,
    source_template_key: null,
    area_label: areaLabel,
    title,
    detail: null,
    active_from_day: fromDay,
    sort_order: existing.length,
  });
  if (error) throw error;
}

export async function renameHabit(habitId: number, title: string): Promise<void> {
  await requireUser();
  const supabase = await createServerSupabase();
  const { error } = await supabase.from('programme_habit').update({ title }).eq('id', habitId);
  if (error) throw error;
}
```

- [ ] **Step 2: Write the plan actions**

Create `src/app/app/plan/actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { currentDayState, getOpenProgramme, addHabitFromDay, renameHabit, retireHabit } from '@/lib/data/programme';
import { listUserAreas } from '@/lib/data/areas';

export type PlanState = { error: string | null; notice: string | null };

export async function retireHabitAction(_prev: PlanState, formData: FormData): Promise<PlanState> {
  await requireUser();
  const programme = await getOpenProgramme();
  if (!programme || programme.status !== 'active') return { error: 'No active programme.', notice: null };

  const { currentDay } = await currentDayState(programme);
  await retireHabit(Number(formData.get('habitId')), currentDay);

  revalidatePath('/app/plan');
  revalidatePath('/app');
  return {
    error: null,
    notice: 'Dropped from tomorrow onwards. Everything you already ticked still counts.',
  };
}

export async function renameHabitAction(_prev: PlanState, formData: FormData): Promise<PlanState> {
  await requireUser();
  const title = String(formData.get('title') ?? '').trim();
  if (title.length === 0 || title.length > 120) {
    return { error: 'Habits need a title of 1–120 characters.', notice: null };
  }
  await renameHabit(Number(formData.get('habitId')), title);
  revalidatePath('/app/plan');
  revalidatePath('/app');
  return { error: null, notice: 'Updated.' };
}

export async function addHabitAction(_prev: PlanState, formData: FormData): Promise<PlanState> {
  await requireUser();
  const programme = await getOpenProgramme();
  if (!programme || programme.status !== 'active') return { error: 'No active programme.', notice: null };

  const title = String(formData.get('title') ?? '').trim();
  const userAreaId = Number(formData.get('userAreaId'));
  if (title.length === 0 || title.length > 120) {
    return { error: 'Habits need a title of 1–120 characters.', notice: null };
  }

  const area = (await listUserAreas()).find((a) => a.userAreaId === userAreaId);
  if (!area) return { error: 'Pick an area for this habit.', notice: null };

  const { currentDay } = await currentDayState(programme);
  await addHabitFromDay(programme.id, area.userAreaId, area.name, title, currentDay);

  revalidatePath('/app/plan');
  revalidatePath('/app');
  return { error: null, notice: `Added from day ${currentDay}.` };
}
```

- [ ] **Step 3: Build the Plan page**

Create `src/app/app/plan/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { currentDayState, getOpenProgramme, listProgrammeHabits } from '@/lib/data/programme';
import { listUserAreas } from '@/lib/data/areas';
import { isScheduledOnDay } from '@/lib/domain/schedule';
import { PROGRAMME_DAYS, REFLECTION_DAYS } from '@/lib/domain/constants';
import { HabitEditor } from './habit-editor';

export default async function PlanPage() {
  const programme = await getOpenProgramme();
  if (!programme || programme.status === 'setup') redirect('/app/setup');

  const [habits, areas, dayState] = await Promise.all([
    listProgrammeHabits(programme.id),
    listUserAreas(),
    currentDayState(programme),
  ]);

  const days = Array.from({ length: PROGRAMME_DAYS }, (_, i) => i + 1);

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Your 21 days</h1>
        <p className="text-stone-600">Day {dayState.currentDay}. Edits here take effect from today onwards.</p>
      </header>

      <ol className="grid grid-cols-7 gap-1" aria-label="Programme days">
        {days.map((day) => (
          <li
            key={day}
            className={`aspect-square rounded-lg text-center text-[11px] leading-8 ${
              day < dayState.currentDay
                ? 'bg-stone-200 text-stone-600'
                : day === dayState.currentDay
                  ? 'bg-stone-900 text-stone-50'
                  : 'bg-stone-100 text-stone-400'
            }`}
          >
            {(REFLECTION_DAYS as readonly number[]).includes(day) ? `${day}★` : day}
          </li>
        ))}
      </ol>

      <HabitEditor
        currentDay={dayState.currentDay}
        habits={habits.map((h) => ({ ...h, activeToday: isScheduledOnDay(h, dayState.currentDay) }))}
        areas={areas}
      />
    </div>
  );
}
```

Create `src/app/app/plan/habit-editor.tsx`:

```tsx
'use client';

import { useActionState } from 'react';
import { addHabitAction, renameHabitAction, retireHabitAction, type PlanState } from './actions';
import { Button } from '@/components/ui/button';
import type { ProgrammeHabitRow } from '@/lib/data/programme';
import type { UserAreaRow } from '@/lib/data/areas';

const initial: PlanState = { error: null, notice: null };

export function HabitEditor({
  currentDay, habits, areas,
}: {
  currentDay: number;
  habits: (ProgrammeHabitRow & { activeToday: boolean })[];
  areas: UserAreaRow[];
}) {
  const [renameState, renameAction] = useActionState(renameHabitAction, initial);
  const [retireState, retireAction] = useActionState(retireHabitAction, initial);
  const [addState, addAction, addPending] = useActionState(addHabitAction, initial);
  const notice = renameState.notice ?? retireState.notice ?? addState.notice;
  const error = renameState.error ?? retireState.error ?? addState.error;

  return (
    <div className="space-y-6">
      {notice ? <p className="text-sm text-stone-600">{notice}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <ul className="space-y-3">
        {habits.map((habit) => (
          <li key={habit.id} className={`rounded-2xl border p-4 ${habit.activeToday ? 'border-stone-200' : 'border-dashed border-stone-300 opacity-60'}`}>
            <p className="text-xs uppercase tracking-wide text-stone-500">{habit.areaLabel}</p>
            {habit.activeToday ? (
              <>
                <form action={renameAction} className="mt-2 flex gap-2">
                  <input type="hidden" name="habitId" value={habit.id} />
                  <input
                    name="title"
                    defaultValue={habit.title}
                    maxLength={120}
                    className="flex-1 border-b border-stone-200 bg-transparent py-1 outline-none focus:border-stone-900"
                  />
                  <button type="submit" className="text-sm underline">Save</button>
                </form>
                <form action={retireAction} className="mt-3">
                  <input type="hidden" name="habitId" value={habit.id} />
                  <button type="submit" className="text-sm text-stone-500 underline">Drop this one</button>
                </form>
              </>
            ) : (
              <p className="mt-2 text-sm">
                {habit.title} — finished on day {habit.activeToDay ?? currentDay}
              </p>
            )}
          </li>
        ))}
      </ul>

      <form action={addAction} className="space-y-3 border-t border-stone-200 pt-6">
        <h2 className="text-sm uppercase tracking-wide text-stone-500">Add a habit from today</h2>
        <select name="userAreaId" className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3">
          {areas.map((area) => (
            <option key={area.userAreaId} value={area.userAreaId}>{area.name}</option>
          ))}
        </select>
        <input
          name="title"
          maxLength={120}
          placeholder="Something small and specific"
          className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3"
        />
        <Button type="submit" disabled={addPending}>{addPending ? 'Adding…' : 'Add habit'}</Button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Build Areas and Account**

Create `src/app/app/areas/actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { addCustomArea, deactivateArea, renameArea } from '@/lib/data/areas';

export type AreaState = { error: string | null; notice: string | null };

export async function renameAreaAction(_prev: AreaState, formData: FormData): Promise<AreaState> {
  await requireUser();
  const name = String(formData.get('name') ?? '').trim();
  if (name.length === 0 || name.length > 60) return { error: 'Names run 1–60 characters.', notice: null };
  await renameArea(Number(formData.get('areaId')), name);
  revalidatePath('/app/areas');
  return { error: null, notice: 'Renamed.' };
}

export async function deactivateAreaAction(_prev: AreaState, formData: FormData): Promise<AreaState> {
  await requireUser();
  await deactivateArea(Number(formData.get('areaId')));
  revalidatePath('/app/areas');
  return { error: null, notice: 'Hidden. Your finished days for it are still there.' };
}

export async function addAreaAction(_prev: AreaState, formData: FormData): Promise<AreaState> {
  await requireUser();
  const name = String(formData.get('name') ?? '').trim();
  if (name.length === 0 || name.length > 60) return { error: 'Names run 1–60 characters.', notice: null };
  await addCustomArea(name);
  revalidatePath('/app/areas');
  return { error: null, notice: 'Added. Give it a habit over on Plan.' };
}
```

Create `src/app/app/areas/page.tsx`:

```tsx
import { listUserAreas } from '@/lib/data/areas';
import { AreaList } from './area-list';

export default async function AreasPage() {
  const areas = await listUserAreas();

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Your areas</h1>
        <p className="text-stone-600">
          Hiding an area keeps every day you already finished for it. Habits are edited over on Plan.
        </p>
      </header>
      <AreaList areas={areas} />
    </div>
  );
}
```

Create `src/app/app/areas/area-list.tsx`:

```tsx
'use client';

import { useActionState } from 'react';
import { addAreaAction, deactivateAreaAction, renameAreaAction, type AreaState } from './actions';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import type { UserAreaRow } from '@/lib/data/areas';

const initial: AreaState = { error: null, notice: null };

export function AreaList({ areas }: { areas: UserAreaRow[] }) {
  const [renameState, renameAction] = useActionState(renameAreaAction, initial);
  const [hideState, hideAction] = useActionState(deactivateAreaAction, initial);
  const [addState, addAction, addPending] = useActionState(addAreaAction, initial);
  const notice = renameState.notice ?? hideState.notice ?? addState.notice;
  const error = renameState.error ?? hideState.error ?? addState.error;

  return (
    <div className="space-y-6">
      {notice ? <p className="text-sm text-stone-600">{notice}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <ul className="space-y-3">
        {areas.map((area) => (
          <li key={area.userAreaId} className="rounded-2xl border border-stone-200 p-4">
            <form action={renameAction} className="flex gap-2">
              <input type="hidden" name="areaId" value={area.userAreaId} />
              <input
                name="name"
                defaultValue={area.name}
                maxLength={60}
                className="flex-1 border-b border-stone-200 bg-transparent py-1 outline-none focus:border-stone-900"
              />
              <button type="submit" className="text-sm underline">Save</button>
            </form>
            <form action={hideAction} className="mt-3">
              <input type="hidden" name="areaId" value={area.userAreaId} />
              <button type="submit" className="text-sm text-stone-500 underline">Hide this area</button>
            </form>
          </li>
        ))}
      </ul>

      <form action={addAction} className="space-y-3 border-t border-stone-200 pt-6">
        <Field label="Add another area" name="name" maxLength={60} placeholder="e.g. Guitar practice" />
        <Button type="submit" disabled={addPending}>{addPending ? 'Adding…' : 'Add area'}</Button>
      </form>
    </div>
  );
}
```

Create `src/app/app/account/page.tsx`:

```tsx
import { requireUser } from '@/lib/auth';
import { getOrCreateProgress } from '@/lib/data/progress';
import { getOpenProgramme } from '@/lib/data/programme';
import { levelForXp } from '@/lib/domain/levels';

export default async function AccountPage() {
  const [user, progress, programme] = await Promise.all([
    requireUser(), getOrCreateProgress(), getOpenProgramme(),
  ]);
  const level = levelForXp(progress.xpTotal);

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Account</h1>
        <p className="text-stone-600">{user.email}</p>
      </header>

      <dl className="space-y-2 text-sm">
        <div className="flex justify-between"><dt className="text-stone-500">Level</dt><dd>{level.level} — {level.title}</dd></div>
        <div className="flex justify-between"><dt className="text-stone-500">XP</dt><dd>{progress.xpTotal}</dd></div>
        <div className="flex justify-between"><dt className="text-stone-500">Longest streak</dt><dd>{progress.streakLongest} days</dd></div>
        <div className="flex justify-between"><dt className="text-stone-500">Reset points</dt><dd>{progress.pointsBalance}</dd></div>
      </dl>

      {programme?.status === 'active' ? (
        <p className="text-sm text-stone-500">Cycle in progress since day 1.</p>
      ) : null}

      <form action="/auth/sign-out" method="post">
        <button type="submit" className="text-sm underline">Sign out</button>
      </form>
    </div>
  );
}
```

Task 21 replaces that placeholder paragraph with the abandon control.

- [ ] **Step 5: Manual verification**

On an active programme past day 1: drop a habit on Plan → today's list shrinks, yesterday's scheduled count is unchanged (check by comparing `progress.streak_current` before and after — it must not move). Add a habit → it appears on Today immediately and is absent from earlier days.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(app): add Plan overview with mid-programme edits, Areas and Account"
```

---

# Phase 8 — Completion and lifecycle

## Task 20: Programme completion

**Files:**
- Create: `src/app/app/complete/page.tsx`
- Modify: `src/lib/data/programme.ts`
- Modify: `src/app/app/page.tsx`

**Interfaces:**
- Produces: `completeProgrammeIfFinished(programme: ProgrammeRow): Promise<boolean>`, `getCompletionSummary(programmeId): Promise<CompletionSummary>` where
  `CompletionSummary = { programmeId: number; daysQualified: number; totalCheckIns: number; bestHabits: { title: string; count: number }[]; reflections: ReflectionRow[]; xpEarned: number; pointsEarned: number; longestStreak: number }`.

- [ ] **Step 1: Add completion transition and summary**

Append to `src/lib/data/programme.ts`:

```ts
/** Flips an active programme to completed once day 21 has passed. */
export async function completeProgrammeIfFinished(programme: ProgrammeRow): Promise<boolean> {
  if (programme.status !== 'active' || !programme.startDate) return false;
  const state = await currentDayState(programme);
  if (!state.isComplete) return false;

  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from('programme')
    .update({ status: 'completed', ended_at: new Date().toISOString() })
    .eq('id', programme.id)
    .eq('status', 'active');
  if (error) throw error;
  return true;
}

export async function abandonProgramme(programmeId: number): Promise<void> {
  await requireUser();
  const supabase = await createServerSupabase();
  const { error } = await supabase
    .from('programme')
    .update({ status: 'abandoned', ended_at: new Date().toISOString() })
    .eq('id', programmeId)
    .in('status', ['setup', 'active']);
  if (error) throw error;
}
```

Create `src/lib/data/completion.ts`:

```ts
import 'server-only';
import { createServerSupabase } from '@/lib/supabase/server';
import { listProgrammeHabits } from '@/lib/data/programme';
import { listReflections, type ReflectionRow } from '@/lib/data/reflections';
import { scheduledCountForDay } from '@/lib/domain/schedule';
import { dayQualifies } from '@/lib/domain/streak';
import { PROGRAMME_DAYS } from '@/lib/domain/constants';

export type CompletionSummary = {
  programmeId: number;
  daysQualified: number;
  totalCheckIns: number;
  bestHabits: { title: string; count: number }[];
  reflections: ReflectionRow[];
  xpEarned: number;
  pointsEarned: number;
};

export async function getCompletionSummary(programmeId: number): Promise<CompletionSummary> {
  const supabase = await createServerSupabase();
  const [habits, checkIns, ledger, reflections] = await Promise.all([
    listProgrammeHabits(programmeId),
    supabase
      .from('habit_check_in')
      .select('programme_habit_id, day_index')
      .eq('programme_id', programmeId)
      .eq('completed', true),
    supabase.from('xp_event').select('xp, points').eq('programme_id', programmeId),
    listReflections(programmeId),
  ]);
  if (checkIns.error) throw checkIns.error;
  if (ledger.error) throw ledger.error;

  const perDay = new Map<number, number>();
  const perHabit = new Map<number, number>();
  for (const row of checkIns.data) {
    perDay.set(row.day_index, (perDay.get(row.day_index) ?? 0) + 1);
    perHabit.set(row.programme_habit_id, (perHabit.get(row.programme_habit_id) ?? 0) + 1);
  }

  let daysQualified = 0;
  for (let day = 1; day <= PROGRAMME_DAYS; day += 1) {
    if (dayQualifies(scheduledCountForDay(habits, day), perDay.get(day) ?? 0)) daysQualified += 1;
  }

  const titleById = new Map(habits.map((h) => [h.id, h.title]));
  const bestHabits = [...perHabit.entries()]
    .map(([id, count]) => ({ title: titleById.get(id) ?? 'Removed habit', count }))
    .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title))
    .slice(0, 3);

  return {
    programmeId,
    daysQualified,
    totalCheckIns: checkIns.data.length,
    bestHabits,
    reflections,
    xpEarned: ledger.data.reduce((sum, e) => sum + e.xp, 0),
    pointsEarned: ledger.data.reduce((sum, e) => sum + e.points, 0),
  };
}
```

- [ ] **Step 2: Build the completion screen**

Create `src/app/app/complete/page.tsx`:

```tsx
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { completeProgrammeIfFinished, getOpenProgramme } from '@/lib/data/programme';
import { getCompletionSummary } from '@/lib/data/completion';
import { createServerSupabase } from '@/lib/supabase/server';
import { getOrCreateProgress } from '@/lib/data/progress';

export default async function CompletePage() {
  const open = await getOpenProgramme();
  if (open) await completeProgrammeIfFinished(open);

  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from('programme')
    .select('id')
    .eq('status', 'completed')
    .order('ended_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) redirect('/app');

  const [summary, progress] = await Promise.all([
    getCompletionSummary(data.id),
    getOrCreateProgress(),
  ]);

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <p className="text-xs uppercase tracking-[0.2em] text-stone-500">Twenty-one days</p>
        <h1 className="text-3xl font-semibold">You finished.</h1>
        <p className="text-lg leading-relaxed text-stone-700">
          {summary.daysQualified} of 21 days counted. {summary.totalCheckIns} things ticked off. That is not nothing —
          that is a month of small decisions going the right way.
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="text-sm uppercase tracking-wide text-stone-500">What stuck</h2>
        <ul className="space-y-1">
          {summary.bestHabits.map((habit) => (
            <li key={habit.title} className="flex justify-between text-sm">
              <span>{habit.title}</span>
              <span className="text-stone-500">{habit.count} days</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm uppercase tracking-wide text-stone-500">What you wrote</h2>
        {summary.reflections.map((entry) => (
          <article key={entry.dayIndex} className="space-y-1">
            <p className="text-xs text-stone-500">Day {entry.dayIndex}</p>
            <p className="whitespace-pre-wrap text-base">
              {entry.body || <span className="text-stone-400">Left blank.</span>}
            </p>
          </article>
        ))}
      </section>

      <dl className="space-y-2 border-t border-stone-200 pt-6 text-sm">
        <div className="flex justify-between"><dt className="text-stone-500">XP this cycle</dt><dd>{summary.xpEarned}</dd></div>
        <div className="flex justify-between"><dt className="text-stone-500">Longest streak</dt><dd>{progress.streakLongest} days</dd></div>
        <div className="flex justify-between"><dt className="text-stone-500">Points earned</dt><dd>{summary.pointsEarned}</dd></div>
      </dl>

      <Link href="/app/setup" className="block rounded-full bg-stone-900 px-6 py-4 text-center text-stone-50">
        Start another cycle
      </Link>
    </div>
  );
}
```

- [ ] **Step 3: Route finished programmes to the summary**

`src/app/app/page.tsx` already redirects to `/app/complete` when `view.isComplete`. Add the transition before the redirect so the row flips to `completed`:

```tsx
  if (view.isComplete) {
    await completeProgrammeIfFinished(programme);
    redirect('/app/complete');
  }
```

with `completeProgrammeIfFinished` imported from `@/lib/data/programme`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(complete): add programme completion summary and transition"
```

---

## Task 21: Abandon and restart

**Files:**
- Create: `src/app/app/account/actions.ts`, `src/app/app/account/abandon-button.tsx`

**Interfaces:**
- Consumes: `abandonProgramme` from `@/lib/data/programme`.
- Produces: `abandonProgrammeAction(prev, formData)`.

- [ ] **Step 1: Write the abandon action**

Create `src/app/app/account/actions.ts`:

```ts
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
```

- [ ] **Step 2: Build the confirmation control and wire it into Account**

Create `src/app/app/account/abandon-button.tsx`:

```tsx
'use client';

import { useActionState } from 'react';
import { abandonProgrammeAction, type AccountState } from './actions';

const initial: AccountState = { error: null };

export function AbandonButton() {
  const [state, action, pending] = useActionState(abandonProgrammeAction, initial);

  return (
    <form action={action} className="space-y-3 border-t border-stone-200 pt-6">
      <h2 className="text-sm uppercase tracking-wide text-stone-500">Start over</h2>
      <p className="text-sm text-stone-600">
        Stopping this cycle keeps everything you have written and every point of XP. The streak goes back to zero.
      </p>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="confirm" value="yes" />
        Yes, end this cycle
      </label>
      {state.error ? <p className="text-sm text-red-700">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="text-sm text-red-700 underline disabled:opacity-50">
        {pending ? 'Ending…' : 'End this cycle and start fresh'}
      </button>
    </form>
  );
}
```

Then in `src/app/app/account/page.tsx`, add `import { AbandonButton } from './abandon-button';` and replace the placeholder paragraph:

```tsx
      {programme?.status === 'active' ? <AbandonButton /> : null}
```

- [ ] **Step 3: Manual verification**

On an active programme with XP: abandon it. Expected: redirect to `/app/setup`; the old `programme` row is `abandoned` with its `habit_check_in` and `reflection` rows intact; `progress.xp_total` is unchanged; `progress.streak_current` is 0. Complete a fresh setup — the partial unique index permits it because the old row is no longer `setup` or `active`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(account): add abandon and restart while preserving history and XP"
```

---

# Phase 9 — QA helper and deployment

## Task 22: Env-gated day fast-forward

**Files:**
- Create: `src/app/api/qa/fast-forward/route.ts`
- Create: `src/components/qa-bar.tsx`
- Modify: `src/app/app/layout.tsx`
- Modify: `tests/integration/auth-gate.test.ts`

**Interfaces:**
- Consumes: `isQaEnabled`, `QA_COOKIE` from `@/lib/qa`.
- Produces: `POST /api/qa/fast-forward` accepting `offset` (0–30), setting the `lr_qa_day_offset` cookie. Returns 404 when QA mode is off.

This task inverts the usual TDD order, because a 404 for "the route does not exist" and a 404 for "the guard rejected you" are indistinguishable over HTTP. Write the route first, prove it works in development, and only then assert that production cannot reach it.

- [ ] **Step 1: Write the route**

Create `src/app/api/qa/fast-forward/route.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { isQaEnabled, QA_COOKIE } from '@/lib/qa';

export async function POST(request: NextRequest) {
  // Hard stop. In production this env var is never set, so the endpoint does
  // not exist as far as any caller is concerned.
  if (!isQaEnabled()) {
    return new NextResponse('Not found', { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as { offset?: unknown };
  const offset = Math.min(30, Math.max(0, Number(body.offset) || 0));

  const response = NextResponse.json({ offset });
  response.cookies.set(QA_COOKIE, String(offset), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24,
  });
  return response;
}
```

- [ ] **Step 2: Prove the route works when QA mode is on**

Set `LIFE_RESET_QA_MODE=1` in `.env.local` and run `npm run dev`. Then:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/qa/fast-forward \
  -H 'content-type: application/json' -d '{"offset":6}'
```

Expected: `200`. If this returns 404, the guard is wrong and the production test in Step 5 would pass for the wrong reason.

- [ ] **Step 3: Add the production-unreachability test**

Append to `tests/integration/auth-gate.test.ts`:

```ts
describe('QA fast-forward helper', () => {
  it('is not reachable in a production build', async () => {
    const res = await fetch(`${baseUrl}/api/qa/fast-forward`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ offset: 7 }),
      redirect: 'manual',
    });
    expect(res.status).toBe(404);
  });

  it('does not render the QA bar in a production build', async () => {
    const res = await fetch(`${baseUrl}/login`);
    expect(await res.text()).not.toContain('data-qa-bar');
  });
});
```

`startAppServer` already runs `next start` with `NODE_ENV=production`, so this asserts the real production behaviour.

- [ ] **Step 4: Add the dev-only control**

Create `src/components/qa-bar.tsx`:

```tsx
'use client';

export function QaBar({ offset }: { offset: number }) {
  async function jump(next: number) {
    await fetch('/api/qa/fast-forward', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ offset: next }),
    });
    window.location.reload();
  }

  return (
    <div data-qa-bar className="flex items-center gap-2 bg-amber-100 px-4 py-2 text-xs text-amber-900">
      <span>QA: +{offset} days</span>
      <button type="button" onClick={() => jump(offset + 1)} className="underline">+1</button>
      <button type="button" onClick={() => jump(offset + 6)} className="underline">+6</button>
      <button type="button" onClick={() => jump(0)} className="underline">reset</button>
    </div>
  );
}
```

Modify `src/app/app/layout.tsx` to render it only when the server guard allows:

```tsx
import { getQaDayOffset, isQaEnabled } from '@/lib/qa';
import { QaBar } from '@/components/qa-bar';

// inside AppLayout, before the return:
  const qaEnabled = isQaEnabled();
  const qaOffset = qaEnabled ? await getQaDayOffset() : 0;

// inside the returned JSX, as the first child of the wrapper div:
      {qaEnabled ? <QaBar offset={qaOffset} /> : null}
```

- [ ] **Step 5: Verify both directions**

Production direction:

```bash
npm run build && npm run test:integration -- auth-gate
```
Expected: PASS — the fast-forward route 404s and no `data-qa-bar` appears.

Development direction: set `LIFE_RESET_QA_MODE=1` in `.env.local`, run `npm run dev`, and on `/app` press `+6`. Expected: the amber bar appears, Today jumps to day 7, and the Reflect prompt becomes available. Remove the env var, restart, and confirm the bar disappears.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(qa): add env-gated day fast-forward that 404s in production"
```

---

## Task 23: Deploy to Vercel

**Files:**
- Create: `README.md` deployment section
- Modify: `.env.local.example`

**Interfaces:**
- Produces: a live production deployment backed by a hosted Supabase project.

- [ ] **Step 1: Create the hosted Supabase project**

In the Supabase dashboard create a new project (region closest to you). Record the project ref, URL and publishable key. Then link and push migrations:

```bash
npx supabase link --project-ref <ref>
npx supabase db push
```

Expected: `supabase migration list` shows all five migrations applied both locally and remotely.

- [ ] **Step 2: Run the security advisors against production**

```bash
npx supabase db advisors --linked
```

Expected: no `rls_disabled_in_public` and no `security_definer_view` findings. Fix anything reported before continuing.

- [ ] **Step 3: Configure auth settings**

In the Supabase dashboard under Authentication → URL Configuration, set the Site URL to the Vercel production domain and add `https://<domain>/**` to Redirect URLs. Under Providers, confirm Email is enabled with password sign-in. Decide on email confirmation (see Open Decisions — v1 default is confirmation off).

- [ ] **Step 4: Deploy**

```bash
npx vercel@latest link
npx vercel env add NEXT_PUBLIC_SUPABASE_URL production
npx vercel env add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY production
npx vercel --prod
```

Do **not** add `SUPABASE_SERVICE_ROLE_KEY` or `LIFE_RESET_QA_MODE` to any Vercel environment. The app never needs the service role key at runtime, and the QA helper must stay unreachable.

- [ ] **Step 5: Production smoke test**

On the live URL: sign up with a real address, run the setup wizard, tick a habit, and confirm the status row updates. Then verify the QA route is dead:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://<domain>/api/qa/fast-forward
```

Expected: `404`.

Verify the auth gate:

```bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://<domain>/app
```

Expected: `307` redirecting to `/login`.

- [ ] **Step 6: Document the setup in the README**

Add a "Running locally" section covering `npx supabase start`, copying `.env.local.example`, `npm run dev`, `npm test`, `npm run test:integration`, and a note that `LIFE_RESET_QA_MODE=1` enables the day fast-forward in development only.

- [ ] **Step 7: Final full verification**

```bash
npm run lint && npm run typecheck && npm test && npm run build && npm run test:integration
```

Expected: everything green.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: document local setup and production deployment"
```

---

## Manual Test Script (spec section 11 "Manual")

Run this end-to-end after Task 23, with `LIFE_RESET_QA_MODE=1` locally.

1. **Full journey.** Sign up → pick Sleep, Fitness, Mindfulness → generate → rename one habit → remove one → start. Day 1 shows the remaining habits.
2. **Streak threshold.** With 5 scheduled habits, tick 2 → streak stays 0. Tick a 3rd → streak becomes 1 (ceil(5/2) = 3).
3. **Shield earn.** Tick all 5 → status row shows "shielded", `progress.shield_count` is 1.
4. **Shield consume.** Fast-forward +1 day, tick nothing, fast-forward +1 again. Expected: streak value preserved, `shield_count` back to 0.
5. **Streak reset.** Miss a second day with no shield. Expected: streak drops to 0, XP unchanged.
6. **Reflection.** Fast-forward to day 7. Save an empty reflection → +50 XP, +15 pts. Save again → no change. Re-open and add text → text persists, still no extra XP.
7. **Rewards spend.** Buy `coach_pack_grit`. Balance drops by 40, XP unchanged, item shows "Yours", buying again is refused. Today’s coach line uses the grit pack (copy is blunter than the default). Buy `theme_dawn`. The authenticated shell switches to the dawn palette; the public landing page is unchanged.
8. **Mid-programme edit.** Drop a habit on day 9. Days 1–8 keep their check-ins; day 9 onward has one fewer scheduled habit; the streak does not change retroactively.
9. **Abandon and restart.** Abandon on day 10, start a new cycle. Old check-ins and reflections still exist in the database; XP carried over; streak restarted at 0.
10. **Completion.** Fast-forward past day 21. Expected: redirect to `/app/complete` with the summary, and `programme.status` is `completed`.

---

## Spec Coverage Check

| Spec section | Covered by |
|---|---|
| 3 Core user journey | Tasks 1, 6, 13, 14, 15, 17, 20 |
| 4 Screens (Landing, Auth, Setup, Today, Areas, Plan, Reflect, Rewards, Account) | Tasks 1, 6, 13–19 |
| 4 UX rules (one job per screen, 3–5 soft recommend, compact status row) | Tasks 13, 15 |
| 5 Duration, daily habits, weekly reflections, one active programme | Tasks 3, 14, 15, 17 |
| 5 Streak day rule | Tasks 10, 15 |
| 6 XP, levels | Tasks 7, 11, 16 |
| 6 Streak + shield | Task 10 |
| 6 Reset points and cosmetic-only spending | Tasks 7, 18 (purchase **and** applying owned themes / coach packs in the UI) |
| 7 Stack, app shape, server-side data access, RLS | Tasks 1, 4, 5, 12 |
| 7 Plan generation from catalogue | Tasks 2, 9, 14 |
| 8 Data model (all 10 entities) | Tasks 2, 3 |
| 9 Area catalogue starter set (19 areas) | Task 4 seed |
| 10 Auth failure retry, optimistic check-in with retry toast, empty reflections, mid-programme edits, abandon/restart | Tasks 6, 16, 17, 19, 21 |
| 11 Unit tests | Tasks 7–11 |
| 11 Integration tests (auth gate, RLS isolation) | Tasks 4, 6 |
| 11 Manual journey | Manual Test Script |
| 11 QA fast-forward, never in production | Tasks 12, 22 |
| 12 Repo and docs layout | Existing repo structure |

---

## Open Decisions

**Resolved 2026-09-08.** All ten recommended defaults are accepted. Decision 6 is upgraded: owned themes and coach-note packs must change what the user sees, not only what they own. Decision 9 stays at the v1 default (owner-writable `progress` under RLS) with the documented hardening path intact.

1. **Product display name.**
   The spec leaves this open (Life Reset, Twenty-One, Reset Coach).
   **Recommended default: "Life Reset".** It matches the repo name, describes the product plainly, and costs nothing to change later since it only appears in `src/app/layout.tsx` metadata and the landing headline.
   **Resolved 2026-09-08: accepted.** Display name is "Life Reset".

2. **Auth method: magic link vs email + password.**
   This plan is written for **email + password**.
   **Recommended default: keep email + password.** It works offline-free in local development, needs no email deliverability setup, and lets the integration tests sign users in programmatically. Magic links would require configuring an SMTP provider before you could test signup at all. Switching later touches only `src/app/login/actions.ts` and `src/app/signup/actions.ts`.
   **Resolved 2026-09-08: accepted.** Email + password.

3. **Email confirmation on sign-up.**
   **Recommended default: turn confirmation OFF** in the Supabase dashboard for v1. This is a private app for one person; requiring a confirmation click adds an SMTP dependency for no security gain. Turn it on if you ever share the URL.
   **Resolved 2026-09-08: accepted.** Confirmation off for v1.

4. **Where content lives: code/JSON vs DB seed.**
   This plan seeds the catalogue via **idempotent SQL migrations** (Task 4).
   **Recommended default: keep the SQL seed.** `on conflict do update` makes it re-runnable, `supabase db reset` reproduces it exactly, and plan generation still takes templates as a parameter so unit tests never touch the database. The alternative — TypeScript content modules plus a seeding script — adds a service-role key dependency and a second source of truth for no benefit at this scale.
   **Resolved 2026-09-08: accepted.** SQL seed.

5. **Exact XP and reset-point amounts.**
   This plan fixes 10/2, 25/5 and 50/15 (see Fixed Values).
   **Recommended default: go with these.** They preserve the required ordering, reach level 7 only on a near-perfect cycle, and make the 390-point reward catalogue take roughly two cycles to complete. All five numbers live in one object in `src/lib/domain/constants.ts` if you want to tune them.
   **Resolved 2026-09-08: accepted.** 10/2, 25/5, 50/15.

6. **Reward catalogue contents.**
   This plan ships two coach note packs, two themes and one finisher badge.
   **Recommended default: go with these five.** Two themes and two note packs give a real choice without building a shop; the badge is the long-term goal.
   **Resolved 2026-09-08: accepted, with an upgrade.** Keep the five-item catalogue. Task 18 must also **wire owned unlocks into rendering**: an owned theme changes the authenticated palette (`data-theme` + CSS tokens); an owned coach-note pack changes coach copy. Most recently unlocked item of each type wins. Purchase/ownership alone is not enough for v1. The finisher badge remains an account mark (Task 19).

7. **Streak shield visibility.**
   The status row currently shows "shielded" as plain text next to the streak.
   **Recommended default: keep it as text.** An icon reads as a second game UI, which the spec's UX rules argue against. Easy to swap later in `src/components/status-row.tsx`.
   **Resolved 2026-09-08: accepted.** Plain text "shielded".

8. **Start date: today vs tomorrow.**
   `confirmStart` sets `start_date` to today, so Day 1 begins immediately.
   **Recommended default: start today.** Momentum matters more than a clean midnight boundary, and a partial day 1 only affects that one day's streak qualification. If you would rather Day 1 began tomorrow, that is a one-line change in `confirmStart`.
   **Resolved 2026-09-08: accepted.** Start today.

9. **Whether `progress` stays owner-writable under RLS.**
   Currently a user can update their own `progress` row directly, which means XP could be forged by hand-crafting a request.
   **Recommended default: accept it for v1.** This is a private single-user app with no adversary. The hardening path is documented: move the three `progress` writes into `SECURITY DEFINER` RPCs alongside `redeem_reward` and drop the `progress_update` policy.
   **Resolved 2026-09-08: accepted at the v1 default.** Owner-writable `progress` stays. Hardening path unchanged: move the three `progress` writes behind `SECURITY DEFINER` RPCs and drop `progress_update` when (if) this is no longer a single-user app.

10. **Timezone changes mid-programme.**
    `programme.timezone` is captured once at setup and never updated.
    **Recommended default: leave it fixed.** A user who travels keeps their original day boundaries, which is the least surprising behaviour for a 21-day count. Re-reading the browser timezone on every load would let a flight silently skip or repeat a day.
    **Resolved 2026-09-08: accepted.** Timezone stays fixed at setup.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-07-life-reset-v1-implementation.md`. Two execution options:

**1. Subagent-Driven (recommended)** — a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints.

Which approach?

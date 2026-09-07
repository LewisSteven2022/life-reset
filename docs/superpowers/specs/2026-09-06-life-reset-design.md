# Life Reset — Design Spec

**Date:** 2026-09-06  
**Status:** Ready for user review  
**Product:** Private web app — 21-day guided life reset  
**Repo:** New private GitHub repository (separate from TJ’s Bake & Browse)

---

## 1. Vision

A minimal, clean web app that helps someone reset chosen areas of their life over **21 days** — framed around the idea that it takes about 21 days to form a new habit. Tone is a **warm coach**: friendly, motivational, with light personality. UX stays calm and easy; engagement hooks reward showing up without shaming misses.

## 2. Goals & non-goals

### Goals (v1)
- Account-required 21-day programme with cross-device sync
- User picks life areas from a catalogue and can add/edit custom areas
- System generates a guided plan; user refines before Day 1; light edits during the programme
- Daily tiny habits + weekly deeper reflections (days 7, 14, 21)
- Soft engagement: XP, streak + shield, reset-points currency for cosmetic unlocks
- Mobile-first, one-job-per-screen UI

### Non-goals (v1)
- Social feed, friends, leaderboards
- Native iOS/Android apps
- AI-generated plans
- Payments / premium unlocks that gate the core programme
- Heavy analytics dashboards
- Admin CMS UI (content seeded in code/JSON or DB seed)
- Push notifications (candidate for later / PWA phase)

## 3. Core user journey

1. **Land** — calm homepage; primary CTA: Start your reset  
2. **Sign up / sign in** — account required before the programme begins  
3. **Choose areas** — pick from a longer catalogue; add/edit custom areas  
4. **Review plan** — generated 21-day plan (habits + weekly reflections); refine before Day 1  
5. **Daily home (Today)** — day number, coach line, habit checklist, compact XP/streak/points, “done for today”  
6. **Weekly reflection** — deeper prompt on days 7, 14, 21  
7. **Complete** — summary of what stuck and what they wrote; option to start another cycle or keep light habits  

## 4. Screens & UX

### Screens
| Screen | Purpose |
|--------|---------|
| Landing | Brand + one CTA |
| Auth | Sign up / sign in |
| Setup wizard | Areas → generated plan → refine → confirm start |
| Today | Primary daily surface |
| Areas | Manage chosen/custom areas |
| Plan | Light 21-day overview |
| Reflect | Weekly journal + past reflections |
| Rewards | Spend reset points on cosmetic/content unlocks |
| Account | Profile, sign out; later: reset history |

### UX rules
- One job per screen; no dashboard clutter
- Soft recommend **3–5 active areas** (guidance, not a hard lock)
- Setup is a short wizard; after Day 1, editing is available but de-emphasised
- Mobile-first web; Today designed for thumb reach
- Coach copy stays supportive on missed days
- XP / streak / points appear as **one compact status row** on Today — not a second game UI
- Rewards is a simple sheet, not a shop mall

### Visual direction
- Minimal, clean, atmospheric (not flat sterile)
- Warm coach microcopy
- Avoid generic “AI SaaS” purple gradients, dense dashboards, and card-heavy heroes

## 5. Programme rules

### Duration
- Fixed **21 days** from programme `start_date`
- Calendar day count: Day 1–21; missed days stay unchecked and do not extend the programme

### Daily habits
- Tiny actions per active area
- Plan is **fully guided** from templates, then **refined before Day 1**
- Mid-programme edits update future days; past check-ins remain history

### Weekly reflections
- Days **7, 14, 21**
- Prompt + free text; empty reflection allowed; can revisit

### Active programme
- **One active programme per user** at a time
- User may abandon and start a new cycle; abandoned programmes kept as history
- Soft-delete / hide removed areas rather than wiping completed days

### Streak day rule (locked)
- A day counts toward the streak when the user completes **at least 50%** of that day’s scheduled habits (rounded up; minimum 1 if any habits exist)
- Weekly reflection completion awards bonus XP/points but is **not** required for the streak that day

## 6. Engagement layer (XP + streak shield + currency)

Philosophy: **reward showing up; never subtract progress for missing.**

### XP
- Earn XP for habit check-ins and weekly reflections
- Quiet level milestones with coach-flavoured titles (e.g. “Level 3 — finding your rhythm”)
- Missed days never subtract XP

### Streaks + shield
- Streak increments when the day rule above is met
- Missing a qualifying day **resets streak to 0**, unless a streak shield is held
- Completing **100% of that day’s habits** awards a **streak shield** if the user does not already hold one
- v1: hold **at most one** shield; on the next miss, the shield is consumed and the streak value is preserved (not incremented)

### Reset points (currency)
- Earn alongside XP for check-ins and reflections (exact amounts set in implementation plan; habit check-in < full-day bonus < weekly reflection)
- Spend only on **cosmetic / content unlocks**: coach note packs, end-of-cycle badges, simple themes
- Core programme is never paywalled; currency cannot buy programme advantage
- v1 reward catalogue ships with a small fixed set (3–6 items); no real-money purchases

## 7. Architecture

### Stack
- **Next.js** (App Router) + TypeScript + Tailwind CSS
- **Supabase** — auth (email magic link and/or email-password) + Postgres + RLS
- **Vercel** — hosting
- Private GitHub repository for source

### App shape
- Public marketing/landing routes
- Authenticated app under `/app` (Today, Areas, Plan, Reflect, Rewards, Account)
- Server-side data access; RLS ensures users only read/write their own data

### Plan generation
- Content catalogue: life areas, habit templates, weekly prompts (structured content, not hard-coded in UI components)
- On setup complete: create `programme` + programme habits (copies of templates after user refinements) + scheduled reflection prompts

### Later candidates
- PWA + push reminders
- Optional AI coach notes
- Multi-cycle history UI polish

## 8. Data model

### Entities
- **User** — Supabase auth identity
- **Area catalogue** — system areas (key, name, description, sort)
- **User area** — selected or custom (`is_custom`, display name, order, active flag)
- **Habit template** — starter habits linked to catalogue areas
- **Programme** — one 21-day cycle (`start_date`, `status`: `setup` | `active` | `completed` | `abandoned`)
- **Programme habit** — concrete habits on this programme (editable copies or custom)
- **Habit check-in** — per calendar day, per programme habit (`completed`, optional note)
- **Reflection** — weekly entries (day 7/14/21): prompt snapshot + user text
- **Progress** — XP total, level, current streak, shield count (0|1), reset points balance
- **Unlock** — owned cosmetic/content unlocks
- **Reward catalogue** — spend targets (cost in reset points, type, payload)

### Integrity notes
- Programme habits are denormalised copies so template updates do not rewrite active programmes
- Check-ins and reflections are append-only history relative to edits
- RLS on all user-owned tables

## 9. Area catalogue (starter set)

v1 ships a longer pick-list (exact copy can be tuned in implementation):

Sleep, Fitness, Nutrition, Hydration, Digital detox, Focus / deep work, Work boundaries, Money basics, Home reset, Declutter, Relationships, Social connection, Mindfulness, Outdoor time, Creative practice, Learning, Self-care, Morning routine, Evening wind-down

Users may add custom areas with their own name and habits.

## 10. Error handling & edge cases

- Auth failures → clear retry path
- Check-in save failures → optimistic UI with retry toast
- Offline → prefer read of last known Today; block destructive edits when unsafe
- Mid-programme area/habit edits → coach acknowledges; future days update
- Empty reflections allowed
- Abandon / restart preserves history

## 11. Testing strategy (v1)

- **Unit:** plan generation from selected areas + pre–Day 1 refinements; streak day qualification; XP/points awards; shield consume-on-miss
- **Integration:** auth gate; RLS isolation (user A cannot read user B)
- **Manual:** full journey; Rewards spend; mid-programme edit; abandon/restart
- **QA aid:** server-only or env-gated fast-forward helper to simulate day progression (never exposed in production UI)

## 12. Repository & delivery

- New **private** GitHub repo (not inside TJ’s Bake & Browse)
- Working title folder/repo name: `life-reset` (final name TBD)
- Design specs live under `docs/superpowers/specs/`
- Implementation plans follow under `docs/superpowers/plans/` after this spec is approved

## 13. Open naming (non-blocking)

Product display name TBD (e.g. Life Reset, Twenty-One, Reset Coach). Does not block architecture.

---

## Decision log

| Decision | Choice |
|----------|--------|
| Format | 21-day guided programme |
| Areas | Catalogue pick-list + add/edit custom |
| Daily shape | Tiny daily habits + weekly reflections |
| Auth | Account required |
| Tone | Warm coach |
| Plan authorship | Guided templates + refine before Day 1; light edits after |
| Approach | Focused guided-reset web app |
| Engagement | XP + streak shield + reset-points cosmetics |
| Streak rule | ≥50% of day’s habits (rounded up) |
| Shield | Earn on 100% day; hold max 1; consume on miss to preserve streak |
| Stack | Next.js + Supabase + Vercel |

# Life Reset

21-day guided life reset — minimal web app.

## Spec

See `docs/superpowers/specs/2026-09-06-life-reset-design.md`

## Running locally

1. `npm install`
2. Copy `.env.local.example` to `.env.local`
3. Point it at the hosted Supabase project `clxotyxqmfvetqkdgzbe` (or local Supabase if Docker is available):

```bash
NEXT_PUBLIC_SUPABASE_URL=https://clxotyxqmfvetqkdgzbe.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<from Project Settings → API Keys>
SUPABASE_SERVICE_ROLE_KEY=<service role / secret key, tests only>
LIFE_RESET_QA_MODE=1
```

Auth dashboard settings for v1: **Email + password**, **Confirm email: OFF**.

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm test                 # unit tests
npm run test:integration # RLS + auth-gate (needs service role key + a production build)
npm run test:e2e         # Playwright core journey (needs publishable key + QA mode)
npm run typecheck
npm run lint
npm run build
```

`LIFE_RESET_QA_MODE=1` enables the day fast-forward bar on `/app` in development only. Never set it on Vercel production. Never put `SUPABASE_SERVICE_ROLE_KEY` in a production Vercel environment.

### Test account

Playwright creates `playwright.reset+<unique>@example.com` through the signup UI. The password lives in gitignored `.env.local` as `PLAYWRIGHT_TEST_PASSWORD`.

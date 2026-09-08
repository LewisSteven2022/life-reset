import { writeFileSync, mkdirSync } from 'node:fs';
import { config as loadEnv } from 'dotenv';
import { test, expect, type Page } from '@playwright/test';
import { allocateInbox, waitForConfirmLink, type Inbox } from './inbox';

loadEnv({ path: '.env.local' });

const password = process.env.PLAYWRIGHT_TEST_PASSWORD || 'Reset-journey-2475!';
const SCREENSHOT_DIR = '/opt/cursor/artifacts/screenshots';

let email = '';

async function shot(page: Page, name: string) {
  for (const dir of [SCREENSHOT_DIR, '/tmp/life-reset-screenshots']) {
    try {
      mkdirSync(dir, { recursive: true });
      await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
      return;
    } catch {
      // Screenshot evidence is best-effort. Never fail the journey on I/O.
    }
  }
}

function pathOf(url: string | URL): string {
  try {
    return (url instanceof URL ? url : new URL(url)).pathname;
  } catch {
    return '';
  }
}

async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => {
    const path = pathOf(url);
    return path === '/app' || path.startsWith('/app/');
  });
}

async function confirmFromInbox(page: Page, inbox: Inbox) {
  const link = await waitForConfirmLink(inbox);
  if (!link) {
    throw new Error(
      `No confirmation email for ${inbox.email}. Confirm email is ON, and the mailer did not deliver.`,
    );
  }
  // Visiting the PKCE redirect_to (localhost) is unnecessary. Confirming the
  // address is enough; we then sign in with the password through the UI.
  await fetch(link, { redirect: 'manual' });
  await signIn(page);
}

async function finishAuth(page: Page, inbox: Inbox | null) {
  try {
    await signIn(page);
    writeFileSync('/tmp/life-reset-qa-email.txt', email);
    return;
  } catch (err) {
    if (!inbox) throw err;
  }
  await confirmFromInbox(page, inbox);
  writeFileSync('/tmp/life-reset-qa-email.txt', email);
}

async function signUp(page: Page) {
  const fromEnv = process.env.PLAYWRIGHT_TEST_EMAIL?.trim();
  let inbox: Inbox | null = null;
  if (fromEnv) {
    email = fromEnv;
  } else {
    inbox = await allocateInbox();
    email = inbox.email;
  }

  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.goto('/signup');
    await page.getByLabel('Email').fill(email);
    await expect(page.getByLabel('Email')).toHaveValue(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Create account' }).click();

    const error = page.locator('form p.text-ember').first();
    const outcome = await Promise.race([
      page.waitForURL((url) => pathOf(url) === '/app/setup', { timeout: 30_000 }).then(() => 'ok' as const),
      page.waitForURL((url) => pathOf(url) === '/login', { timeout: 30_000 }).then(() => 'unconfirmed' as const),
      error.waitFor({ state: 'visible', timeout: 30_000 }).then(async () => (await error.innerText()).trim()),
    ]).catch(() => 'timeout');

    const path = pathOf(page.url());
    if (outcome === 'ok' || path === '/app/setup') {
      writeFileSync('/tmp/life-reset-qa-email.txt', email);
      return;
    }
    if (outcome === 'unconfirmed' || path === '/login' || path === '/app') {
      await finishAuth(page, inbox);
      return;
    }
    if (typeof outcome === 'string' && /already registered|already been registered/i.test(outcome)) {
      await finishAuth(page, inbox);
      return;
    }
    if (typeof outcome === 'string' && /rate limit/i.test(outcome)) {
      const waitMs = 20_000 * (attempt + 1);
      await page.waitForTimeout(waitMs);
      continue;
    }
    throw new Error(`Sign up failed for ${email}: ${outcome} (path ${path})`);
  }
  throw new Error('Sign up exhausted retries (email rate limit)');
}

async function completeToday(page: Page) {
  await page.goto('/app');
  for (let guard = 0; guard < 12; guard += 1) {
    const pending = page.locator('[data-habit-checkin]:not([aria-pressed="true"])');
    if ((await pending.count()) === 0) break;
    await pending.first().click();
    await expect(page.locator('[data-habit-checkin][aria-pressed="true"]').first()).toBeVisible();
    await page.reload();
  }
  await expect(page.locator('[data-habit-checkin]:not([aria-pressed="true"])')).toHaveCount(0);
  if ((await page.locator('[data-habit-checkin]').count()) > 0) {
    await expect(page.getByText(/All of it|The lot of them/i)).toBeVisible();
  }
}

async function jumpDays(page: Page, extra: number) {
  const bar = page.locator('[data-qa-bar]');
  await expect(bar).toBeVisible();
  const label = await bar.locator('span').first().textContent();
  const current = Number((label ?? '').match(/\+(\d+)/)?.[1] ?? 0);
  const res = await page.request.post('/api/qa/fast-forward', {
    data: { offset: current + extra },
  });
  expect(res.ok()).toBeTruthy();
  await page.reload();
}

test.describe.configure({ mode: 'serial' });

test.describe('core journey', () => {
  test.beforeEach(() => {
    test.skip(
      !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      'Needs NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local',
    );
  });

  test('landing page loads', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Reset the parts of your life/i })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Start your reset' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
  });

  test('anonymous visitors are sent to login from /app', async ({ page }) => {
    await page.goto('/app');
    await expect(page).toHaveURL(/\/login/);
  });

  test('sign up, choose areas, start, check in, reflect, rewards, persist', async ({ page }) => {
    test.setTimeout(600_000);
    await signUp(page);
    await page.goto('/app');

    const onAreas = page.getByRole('heading', { name: /Where does your reset start/i });
    if (await onAreas.isVisible().catch(() => false)) {
      await shot(page, 'journey-01-setup-areas');
      await page.getByRole('checkbox', { name: /Sleep/ }).check();
      await page.getByRole('checkbox', { name: /Fitness/ }).check();
      await page.getByRole('checkbox', { name: /Money basics/ }).check();
      if (!(await page.getByText('Your area: Guitar practice').isVisible().catch(() => false))) {
        await page.getByPlaceholder('e.g. Guitar practice').fill('Guitar practice');
        await page.getByRole('button', { name: 'Add your own area' }).click();
        await expect(page.getByText('Your area: Guitar practice')).toBeVisible();
      }
      await page.getByRole('button', { name: 'Build my plan' }).click();
    }

    const generate = page.getByRole('button', { name: 'Generate my plan' });
    if (await generate.isVisible().catch(() => false)) {
      await shot(page, 'journey-02-generate');
      await generate.click();
    }

    const onPlan = page.getByRole('heading', { name: /Here is your 21 days/i });
    if (await onPlan.isVisible().catch(() => false)) {
      await expect(page.getByText('Guitar practice').first()).toBeVisible();
      await shot(page, 'journey-03-plan');
      const firstTitle = page.locator('ul li input[name="title"]').first();
      await firstTitle.fill('Sleep: lights down by ten');
      await page.getByRole('button', { name: 'Save' }).first().click();
      await page.getByRole('button', { name: 'Start day 1 today' }).click();
      await page.waitForURL((url) => pathOf(url) === '/app');
    }

    await expect(page.getByText(/Day \d+ of 21/)).toBeVisible();
    await expect(page.getByText(/XP/)).toBeVisible();
    await completeToday(page);
    await expect(page.getByText(/pts/)).toBeVisible();
    await shot(page, 'journey-04-today-day1');

    await page.getByRole('link', { name: 'Reflect' }).click();
    await expect(page.getByText(/first reflection lands on day 7/i)).toBeVisible();

    await page.getByRole('link', { name: 'Today' }).click();
    await jumpDays(page, 6);
    await expect(page.getByText(/Day 7 of 21/)).toBeVisible();
    await completeToday(page);
    await expect(page.getByRole('link', { name: /reflection/i })).toBeVisible();
    await page.getByRole('link', { name: /reflection/i }).click();
    await expect(page.getByRole('heading', { name: 'Reflect' })).toBeVisible();
    await page.locator('textarea[name="body"]').fill('Week one stuck more than I expected.');
    await page.getByRole('button', { name: 'Save reflection' }).click();
    await expect(page.getByText(/Saved/)).toBeVisible();
    await shot(page, 'journey-05-reflection');

    await page.getByRole('link', { name: 'Today' }).click();
    await completeToday(page);
    await jumpDays(page, 1);
    await completeToday(page);
    await jumpDays(page, 1);
    await completeToday(page);

    await page.getByRole('link', { name: 'Rewards' }).click();
    await expect(page.getByRole('heading', { name: 'Rewards' })).toBeVisible();
    await shot(page, 'journey-06-rewards');
    const grit = page.locator('li', { hasText: 'Grit note pack' });
    await grit.getByRole('button', { name: /40 pts/ }).click();
    await expect(grit.getByText('Yours')).toBeVisible();

    await page.getByRole('link', { name: 'Today' }).click();
    await expect(page.getByText(/Do the easiest one|Nothing ticked yet|All of it|The lot of them|Don't stall/i)).toBeVisible();

    const dawn = page.locator('li', { hasText: 'Dawn theme' });
    await page.getByRole('link', { name: 'Rewards' }).click();
    if (await dawn.getByRole('button', { name: /80 pts/ }).isEnabled()) {
      await dawn.getByRole('button', { name: /80 pts/ }).click();
      await expect(dawn.getByText('Yours')).toBeVisible();
      await page.getByRole('link', { name: 'Today' }).click();
      await expect(page.locator('[data-theme="dawn"]')).toBeVisible();
    }

    await page.getByRole('link', { name: 'Account' }).click();
    await expect(page.getByText(email)).toBeVisible();
    await expect(page.getByText(/Level/)).toBeVisible();
    await shot(page, 'journey-07-account');

    await page.reload();
    await expect(page.getByText(email)).toBeVisible();

    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.waitForURL('/');
    await signIn(page);
    await expect(page.getByText(/Day \d+ of 21/)).toBeVisible();
    await shot(page, 'journey-08-persisted');
  });
});

import { test, expect, type Page } from '@playwright/test';

const password = process.env.PLAYWRIGHT_TEST_PASSWORD ?? 'Reset-journey-2475!';
const email = process.env.PLAYWRIGHT_TEST_EMAIL
  ?? `playwright.reset+${Date.now()}@example.com`;

async function signUp(page: Page) {
  await page.goto('/signup');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL(/\/app(\/setup)?/);
}

async function completeToday(page: Page) {
  await page.goto('/app');
  const buttons = page.locator('ul li button[aria-pressed="false"]');
  const count = await buttons.count();
  for (let i = 0; i < count; i += 1) {
    const button = buttons.nth(i);
    const struck = await button.locator('.line-through').count();
    if (struck === 0) await button.click();
  }
  if (count > 0) {
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
    test.setTimeout(180_000);
    await signUp(page);
    await expect(page).toHaveURL(/\/app\/setup/);
    await expect(page.getByRole('heading', { name: /Where does your reset start/i })).toBeVisible();

    await page.getByRole('checkbox', { name: /Sleep/ }).check();
    await page.getByRole('checkbox', { name: /Fitness/ }).check();
    await page.getByRole('checkbox', { name: /Money basics/ }).check();
    await page.getByPlaceholder('e.g. Guitar practice').fill('Guitar practice');
    await page.getByRole('button', { name: 'Add your own area' }).click();
    await expect(page.getByText('Your area: Guitar practice')).toBeVisible();

    await page.getByRole('button', { name: 'Build my plan' }).click();
    await expect(page.getByRole('button', { name: 'Generate my plan' })).toBeVisible();
    await page.getByRole('button', { name: 'Generate my plan' }).click();
    await expect(page.getByRole('heading', { name: /Here is your 21 days/i })).toBeVisible();
    await expect(page.getByText('Guitar practice').first()).toBeVisible();

    const firstTitle = page.locator('ul li input[name="title"]').first();
    await firstTitle.fill('Sleep: lights down by ten');
    await page.getByRole('button', { name: 'Save' }).first().click();
    await page.getByRole('button', { name: 'Start day 1 today' }).click();

    await page.waitForURL(/\/app$/);
    await expect(page.getByText(/Day 1 of 21/)).toBeVisible();
    await expect(page.getByText(/XP/)).toBeVisible();
    await completeToday(page);
    await expect(page.getByText(/pts/)).toBeVisible();

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

    await page.getByRole('link', { name: 'Today' }).click();
    await completeToday(page);
    await jumpDays(page, 1);
    await completeToday(page);
    await jumpDays(page, 1);
    await completeToday(page);

    await page.getByRole('link', { name: 'Rewards' }).click();
    await expect(page.getByRole('heading', { name: 'Rewards' })).toBeVisible();
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

    await page.reload();
    await expect(page.getByText(email)).toBeVisible();

    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.waitForURL('/');
    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(/\/app/);
    await expect(page.getByText(/Day \d+ of 21/)).toBeVisible();
  });
});

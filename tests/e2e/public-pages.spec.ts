import { test, expect } from '@playwright/test';

test('landing page loads on localhost', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Reset the parts of your life/i })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Start your reset' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
});

test('signup and login pages render', async ({ page }) => {
  await page.goto('/signup');
  await expect(page.getByRole('heading', { name: 'Start your reset' })).toBeVisible();
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();

  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
});

test('anonymous visitors cannot open /app', async ({ page }) => {
  await page.goto('/app');
  await expect(page).toHaveURL(/\/login/);
});

test('auth forms show a clear error without inventing a session', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('nobody@example.com');
  await page.getByLabel('Password').fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText(/did not match|missing its Supabase keys/i)).toBeVisible();
});

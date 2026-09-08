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

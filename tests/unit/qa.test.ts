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

import { describe, it, expect } from 'vitest';
import { coachLineForSetup } from '@/content/coach';

describe('coach copy', () => {
  it('greets without shaming', () => {
    expect(coachLineForSetup()).toMatch(/reset/i);
  });
});

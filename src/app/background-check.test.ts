import { describe, expect, it } from 'vitest';
import type { RateLimits } from '../storage/github-client.ts';
import { backgroundCheck } from './background-check.ts';

const unknown: RateLimits = { remaining: null, resetAt: null, waitUntil: null };
const plenty: RateLimits = { remaining: 4_000, resetAt: 3_600_000, waitUntil: null };

describe('backgroundCheck', () => {
  it('runs when main was never checked, or was checked at least 30 s ago', () => {
    expect(backgroundCheck(1_000, null, unknown)).toBe('run');
    expect(backgroundCheck(31_000, 1_000, plenty)).toBe('run');
  });

  it('skips a check within 30 s of the last one', () => {
    expect(backgroundCheck(30_999, 1_000, plenty)).toBe('too-soon');
  });

  it('pauses below 500 remaining requests until the budget resets', () => {
    const low = { ...plenty, remaining: 499 };
    expect(backgroundCheck(60_000, null, low)).toBe('low-budget');
    expect(backgroundCheck(60_000, null, { ...plenty, remaining: 500 })).toBe('run');
    expect(backgroundCheck(3_600_000, null, low)).toBe('run');
  });

  it('stays paused when the reset time is unknown', () => {
    expect(backgroundCheck(60_000, null, { remaining: 12, resetAt: null, waitUntil: null })).toBe('low-budget');
  });

  it('waits while GitHub asked GitCRM to wait', () => {
    const waiting = { ...plenty, remaining: 499, waitUntil: 90_000 };
    expect(backgroundCheck(89_999, null, waiting)).toBe('wait');
    expect(backgroundCheck(90_000, null, { ...waiting, remaining: 4_000 })).toBe('run');
  });

  it('reports too-soon first, because no check was due anyway', () => {
    expect(backgroundCheck(10_000, 1_000, { remaining: 1, resetAt: null, waitUntil: 90_000 })).toBe('too-soon');
  });
});

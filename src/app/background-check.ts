// When a background check of main may run (docs/04, "Rate limits and reliability"; ADR-023). A
// background check is one the user did not ask for: it runs when a tab gains focus. Page loads,
// Refresh, and saves are not background checks, so this rule never stops them.
import type { RateLimits } from '../storage/github-client.ts';

export const CHECK_INTERVAL_MS = 30_000;
export const LOW_BUDGET = 500; // remaining REST requests

export type CheckDecision = 'run' | 'too-soon' | 'wait' | 'low-budget';

export function backgroundCheck(now: number, lastCheckAt: number | null, limits: RateLimits): CheckDecision {
  if (lastCheckAt !== null && now - lastCheckAt < CHECK_INTERVAL_MS) return 'too-soon';
  if (limits.waitUntil !== null && now < limits.waitUntil) return 'wait';
  // An unknown reset time keeps the pause until a response shows enough requests again.
  if (limits.remaining !== null && limits.remaining < LOW_BUDGET && (limits.resetAt === null || now < limits.resetAt)) return 'low-budget';
  return 'run';
}

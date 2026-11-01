// A record's activity timeline (spec 04): the latest first. Activities at the same moment are
// ordered by ID, so the order never changes between loads.
import type { Activity } from '@/core/schemas.ts';

export const latestFirst = (a: Activity, b: Activity) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt) || (a.id < b.id ? -1 : 1);

export function timeline(activities: Activity[]): Activity[] {
  return activities.toSorted(latestFirst);
}

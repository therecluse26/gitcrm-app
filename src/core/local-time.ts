// Dates and times in the user's time zone (spec 04). Files store a UTC timestamp, or a calendar
// date such as a due date, which means the same day everywhere. Callers pass the clock.
import { isoTimestamp } from './records.ts';

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

// Today's date on the user's calendar, so "overdue" changes at local midnight.
export function localDate(now: Date): string {
  return `${pad(now.getFullYear(), 4)}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// The value for <input type="datetime-local">. Seconds show only when they are not zero.
export function toLocalInput(timestamp: string): string {
  const at = new Date(timestamp);
  const seconds = at.getSeconds() === 0 ? '' : `:${pad(at.getSeconds())}`;
  return `${localDate(at)}T${pad(at.getHours())}:${pad(at.getMinutes())}${seconds}`;
}

// A datetime-local value as a UTC timestamp, or null when it is not a real date and time.
export function fromLocalInput(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) return null;
  const [year, month, day, hours, minutes, seconds] = match.slice(1).map((part) => Number(part ?? 0));
  if (hours > 23 || minutes > 59 || seconds > 59) return null;
  const at = new Date(year, month - 1, day, hours, minutes, seconds);
  // A day such as February 30 rolls over into the next month.
  if (at.getFullYear() !== year || at.getMonth() !== month - 1 || at.getDate() !== day) return null;
  return isoTimestamp(at);
}

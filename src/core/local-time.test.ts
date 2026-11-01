import { afterEach, describe, expect, it, vi } from 'vitest';
import { fromLocalInput, localDate, toLocalInput } from './local-time.ts';

// Node applies a new TZ to Date and Intl at once.
const inZone = (zone: string) => vi.stubEnv('TZ', zone);
afterEach(() => void vi.unstubAllEnvs());

describe('localDate', () => {
  it('is the calendar date where the user is, not in UTC', () => {
    const now = new Date('2026-11-02T03:00:00Z');
    inZone('America/New_York');
    expect(localDate(now)).toBe('2026-11-01');
    inZone('Asia/Tokyo');
    expect(localDate(now)).toBe('2026-11-02');
  });

  it('pads the month and day', () => {
    inZone('UTC');
    expect(localDate(new Date('2026-01-05T12:00:00Z'))).toBe('2026-01-05');
  });
});

describe('fromLocalInput', () => {
  it('reads a datetime-local value as local time and gives a UTC timestamp', () => {
    inZone('America/New_York');
    expect(fromLocalInput('2026-10-26T12:15')).toBe('2026-10-26T16:15:00Z');
    expect(fromLocalInput('2026-11-02T12:15')).toBe('2026-11-02T17:15:00Z'); // after the change to standard time
    inZone('Asia/Tokyo');
    expect(fromLocalInput('2026-10-26T12:15')).toBe('2026-10-26T03:15:00Z');
  });

  it('keeps seconds when the value has them', () => {
    inZone('UTC');
    expect(fromLocalInput('2026-10-26T12:15:30')).toBe('2026-10-26T12:15:30Z');
  });

  it('refuses a value that is not a real local date and time', () => {
    inZone('UTC');
    for (const value of ['', '2026-10-26', '2026-02-30T10:00', '2026-10-26T24:00', '2026-10-26T12:60', '26-10-2026T12:15', '2026-10-26T12:15Z']) {
      expect(fromLocalInput(value), value).toBeNull();
    }
  });
});

describe('toLocalInput', () => {
  it('shows a UTC timestamp as local time, for a datetime-local input', () => {
    inZone('America/New_York');
    expect(toLocalInput('2026-10-26T16:15:00Z')).toBe('2026-10-26T12:15');
    inZone('Asia/Tokyo');
    expect(toLocalInput('2026-10-26T16:15:00Z')).toBe('2026-10-27T01:15');
  });

  it('keeps seconds that are not zero, so an untouched form does not change the time', () => {
    inZone('America/New_York');
    expect(toLocalInput('2026-10-26T16:15:30Z')).toBe('2026-10-26T12:15:30');
    for (const timestamp of ['2026-10-26T16:15:00Z', '2026-10-26T16:15:30Z', '2026-03-08T07:30:00Z']) {
      expect(fromLocalInput(toLocalInput(timestamp))).toBe(timestamp);
    }
  });
});

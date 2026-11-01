import { describe, expect, it } from 'vitest';
import { isNewer } from './version.ts';

describe('isNewer', () => {
  it('compares vMAJOR.MINOR.PATCH with the copy version, number by number', () => {
    expect(isNewer('v0.2.0', '0.1.0')).toBe(true);
    expect(isNewer('v0.10.0', '0.9.3')).toBe(true);
    expect(isNewer('v1.0.0', '0.99.99')).toBe(true);
    expect(isNewer('v0.1.0', '0.1.0')).toBe(false);
    expect(isNewer('v0.1.0', '0.2.0')).toBe(false);
  });

  it('refuses a tag or a version in another form', () => {
    expect(() => isNewer('release-2', '0.1.0')).toThrow('The release tag release-2 is not vMAJOR.MINOR.PATCH');
    expect(() => isNewer('v0.2.0-beta', '0.1.0')).toThrow('The release tag v0.2.0-beta is not vMAJOR.MINOR.PATCH');
    expect(() => isNewer('v0.2.0', 'latest')).toThrow('The version latest in package.json is not MAJOR.MINOR.PATCH');
  });
});

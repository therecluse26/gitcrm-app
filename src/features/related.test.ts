import { describe, expect, it } from 'vitest';
import { parseRelatedKey, readRelated, relatedKey, type RelatedIds } from './related.ts';

const ava = 'd13d0f69-0a4c-4192-9009-9e36a51c42c0';
const gone = '5c1f5f8e-9a3b-4f6e-8d2c-0b7a1e4d3c21';
const ids: RelatedIds = { contact: new Set([ava]), company: new Set(), opportunity: new Set() };

describe('relatedKey and parseRelatedKey', () => {
  it('turn a link into a select value and back', () => {
    expect(relatedKey({ type: 'contact', id: ava })).toBe(`contact:${ava}`);
    expect(relatedKey(null)).toBe('');
    expect(parseRelatedKey(`contact:${ava}`)).toEqual({ type: 'contact', id: ava });
    expect(parseRelatedKey('')).toBeNull();
    expect(parseRelatedKey(`task:${ava}`)).toBeNull();
  });
});

describe('readRelated', () => {
  it('accepts no link, or a link to a record in the workspace', () => {
    expect(readRelated('', ids, null)).toEqual({ related: null });
    expect(readRelated(`contact:${ava}`, ids, null)).toEqual({ related: { type: 'contact', id: ava } });
  });

  it('refuses a record that is not in the workspace, and a value that is not a link', () => {
    expect(readRelated(`contact:${gone}`, ids, null).error).toBe('The chosen record is no longer in the workspace. Choose another one, or none.');
    expect(readRelated(`company:${ava}`, ids, null).error).toBe('The chosen record is no longer in the workspace. Choose another one, or none.');
    expect(readRelated('nonsense', ids, null).error).toBe('Choose a record from the list.');
  });

  it('keeps the current link when its record is missing, so an unrelated edit still saves', () => {
    expect(readRelated(`contact:${gone}`, ids, { type: 'contact', id: gone })).toEqual({ related: { type: 'contact', id: gone } });
  });
});

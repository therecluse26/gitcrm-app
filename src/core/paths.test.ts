import { describe, expect, it } from 'vitest';
import { parseRecordPath, recordPath } from './paths.ts';

const id = 'd13d0f69-0a4c-4192-9009-9e36a51c42c0';

describe('recordPath', () => {
  it('shards by the first two hex characters of the UUID', () => {
    expect(recordPath('contact', id)).toBe(`data/contacts/d1/${id}.json`);
  });

  it('uses the plural folder for every record type', () => {
    expect(recordPath('company', id)).toBe(`data/companies/d1/${id}.json`);
    expect(recordPath('opportunity', id)).toBe(`data/opportunities/d1/${id}.json`);
    expect(recordPath('task', id)).toBe(`data/tasks/d1/${id}.json`);
    expect(recordPath('activity', id)).toBe(`data/activities/d1/${id}.json`);
  });
});

describe('parseRecordPath', () => {
  it('returns the type and ID of a record path', () => {
    expect(parseRecordPath(`data/contacts/d1/${id}.json`)).toEqual({ type: 'contact', id });
    expect(parseRecordPath(`data/activities/d1/${id}.json`)).toEqual({ type: 'activity', id });
  });

  it('rejects paths that break the filename invariant', () => {
    for (const path of [
      `data/contacts/a2/${id}.json`, // wrong shard
      `data/contacts/D1/${id.toUpperCase()}.json`, // not lowercase
      `data/contacts/d1/${id}.txt`,
      `data/contacts/${id}.json`, // no shard folder
      `data/contacts/d1/x/${id}.json`,
      `data/people/d1/${id}.json`,
      'data/contacts/d1/ava-bennett.json',
      '.gitcrm/workspace.json',
      `other/contacts/d1/${id}.json`,
    ]) {
      expect(parseRecordPath(path), path).toBeNull();
    }
  });
});

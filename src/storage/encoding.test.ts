import { describe, expect, it } from 'vitest';
import { base64ToUtf8, gitBlobSha, utf8ToBase64 } from './encoding.ts';

describe('gitBlobSha', () => {
  it('matches git hash-object', async () => {
    expect(await gitBlobSha('hello\n')).toBe('ce013625030ba8dba906f756967f9e9ca394464a');
    expect(await gitBlobSha('')).toBe('e69de29bb2d1d6434b8b29ae775ad8c2e48c5391');
  });

  it('hashes UTF-8 bytes, not UTF-16 code units', async () => {
    // printf 'Zo\xc3\xab\n' | git hash-object --stdin
    expect(await gitBlobSha('Zoë\n')).toBe('7017161889e6b7c901cca628f7be00a9573094a3');
  });
});

describe('Base64', () => {
  it('round-trips non-ASCII text', () => {
    const text = 'Zoë Ångström 😀\n';
    expect(base64ToUtf8(utf8ToBase64(text))).toBe(text);
  });

  it('reads Base64 that GitHub wrapped with newlines', () => {
    const wrapped = utf8ToBase64('x'.repeat(200)).replace(/.{60}/g, '$&\n');
    expect(base64ToUtf8(wrapped)).toBe('x'.repeat(200));
  });

  it('encodes large files without overflowing the call stack', () => {
    const text = 'é'.repeat(200_000);
    expect(base64ToUtf8(utf8ToBase64(text))).toBe(text);
  });
});

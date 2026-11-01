import { describe, expect, it } from 'vitest';
import { checkDeploy } from './check-deploy.ts';
import { HEADERS } from './csp.ts';

const text = (s: string) => new TextEncoder().encode(s);
const site = new URL('https://octo-dev.github.io/gitcrm/');
const build = new Map([
  ['index.html', text('<!doctype html><title>GitCRM</title>')],
  ['assets/index-a1b2c3d4.js', text('console.log(1)')],
  ['assets/geist-latin-wght-normal-a1b2c3d4.woff2', new Uint8Array([0x77, 0x4f, 0x46, 0x32])],
  ['_headers', text(HEADERS)],
]);

// A host that serves `build` the way GitHub Pages does, from a folder and with no custom headers,
// changed by `changes`: a path's body or status. Any other path is a 404.
type Served = { body?: Uint8Array<ArrayBuffer>; status?: number };
function host(changes: Record<string, Served> = {}) {
  const requested: string[] = [];
  const get = async (url: URL | string) => {
    const path = new URL(url).pathname.replace(/^\/gitcrm\//, '');
    requested.push(path);
    const file = path === '' ? 'index.html' : path;
    const change = changes[file] ?? {};
    const body = change.body ?? build.get(file);
    return new Response(body ?? 'Not Found', { status: change.status ?? (body ? 200 : 404) });
  };
  return { get, requested };
}

describe('checkDeploy', () => {
  it('passes a site that serves every built file, byte for byte', async () => {
    const { get, requested } = host();
    expect(await checkDeploy(site, build, get)).toEqual([]);
    expect(requested.toSorted()).toEqual(['', '_headers', 'assets/geist-latin-wght-normal-a1b2c3d4.woff2', 'assets/index-a1b2c3d4.js']);
  });

  it('names a file that differs from the build or is missing, such as an older deployment', async () => {
    const { get } = host({ 'index.html': { body: text('<!doctype html><title>GitCRM</title><!-- old -->') }, 'assets/index-a1b2c3d4.js': { status: 404 } });
    expect(await checkDeploy(site, build, get)).toEqual(['https://octo-dev.github.io/gitcrm/ differs from the build', 'https://octo-dev.github.io/gitcrm/assets/index-a1b2c3d4.js: HTTP 404']);
  });

  // A new site's certificate, or the network, can fail for a moment. The caller tries again.
  it('names a request that fails, such as a TLS handshake, instead of throwing', async () => {
    const { get } = host();
    const failing = async (url: URL) => {
      if (url.pathname.endsWith('.js')) throw new TypeError('fetch failed', { cause: new Error('ssl/tls alert handshake failure') });
      return get(url);
    };
    expect(await checkDeploy(site, build, failing)).toEqual(['https://octo-dev.github.io/gitcrm/assets/index-a1b2c3d4.js: fetch failed (ssl/tls alert handshake failure)']);
  });
});

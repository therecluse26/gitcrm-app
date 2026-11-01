import { describe, expect, it } from 'vitest';
import { appRepo, availableUpdate, latestTag, TEMPLATE } from './update.ts';

const site = (url: string) => new URL(url);

describe('appRepo', () => {
  // ADR-025: a copy runs at <owner>.github.io/<app repo>/.
  it('reads the app repository from a GitHub Pages address', () => {
    expect(appRepo(site('https://octo-dev.github.io/gitcrm/'))).toBe('octo-dev/gitcrm');
    expect(appRepo(site('https://octo-dev.github.io/gitcrm/index.html'))).toBe('octo-dev/gitcrm');
    expect(appRepo(site('https://octo-dev.github.io/'))).toBe('octo-dev/octo-dev.github.io');
  });

  it('finds none on another host', () => {
    expect(appRepo(site('http://localhost:5199/'))).toBeNull();
    expect(appRepo(site('https://crm.example.com/gitcrm/'))).toBeNull();
  });
});

describe('availableUpdate', () => {
  it('offers a newer release, with the copy workflow page and the release notes', () => {
    expect(availableUpdate('v0.4.0', '0.3.0', 'octo-dev/gitcrm')).toEqual({
      tag: 'v0.4.0',
      run: 'https://github.com/octo-dev/gitcrm/actions/workflows/template-update.yml',
      notes: `https://github.com/${TEMPLATE}/releases/tag/v0.4.0`,
    });
  });

  it('offers nothing for the same or an older release, an unknown release, or another host', () => {
    expect(availableUpdate('v0.3.0', '0.3.0', 'octo-dev/gitcrm')).toBeNull();
    expect(availableUpdate('v0.2.0', '0.3.0', 'octo-dev/gitcrm')).toBeNull();
    expect(availableUpdate(null, '0.3.0', 'octo-dev/gitcrm')).toBeNull();
    expect(availableUpdate('v0.4.0', '0.3.0', null)).toBeNull();
  });

  // A tag in another form fails the workflow (spec 11). The app shows nothing.
  it('offers nothing for a tag in another form', () => {
    expect(availableUpdate('nightly', '0.3.0', 'octo-dev/gitcrm')).toBeNull();
  });
});

describe('latestTag', () => {
  it("reads the tag of the template's latest release, with no token", async () => {
    const calls: [string, RequestInit | undefined][] = [];
    const get = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push([String(url), init]);
      return Response.json({ tag_name: 'v0.4.0', name: 'v0.4.0' });
    };
    expect(await latestTag(get)).toBe('v0.4.0');
    expect(calls).toEqual([[`https://api.github.com/repos/${TEMPLATE}/releases/latest`, { headers: { accept: 'application/vnd.github+json' }, credentials: 'omit' }]]);
  });

  it('gives null when GitHub refuses, fails, or answers in another shape', async () => {
    expect(await latestTag(async () => Response.json({ message: 'Not Found' }, { status: 404 }))).toBeNull();
    expect(await latestTag(async () => Promise.reject(new TypeError('Failed to fetch')))).toBeNull();
    expect(await latestTag(async () => Response.json({ tag: 'v1.0.0' }))).toBeNull();
  });
});

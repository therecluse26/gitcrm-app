// Serves a FakeGitHub to the page through Playwright routing; nothing reaches the real GitHub.
// Routing a browser context serves every tab in it from the same fake.
import type { BrowserContext, Page } from '@playwright/test';
import { FakeGitHub, type FakeGitHubOptions } from '../src/test/fake-github.ts';

export async function routeFakeGitHub(target: Page | BrowserContext, options: FakeGitHubOptions = {}): Promise<FakeGitHub> {
  const fake = new FakeGitHub(options);
  await target.route('https://api.github.com/**', async (route) => {
    const request = route.request();
    const response = await fake.handle(
      new Request(request.url(), { method: request.method(), headers: await request.allHeaders(), body: request.postData() ?? undefined }),
    );
    if (response === 'network-error') return route.abort('failed');
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
  });
  return fake;
}

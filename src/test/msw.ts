// Serves a FakeGitHub to fetch in Vitest through MSW. Unhandled requests fail the test.
import { http, HttpResponse } from 'msw/http';
import { setupServer } from 'msw/node';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import { FakeGitHub, type FakeGitHubOptions } from './fake-github.ts';

export function serveFakeGitHub(options: FakeGitHubOptions = {}): () => FakeGitHub {
  let fake = new FakeGitHub(options);
  const server = setupServer(
    http.all('https://api.github.com/*', async ({ request }) => {
      const response = await fake.handle(request);
      return response === 'network-error' ? HttpResponse.error() : response;
    }),
  );
  beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
  beforeEach(() => {
    fake = new FakeGitHub(options);
  });
  afterAll(() => server.close());
  return () => fake;
}

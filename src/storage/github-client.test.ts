import type { JsonBodyType } from 'msw';
import { http, HttpResponse } from 'msw/http';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createGitHubClient, GitHubError, GraphQLBudget } from './github-client.ts';

const token = 'github_pat_secret_value';
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function respond(status: number, body: JsonBodyType, headers: Record<string, string> = {}) {
  server.use(http.all('https://api.github.com/*', () => HttpResponse.json(body, { status, headers })));
}

async function errorOf(promise: Promise<unknown>): Promise<GitHubError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof GitHubError) return error;
    throw error;
  }
  throw new Error('expected a GitHubError');
}

describe('rest', () => {
  it('sends the token, the API version, and a JSON body', async () => {
    let seen: Request | undefined;
    server.use(
      http.put('https://api.github.com/repos/o/r/contents/a.json', async ({ request }) => {
        seen = request.clone();
        return HttpResponse.json({ ok: true }, { status: 201 });
      }),
    );
    const result = await createGitHubClient(token).rest('PUT', '/repos/o/r/contents/a.json', { message: 'm' });
    expect(result).toEqual({ ok: true });
    expect(seen!.headers.get('authorization')).toBe(`Bearer ${token}`);
    expect(seen!.headers.get('accept')).toBe('application/vnd.github+json');
    expect(seen!.headers.get('x-github-api-version')).toBe('2022-11-28');
    expect(await seen!.json()).toEqual({ message: 'm' });
  });

  it.each([
    [401, { message: 'Bad credentials' }, {}, 'unauthorized'],
    [403, { message: 'Repository was archived so is read-only.' }, {}, 'forbidden'],
    [403, { message: 'API rate limit exceeded' }, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '0' }, 'rate-limited'],
    [403, { message: 'You have exceeded a secondary rate limit' }, { 'retry-after': '60' }, 'rate-limited'],
    [429, { message: 'Too many requests' }, {}, 'rate-limited'],
    [404, { message: 'Not Found' }, {}, 'not-found'],
    [409, { message: 'a.json does not match abc' }, {}, 'conflict'],
    [422, { message: 'Update is not a fast forward' }, {}, 'unprocessable'],
    [502, { message: 'Server Error' }, {}, 'server'],
  ] as const)('maps %i %j to %s', async (status, body, headers, kind) => {
    respond(status, body, headers);
    const error = await errorOf(createGitHubClient(token).rest('GET', '/repos/o/r'));
    expect(error.kind).toBe(kind);
    expect(error.status).toBe(status);
    expect(error.githubMessage).toBe(body.message);
  });

  it('reads the wait from retry-after', async () => {
    respond(429, { message: 'slow down' }, { 'retry-after': '42' });
    expect((await errorOf(createGitHubClient(token).rest('GET', '/user'))).retryAfterSeconds).toBe(42);
  });

  it('reads the wait from x-ratelimit-reset when the hourly budget is gone', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-28T12:00:00Z'), toFake: ['Date'] });
    const reset = String(Date.parse('2026-10-28T12:10:00Z') / 1000);
    respond(403, { message: 'API rate limit exceeded' }, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': reset });
    expect((await errorOf(createGitHubClient(token).rest('GET', '/user'))).retryAfterSeconds).toBe(600);
    vi.useRealTimers();
  });

  it('waits one minute when GitHub gives no wait', async () => {
    respond(429, { message: 'Too many requests' });
    expect((await errorOf(createGitHubClient(token).rest('GET', '/user'))).retryAfterSeconds).toBe(60);
  });

  it('reports a network failure without a status', async () => {
    server.use(http.all('https://api.github.com/*', () => HttpResponse.error()));
    const error = await errorOf(createGitHubClient(token).rest('GET', '/user'));
    expect(error.kind).toBe('network');
    expect(error.status).toBeNull();
  });

  it('never puts the token in an error', async () => {
    const logged = vi.spyOn(console, 'error');
    for (const status of [401, 403, 404, 500]) {
      respond(status, { message: 'x' });
      const error = await errorOf(createGitHubClient(token).rest('GET', '/repos/o/r'));
      expect(`${error.message} ${error.stack} ${JSON.stringify(error)}`).not.toContain(token);
    }
    expect(logged).not.toHaveBeenCalled();
  });
});

describe('rate limits (ADR-023)', () => {
  afterEach(() => vi.useRealTimers());

  it('reads the REST budget from every REST response, errors too', async () => {
    const client = createGitHubClient(token);
    expect(client.limits()).toEqual({ remaining: null, resetAt: null, waitUntil: null });
    respond(200, {}, { 'x-ratelimit-remaining': '499', 'x-ratelimit-reset': '1793361600' });
    await client.rest('GET', '/user');
    expect(client.limits()).toEqual({ remaining: 499, resetAt: 1_793_361_600_000, waitUntil: null });
    respond(404, { message: 'Not Found' }, { 'x-ratelimit-remaining': '498' });
    await errorOf(client.rest('GET', '/repos/o/r'));
    expect(client.limits().remaining).toBe(498);
  });

  it('ignores the GraphQL budget, which GitHub counts apart from REST', async () => {
    const client = createGitHubClient(token);
    respond(200, { data: {} }, { 'x-ratelimit-remaining': '10', 'x-ratelimit-reset': '1793361600' });
    await client.graphql('query { x }', {});
    expect(client.limits()).toEqual({ remaining: null, resetAt: null, waitUntil: null });
  });

  it('after retry-after, sends nothing, REST or GraphQL, until the wait is over', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-28T12:00:00Z'), toFake: ['Date'] });
    let sent = 0;
    server.use(
      http.all('https://api.github.com/*', () => {
        sent += 1;
        return sent === 1 ? HttpResponse.json({ message: 'slow down' }, { status: 429, headers: { 'retry-after': '60' } }) : HttpResponse.json({ data: {} });
      }),
    );
    const client = createGitHubClient(token);
    await errorOf(client.rest('GET', '/user'));
    expect(client.limits().waitUntil).toBe(Date.parse('2026-10-28T12:01:00Z'));

    vi.setSystemTime(new Date('2026-10-28T12:00:59Z'));
    const early = await errorOf(client.rest('GET', '/user'));
    expect(early).toMatchObject({ kind: 'rate-limited', status: null, retryAfterSeconds: 1 });
    expect((await errorOf(client.graphql('query { x }', {}))).kind).toBe('rate-limited');
    expect(sent).toBe(1);

    vi.setSystemTime(new Date('2026-10-28T12:01:00Z'));
    await client.rest('GET', '/user');
    expect(sent).toBe(2);
  });

  it('when the hourly budget is gone, sends nothing until x-ratelimit-reset', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-28T12:00:00Z'), toFake: ['Date'] });
    const reset = String(Date.parse('2026-10-28T12:10:00Z') / 1000);
    respond(403, { message: 'API rate limit exceeded' }, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': reset });
    const client = createGitHubClient(token);
    await errorOf(client.rest('GET', '/user'));
    expect(client.limits().waitUntil).toBe(Date.parse('2026-10-28T12:10:00Z'));
  });
});

describe('graphql', () => {
  it('returns data', async () => {
    respond(200, { data: { repository: { d0: null } } });
    expect(await createGitHubClient(token).graphql('query { x }', {})).toEqual({ repository: { d0: null } });
  });

  it('turns GraphQL errors into errors', async () => {
    respond(200, { data: null, errors: [{ type: 'NOT_FOUND', message: 'Could not resolve' }] });
    expect((await errorOf(createGitHubClient(token).graphql('query { x }', {}))).kind).toBe('unprocessable');
    respond(200, { data: null, errors: [{ type: 'RATE_LIMITED', message: 'API rate limit exceeded' }] });
    expect((await errorOf(createGitHubClient(token).graphql('query { x }', {}))).kind).toBe('rate-limited');
  });

  it('maps HTTP errors like REST', async () => {
    respond(502, { message: 'Server Error' });
    const error = await errorOf(createGitHubClient(token).graphql('query { x }', {}));
    expect(error.kind).toBe('server');
    expect(error.status).toBe(502);
  });
});

describe('GraphQLBudget', () => {
  it('allows queries while under 50 s of response time per rolling minute', () => {
    const budget = new GraphQLBudget();
    budget.record(0, 30_000);
    budget.record(1_000, 19_000);
    expect(budget.waitMs(2_000)).toBe(0);
  });

  it('waits until enough time leaves the window', () => {
    const budget = new GraphQLBudget();
    budget.record(0, 30_000);
    budget.record(10_000, 25_000);
    // 55 s spent; the first entry leaves the window at 60 s, leaving 25 s.
    expect(budget.waitMs(20_000)).toBe(40_000);
    expect(budget.waitMs(60_001)).toBe(0);
  });
});

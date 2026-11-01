// A plain typed fetch client for GitHub REST and GraphQL (ADR-012). It maps every failure to a
// GitHubError kind (docs/04) and never retries on its own. After GitHub asks it to wait, it sends
// nothing until the wait is over (ADR-023).

const API = 'https://api.github.com';

export type GitHubErrorKind = 'unauthorized' | 'forbidden' | 'not-found' | 'conflict' | 'unprocessable' | 'rate-limited' | 'server' | 'network';

const KINDS: Partial<Record<number, GitHubErrorKind>> = { 401: 'unauthorized', 403: 'forbidden', 404: 'not-found', 409: 'conflict', 422: 'unprocessable' };

// `request` holds the method and path only: never the token, other headers, or a body.
export class GitHubError extends Error {
  readonly kind: GitHubErrorKind;
  readonly status: number | null;
  readonly request: string;
  readonly githubMessage: string | null;
  readonly retryAfterSeconds: number | null;

  constructor(kind: GitHubErrorKind, status: number | null, request: string, githubMessage: string | null = null, retryAfterSeconds: number | null = null) {
    super(`${request}: ${status ?? 'no response'}${githubMessage ? ` ${githubMessage}` : ''}`);
    this.name = 'GitHubError';
    this.kind = kind;
    this.status = status;
    this.request = request;
    this.githubMessage = githubMessage;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

// GitHub allows 60 s of GraphQL server time per minute, estimated from response time. GitCRM
// keeps the summed response time under 50 s per rolling minute and waits when it is over (ADR-022).
export class GraphQLBudget {
  private spent: { at: number; ms: number }[] = [];
  private readonly limitMs: number;
  private readonly windowMs: number;

  constructor(limitMs = 50_000, windowMs = 60_000) {
    this.limitMs = limitMs;
    this.windowMs = windowMs;
  }

  record(at: number, ms: number): void {
    this.spent.push({ at, ms });
  }

  // How long to wait before the next query.
  waitMs(now: number): number {
    this.spent = this.spent.filter((entry) => entry.at > now - this.windowMs).sort((a, b) => a.at - b.at);
    let total = this.spent.reduce((sum, entry) => sum + entry.ms, 0);
    let wait = 0;
    for (const entry of this.spent) {
      if (total < this.limitMs) break;
      total -= entry.ms;
      wait = entry.at + this.windowMs - now;
    }
    return wait;
  }
}

// Times are ms since the epoch. `remaining` and `resetAt` come from the last REST response
// (GraphQL has its own budget); `waitUntil` from a rate-limit error.
export type RateLimits = { remaining: number | null; resetAt: number | null; waitUntil: number | null };

export type GitHubClient = {
  rest<T>(method: string, path: string, body?: unknown): Promise<T>;
  graphql<T>(query: string, variables: Record<string, unknown>): Promise<T>;
  limits(): RateLimits;
};

export function createGitHubClient(token: string): GitHubClient {
  const budget = new GraphQLBudget();
  const limits: RateLimits = { remaining: null, resetAt: null, waitUntil: null };

  async function send(method: string, path: string, body: unknown): Promise<{ status: number; text: string }> {
    const request = `${method} ${path}`;
    const waitMs = (limits.waitUntil ?? 0) - Date.now();
    if (waitMs > 0) throw new GitHubError('rate-limited', null, request, null, Math.ceil(waitMs / 1000));
    let response: Response;
    let text: string;
    try {
      response = await fetch(`${API}${path}`, {
        method,
        // GitHub lets browsers cache GETs for 60 s; a cached ref or file would hide other people's saves.
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(body !== undefined && { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      text = await response.text();
    } catch {
      throw new GitHubError('network', null, request);
    }
    if (path !== '/graphql') {
      const remaining = response.headers.get('x-ratelimit-remaining');
      const reset = response.headers.get('x-ratelimit-reset');
      if (remaining !== null) limits.remaining = Number(remaining);
      if (reset !== null) limits.resetAt = Number(reset) * 1000;
    }
    if (!response.ok) {
      const error = errorFor(response, text, request);
      if (error.retryAfterSeconds !== null) limits.waitUntil = Date.now() + error.retryAfterSeconds * 1000;
      throw error;
    }
    return { status: response.status, text };
  }

  return {
    async rest<T>(method: string, path: string, body?: unknown): Promise<T> {
      const { text } = await send(method, path, body);
      return (text ? JSON.parse(text) : null) as T;
    },

    async graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
      await sleep(budget.waitMs(performance.now()));
      const started = performance.now();
      try {
        const { status, text } = await send('POST', '/graphql', { query, variables });
        const result = JSON.parse(text) as { data: T; errors?: { type?: string; message: string }[] };
        const first = result.errors?.[0];
        if (first) throw new GitHubError(first.type === 'RATE_LIMITED' ? 'rate-limited' : 'unprocessable', status, 'POST /graphql', first.message);
        return result.data;
      } finally {
        budget.record(performance.now(), performance.now() - started);
      }
    },

    limits: () => ({ ...limits }),
  };
}

function errorFor(response: Response, text: string, request: string): GitHubError {
  let message: string | null = null;
  try {
    message = JSON.parse(text).message ?? null;
  } catch {
    // Not JSON, for example an HTML error page.
  }
  const retryAfter = response.headers.get('retry-after');
  const reset = response.headers.get('x-ratelimit-reset');
  const limited = response.status === 429 || (response.status === 403 && (retryAfter !== null || response.headers.get('x-ratelimit-remaining') === '0'));
  if (limited) {
    const seconds = retryAfter !== null ? Number(retryAfter) : reset !== null ? Math.max(0, Number(reset) - Math.floor(Date.now() / 1000)) : null;
    // GitHub's REST rate-limit docs: with neither header, "wait for at least one minute before retrying".
    return new GitHubError('rate-limited', response.status, request, message, seconds !== null && Number.isFinite(seconds) ? seconds : 60);
  }
  const kind = KINDS[response.status] ?? (response.status >= 500 ? 'server' : 'unprocessable');
  return new GitHubError(kind, response.status, request, message);
}

function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

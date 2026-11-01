// The PAT and the repo name, kept in localStorage until Disconnect (ADR-017). This key is the
// only browser storage that holds the token; it never goes into cookies, URLs, or logs.
const KEY = 'gitcrm.connection';

export type SavedConnection = { owner: string; repo: string; token: string };

export function readSavedConnection(): SavedConnection | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (value && typeof value === 'object') {
      const { owner, repo, token } = value as Record<string, unknown>;
      if (typeof owner === 'string' && typeof repo === 'string' && typeof token === 'string') return { owner, repo, token };
    }
  } catch {
    // Blocked storage or a damaged entry: start from the connect screen.
  }
  return null;
}

export function saveConnection(connection: SavedConnection): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(connection));
  } catch {
    // Blocked storage: the token then lasts only for this tab.
  }
}

export function forgetConnection(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Blocked storage held nothing.
  }
}

// One syncing tab per workspace (ADR-023). The tab that holds a Web Lock runs the background
// checks of main; the other tabs ask it over a BroadcastChannel and show what it found. The
// browser releases the lock when that tab closes, so another tab takes over. Messages stay in
// this browser, between tabs of this origin; the token is never in one.
import type { SnapshotFiles } from '../storage/snapshot.ts';

// The checking tab answers every request, also when it skips the check. Without an answer in
// this time, as while it closes or after the browser froze it, the asking tab checks main itself.
export const ANSWER_TIMEOUT_MS = 5_000;

export type TabMessage =
  | { type: 'check' } // a tab gained focus
  | { type: 'checked'; files: SnapshotFiles | null; paused: boolean } // files: null when main has not moved
  | { type: 'disconnected' }; // every tab of the workspace leaves it (spec 01, "Disconnect")

export type Tabs = {
  key: string;
  leading(): boolean;
  ask(unanswered: () => void): void; // sends 'check'
  send(message: TabMessage): void;
  close(): void;
};

export function joinTabs(key: string, onMessage: (message: TabMessage) => void): Tabs {
  const name = `gitcrm-sync:${key}`;
  const channel = new BroadcastChannel(name);
  let waiting: ReturnType<typeof setTimeout> | undefined;
  channel.onmessage = (event: MessageEvent<TabMessage>) => {
    if (event.data.type === 'checked') {
      clearTimeout(waiting);
      waiting = undefined;
    }
    onMessage(event.data);
  };
  const left = new AbortController();
  let leading = false;
  if ('locks' in navigator) {
    navigator.locks
      .request(name, { signal: left.signal }, () => {
        leading = true;
        return new Promise<void>((release) => left.signal.addEventListener('abort', () => release()));
      })
      .catch(() => {}); // this tab left before it got the lock
  } else {
    leading = true; // without Web Locks (an insecure context), every tab checks for itself
  }

  return {
    key,
    leading: () => leading,
    ask(unanswered) {
      if (waiting !== undefined) return;
      channel.postMessage({ type: 'check' } satisfies TabMessage);
      waiting = setTimeout(() => {
        waiting = undefined;
        unanswered();
      }, ANSWER_TIMEOUT_MS);
    },
    send: (message) => channel.postMessage(message),
    close() {
      clearTimeout(waiting);
      leading = false;
      left.abort();
      channel.close();
    },
  };
}

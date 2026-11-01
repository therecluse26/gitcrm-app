// docs/06, "Measured in the browser": times the built app against the fake GitHub, so each number
// is the app's own time. GitHub's time comes from spikes S-02 and S-04. Opt-in, one worker:
//   BENCH=1 npx playwright test --project bench
// BENCH_CPU=4 makes the CPU 4 times slower, like a modest laptop. BENCH_URL=https://<owner>.github.io/<repo>/
// times a deployed copy, and BENCH_NETWORK=1 adds a slow 4G network (150 ms, 1.6 Mbit/s down).
// Playwright turns off the HTTP cache while a route is on. So with BENCH_NETWORK, the warm page load
// runs with no route and api.github.com blocked, and the run stops there: the later steps use only
// the fake GitHub, which the slow network does not slow down.
import type { Locator } from '@playwright/test';
import { recordPath } from '../src/core/paths.ts';
import type { CRMRecord } from '../src/core/schemas.ts';
import { expect, test, type Page } from './fixtures.ts';
import { routeFakeGitHub } from './fake-route.ts';
import { activity, company, contact, field, opportunity, seedWorkspace, task } from './workspace.ts';

const SIZES = [100, 500, 2000];
const RUNS = 5;
const STAGES = ['lead', 'qualified', 'proposal', 'won', 'lost'];
const NOTE = 'Talked through the renewal and the new seats. '.repeat(8).slice(0, 380);

// The mix from the export measurement: 15% companies, 30% contacts, 10% opportunities, 25% tasks,
// and 20% activities with notes of about 380 characters.
function dataset(size: number): CRMRecord[] {
  const companies = Array.from({ length: size * 0.15 }, (_, i) => company(`Company ${i}`, { website: `https://c${i}.example` }));
  const contacts = Array.from({ length: size * 0.3 }, (_, i) =>
    contact(`Person ${i}`, { companyId: companies[i % companies.length].id, emails: [`p${i}@c${i % companies.length}.example`], phones: ['555-0100'] }),
  );
  const related = (i: number) => ({ type: 'contact' as const, id: contacts[i % contacts.length].id });
  return [
    ...companies,
    ...contacts,
    ...Array.from({ length: size * 0.1 }, (_, i) => opportunity(`Deal ${i}`, STAGES[i % STAGES.length], { companyId: companies[i % companies.length].id, valueMinor: 100000 + i })),
    ...Array.from({ length: size * 0.25 }, (_, i) => task(`Follow up ${i}`, { dueDate: `2026-11-${String((i % 28) + 1).padStart(2, '0')}`, related: related(i) })),
    ...Array.from({ length: size * 0.2 }, (_, i) => activity(`${NOTE} (${i})`, { related: related(i) })),
  ];
}

type Drawn = { __drawn: Record<string, Promise<number>> };

// Runs in the page from its first script. For each [name, selector, text], `window.__drawn[name]`
// resolves with the time since the page started loading, at the first frame after an element that
// matches `selector` contains `text`.
function watchPage(watches: [string, string, string][]) {
  (window as unknown as Drawn).__drawn = Object.fromEntries(
    watches.map(([name, selector, text]) => [
      name,
      new Promise<number>((resolve) => {
        const observer = new MutationObserver(() => {
          if (![...document.querySelectorAll(selector)].some((node) => node.textContent?.includes(text))) return;
          observer.disconnect();
          requestAnimationFrame(() => setTimeout(() => resolve(performance.now())));
        });
        observer.observe(document, { subtree: true, childList: true, characterData: true });
      }),
    ]),
  );
}

const drawn = (page: Page, name: string) => page.evaluate((name) => (window as unknown as Drawn).__drawn[name], name);

// The bytes that this page load got from the app's host. A file from the HTTP cache counts 0.
const hostBytes = (page: Page) =>
  page.evaluate(() =>
    [...performance.getEntriesByType('navigation'), ...performance.getEntriesByType('resource')]
      .filter(({ name }) => name.startsWith(location.origin))
      .reduce((sum, entry) => sum + (entry as PerformanceResourceTiming).transferSize, 0),
  );

// Clicks `target` in the page, and returns the time until the first frame after an element that
// matches `selector` contains `text`. With `gone`, until no such element is left.
async function timeClick(target: Locator, selector: string, text: string, gone = false): Promise<number> {
  return target.evaluate(
    (element, { selector, text, gone }) =>
      new Promise<number>((resolve) => {
        const start = performance.now();
        const observer = new MutationObserver(() => {
          if ([...document.querySelectorAll(selector)].some((node) => node.textContent?.includes(text)) === gone) return;
          observer.disconnect();
          requestAnimationFrame(() => setTimeout(() => resolve(performance.now() - start)));
        });
        observer.observe(document, { subtree: true, childList: true, characterData: true });
        (element as HTMLElement).click();
      }),
    { selector, text, gone },
  );
}

async function slowDown(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  if (process.env.BENCH_CPU) await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.BENCH_CPU) });
  if (process.env.BENCH_NETWORK) {
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 0.75e6 / 8 });
  }
  return cdp;
}

const results = new Map<string, number[]>();
const keep = (name: string, value: number) => results.set(name, [...(results.get(name) ?? []), Math.round(value)]);

test.describe.configure({ mode: 'serial' });

for (const size of SIZES) {
  for (let run = 1; run <= RUNS; run++) {
    test(`${size} records, run ${run}`, async ({ page }) => {
      test.setTimeout(120_000);
      const records = dataset(size);
      const counts = `Contacts${records.filter(({ type }) => type === 'contact').length}`;
      const cdp = await slowDown(page);
      await page.addInitScript(watchPage, [
        ['connect', 'h1', 'Connect GitCRM'],
        ['counts', 'section[aria-label="Active records"]', counts],
      ] satisfies [string, string, string][]);
      const fake = await routeFakeGitHub(page);
      await seedWorkspace(fake, records);

      await page.goto('./');
      keep(`${size}: Connect screen on a new device`, await drawn(page, 'connect'));
      keep(`${size}: bytes from the host on a new device (KB)`, (await hostBytes(page)) / 1000);
      await field(page, 'Repository').fill(`${fake.owner}/${fake.repo}`);
      await field(page, 'Fine-grained personal access token').fill(fake.token);
      keep(`${size}: first load on a new device, from Connect`, await timeClick(page.getByRole('button', { name: 'Connect' }), 'section[aria-label="Active records"]', counts));
      await cdp.send('HeapProfiler.collectGarbage');
      keep(`${size}: JavaScript heap after the first load (MB)`, (await cdp.send('Runtime.getHeapUsage')).usedSize / 1e6);

      if (process.env.BENCH_NETWORK) {
        await page.unrouteAll();
        await cdp.send('Network.setBlockedURLs', { urls: ['https://api.github.com/*'] });
        await page.reload(); // fills the HTTP cache
        await drawn(page, 'counts');
      }
      await page.reload();
      keep(`${size}: page load with a warm cache`, await drawn(page, 'counts'));
      if (process.env.BENCH_NETWORK) {
        keep(`${size}: bytes from the host with a warm cache (KB)`, (await hostBytes(page)) / 1000);
        return;
      }

      const nav = page.getByRole('navigation', { name: 'Main' });
      for (const name of ['Contacts', 'Tasks', 'Pipeline']) {
        keep(`${size}: open ${name}`, await timeClick(nav.getByRole('link', { name, exact: true }), 'h1', name));
      }

      const person = records.find(({ type }) => type === 'contact')!;
      await page.evaluate((hash) => (location.hash = hash), `#/contacts/${person.id}/edit`);
      await field(page, 'Phone 1').fill(`555-01${run}${run}`);
      keep(`${size}: save one contact`, await timeClick(page.getByRole('button', { name: 'Save contact' }), 'header [role="status"]', 'Saved'));
      await expect(page.getByRole('banner').getByRole('status')).toHaveText(/Saved/);

      // A save from the longest list: the task leaves the open tasks when its commit is in.
      await nav.getByRole('link', { name: 'Tasks', exact: true }).click();
      keep(`${size}: complete one task on Tasks`, await timeClick(page.getByRole('checkbox', { name: 'Complete Follow up 0', exact: true }), '[aria-label="Complete Follow up 0"]', '', true));
      const first = records.find(({ type }) => type === 'task')!;
      expect(JSON.parse(fake.file(recordPath('task', first.id))!)).toMatchObject({ completedAt: expect.any(String) });

      const taskPages = page.getByRole('navigation', { name: 'Tasks pages' });
      if ((await taskPages.count()) > 0) {
        keep(`${size}: next page on Tasks`, await timeClick(taskPages.getByRole('button', { name: 'Next page' }), 'nav[aria-label="Tasks pages"]', 'Page 2 of'));
      }
    });
  }
}

test.afterAll(() => {
  const median = (values: number[]) => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)];
  const setting = [process.env.BENCH_URL ?? 'local preview', process.env.BENCH_CPU && `CPU ${process.env.BENCH_CPU}x slower`, process.env.BENCH_NETWORK && 'slow 4G'].filter(Boolean).join(', ');
  console.log(`\nBench (${setting}), median and range of ${RUNS} runs, in ms unless named:`);
  for (const [name, values] of results) console.log(`  ${name}: ${median(values)} (${Math.min(...values)}–${Math.max(...values)})`);
});

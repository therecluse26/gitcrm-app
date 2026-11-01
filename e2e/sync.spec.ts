// Background checks of main and the rate-limit guard (docs/04, spec 07, ADR-023), against the fake
// GitHub. The page clock is fake, so a test can move it past the 30 s between checks.
import { recordPath } from '../src/core/paths.ts';
import { serializeRecord } from '../src/core/record-file.ts';
import type { Contact } from '../src/core/schemas.ts';
import type { FakeGitHub } from '../src/test/fake-github.ts';
import { expect, test, type BrowserContext, type Page } from './fixtures.ts';
import { connect } from './connect-page.ts';
import { routeFakeGitHub } from './fake-route.ts';
import { contact, field, go, homeHeading, open, openContact, seedWorkspace, status } from './workspace.ts';

const REF = /\/git\/ref\/heads\//;
const checks = (fake: FakeGitHub) => fake.count('GET', REF);
// What the browser sends when the user comes back to the tab.
const focus = (page: Page) => page.evaluate(() => window.dispatchEvent(new Event('focus')));
const contactNames = (page: Page) => page.getByRole('list', { name: 'Contacts' }).getByRole('link');
const refresh = (page: Page) => page.getByRole('button', { name: 'Refresh' }).click();
const pausedNotice = (page: Page) => page.getByText('Automatic checks for changes are paused');
const slowDown = (page: Page) => page.getByText('GitHub asked GitCRM to slow down. Try again in 1 min.');

// Another user renames the contact on GitHub.
const renameOnGitHub = (fake: FakeGitHub, record: Contact, name: string) =>
  fake.seed(recordPath('contact', record.id), serializeRecord({ ...record, name, updatedAt: '2026-10-29T13:00:00Z' }));

// `count` tabs on the contact list. The first connects; the others use the remembered token.
async function openTabs(context: BrowserContext, ava: Contact, count: number) {
  await context.clock.install();
  const fake = await routeFakeGitHub(context);
  await seedWorkspace(fake, [ava]);
  const tabs: Page[] = [];
  for (let i = 0; i < count; i++) {
    const tab = await context.newPage();
    if (i === 0) await connect(tab, fake);
    else await tab.goto('/');
    await expect(homeHeading(tab)).toBeVisible();
    await expect(status(tab)).toHaveText('Up to date');
    await go(tab, 'Contacts');
    tabs.push(tab);
  }
  return { fake, tabs };
}

test('a focus check shows another user’s change, at most once every 30 seconds', async ({ page }) => {
  await page.clock.install();
  const ava = contact('Ava Bennett');
  const fake = await open(page, [ava]);
  await go(page, 'Contacts');
  await renameOnGitHub(fake, ava, 'Ava Bennett-Cole');

  const atLoad = checks(fake);
  await focus(page);
  await page.waitForTimeout(300);
  expect(checks(fake)).toBe(atLoad);
  await expect(contactNames(page)).toHaveText(['Ava Bennett']);

  await page.clock.fastForward('00:31');
  await focus(page);
  await expect(contactNames(page)).toHaveText(['Ava Bennett-Cole']);
  expect(checks(fake)).toBe(atLoad + 1);
});

test('a focus check costs one request when main has not moved', async ({ page }) => {
  await page.clock.install();
  const fake = await open(page, [contact('Ava Bennett')]);
  const sent = fake.requests.length;
  await page.clock.fastForward('00:31');
  await focus(page);
  await expect.poll(() => fake.requests.length).toBe(sent + 1);
  expect(fake.requests.at(-1)).toMatchObject({ method: 'GET', path: expect.stringMatching(REF) });
  await page.waitForTimeout(300);
  expect(fake.requests.length).toBe(sent + 1);
});

test('below 500 remaining requests, focus checks pause with a quiet notice; Refresh and saves still work', async ({ page }) => {
  await page.clock.install();
  const fake = await open(page, [contact('Ava Bennett')]);
  fake.rateRemaining = 499;
  const sent = checks(fake);
  await refresh(page);
  await expect.poll(() => checks(fake)).toBe(sent + 1);
  await expect(status(page)).toHaveText('Up to date');

  await page.clock.fastForward('00:31');
  await focus(page);
  await expect(pausedNotice(page)).toBeVisible();
  expect(checks(fake)).toBe(sent + 1);

  await refresh(page);
  await expect.poll(() => checks(fake)).toBe(sent + 2);
  await openContact(page, 'Ava Bennett');
  await page.getByRole('link', { name: 'Edit' }).click();
  await field(page, 'Name').fill('Ava Cole');
  await page.getByRole('button', { name: 'Save contact' }).click();
  await expect(status(page)).toHaveText('Saved · View commit');

  // The budget is back: the next focus check runs, and the notice goes away.
  fake.rateRemaining = 4999;
  await refresh(page);
  await expect.poll(() => checks(fake)).toBe(sent + 3);
  await expect(status(page)).toHaveText('Up to date');
  await page.clock.fastForward('00:31');
  await focus(page);
  await expect(pausedNotice(page)).toHaveCount(0);
  expect(checks(fake)).toBe(sent + 4);
});

test('after GitHub asks GitCRM to wait, it sends nothing until the wait is over', async ({ page }) => {
  await page.clock.install();
  const fake = await open(page, [contact('Ava Bennett')]);
  await page.clock.fastForward('00:31');
  fake.failNext('GET', REF, { respond: { status: 429, body: { message: 'You have exceeded a secondary rate limit' }, headers: { 'retry-after': '60' } } });
  await focus(page);
  await expect(slowDown(page)).toBeVisible();

  const sent = fake.requests.length;
  await refresh(page);
  await page.clock.fastForward('00:31');
  await focus(page);
  await page.waitForTimeout(300);
  expect(fake.requests.length).toBe(sent);
  await expect(slowDown(page)).toBeVisible();

  await page.clock.fastForward('00:30');
  await refresh(page);
  await expect(status(page)).toHaveText('Up to date');
  await expect(slowDown(page)).toHaveCount(0);
  expect(fake.requests.length).toBeGreaterThan(sent);
});

test('a failed focus check runs the connect checks before it reports a problem', async ({ page }) => {
  await page.clock.install();
  const fake = await open(page, [contact('Ava Bennett')]);
  await page.clock.fastForward('00:31');
  // A 404 alone could mean lost access or a branch with no commits; only the connect checks tell.
  fake.failNext('GET', REF, { respond: { status: 404, body: { message: 'Not Found' } } });
  const users = fake.count('GET', /^\/user$/);
  await focus(page);
  await expect.poll(() => fake.count('GET', /^\/user$/)).toBe(users + 1);
  await expect(status(page)).toHaveText('Up to date');
  await expect(page.getByText('no commits yet')).toHaveCount(0);
});

test('with five tabs open, one tab checks main and the others show what it found', async ({ context }) => {
  const ava = contact('Ava Bennett');
  const { fake, tabs } = await openTabs(context, ava, 5);
  await renameOnGitHub(fake, ava, 'Ava Bennett-Cole');
  await context.clock.fastForward('00:31');

  const before = checks(fake);
  await focus(tabs[4]); // the last tab to open does not check main itself
  for (const tab of tabs) await expect(contactNames(tab)).toHaveText(['Ava Bennett-Cole']);
  for (const tab of tabs) await focus(tab);
  await tabs[0].waitForTimeout(500);
  expect(checks(fake)).toBe(before + 1);
});

// The browser gives the lock to the next tab shortly after the checking tab closes.
const holdsLock = (page: Page) => page.evaluate(async () => (await navigator.locks.query()).pending?.length === 0);

test('when the checking tab closes, another tab takes over', async ({ context }) => {
  const ava = contact('Ava Bennett');
  const { fake, tabs } = await openTabs(context, ava, 2);
  await tabs[0].close();
  await expect.poll(() => holdsLock(tabs[1])).toBe(true);
  await renameOnGitHub(fake, ava, 'Ava Bennett-Cole');
  await context.clock.fastForward('00:31');

  const before = checks(fake);
  await focus(tabs[1]);
  await expect(contactNames(tabs[1])).toHaveText(['Ava Bennett-Cole']);
  expect(checks(fake)).toBe(before + 1);
});

test('when the checking tab does not answer, a tab checks main itself after 5 seconds', async ({ context }) => {
  // A page that takes the lock first and never answers, like a tab the browser froze.
  const silent = await context.newPage();
  await silent.goto('/dev.html');
  await silent.evaluate(() => void navigator.locks.request('gitcrm-sync:octo-dev/crm', () => new Promise(() => {})));
  const ava = contact('Ava Bennett');
  const { fake, tabs } = await openTabs(context, ava, 1);
  await renameOnGitHub(fake, ava, 'Ava Bennett-Cole');
  await context.clock.fastForward('00:31');

  const before = checks(fake);
  await focus(tabs[0]);
  await tabs[0].waitForTimeout(300);
  expect(checks(fake)).toBe(before);
  await context.clock.fastForward('00:05');
  await expect(contactNames(tabs[0])).toHaveText(['Ava Bennett-Cole']);
  expect(checks(fake)).toBe(before + 1);
});

test('Disconnect in one tab hides the records in every tab', async ({ context }) => {
  const { tabs } = await openTabs(context, contact('Ava Bennett'), 2);
  await go(tabs[1], 'Settings');
  await tabs[1].getByRole('button', { name: 'Disconnect' }).click();
  await tabs[1].getByRole('button', { name: 'Confirm disconnect' }).click();
  for (const tab of tabs) {
    await expect(tab.getByRole('heading', { name: /Connect GitCRM/ })).toBeVisible();
    await expect(tab.getByText('Ava Bennett')).toHaveCount(0);
  }
});

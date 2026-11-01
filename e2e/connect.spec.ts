// Spec 01 (connect a private repository), against the fake GitHub.
import { recordPath, WORKSPACE_PATH } from '../src/core/paths.ts';
import { serializeRecord, serializeWorkspace } from '../src/core/record-file.ts';
import { newRecord } from '../src/core/records.ts';
import { newWorkspaceConfig } from '../src/core/workspace.ts';
import type { FakeGitHub } from '../src/test/fake-github.ts';
import { expect, test, type Page } from './fixtures.ts';
import { connect } from './connect-page.ts';
import { PAGES_SITE, routeFakeGitHub, servePagesSite } from './fake-route.ts';

async function seedWorkspace(fake: FakeGitHub) {
  await fake.seed(WORKSPACE_PATH, serializeWorkspace(newWorkspaceConfig({ name: 'Example Studio', defaultCurrency: 'USD' })));
  const ava = newRecord('contact', { name: 'Ava Bennett', emails: [], phones: [], companyId: null, tags: [] }, { now: new Date() });
  await fake.seed(recordPath('contact', ava.id), serializeRecord(ava));
}

const home = (page: Page) => page.getByRole('heading', { level: 1, name: 'Example Studio' });
const status = (page: Page) => page.getByRole('banner').getByRole('status');

function savedConnection(page: Page) {
  return page.evaluate(() => localStorage.getItem('gitcrm.connection'));
}

// Number of cached workspaces in IndexedDB.
function cachedWorkspaces(page: Page) {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const request = indexedDB.open('gitcrm');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('snapshots')) return resolve(0);
          const count = db.transaction('snapshots').objectStore('snapshots').count();
          count.onsuccess = () => {
            resolve(count.result);
            db.close();
          };
        };
      }),
  );
}

// S-09: a data repo made with GitHub's new-repository form has no commits.
test('initializes an empty data repository: the workspace config is its first commit', async ({ page }) => {
  const fake = await routeFakeGitHub(page, { empty: true });
  await connect(page, fake);
  await page.getByLabel('Workspace name').fill('Example Studio');
  await page.getByRole('button', { name: 'Set up workspace' }).click();
  await expect(home(page)).toBeVisible();
  expect(fake.commitCount()).toBe(1);
  expect(fake.paths()).toEqual([WORKSPACE_PATH]);
  await page.reload();
  await expect(home(page)).toBeVisible();
});

const newRepoParams = async (page: Page) => Object.fromEntries(new URL((await page.getByRole('link', { name: 'Create your data repository' }).getAttribute('href'))!).searchParams);

test('the link to a new data repository fills in a private repo, from what I type', async ({ page }) => {
  await routeFakeGitHub(page);
  await page.goto('./');
  // Step 1 comes first, before the repository field and the token (spec 01).
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(['1. Create your data repository', '2. Enter its name', '3. Create a token']);
  await expect(page.getByLabel('Repository', { exact: true })).toHaveValue('');
  expect(await newRepoParams(page)).toMatchObject({ name: 'gitcrm-data', owner: '@me', visibility: 'private' });
  await page.getByLabel('Repository', { exact: true }).fill('octo-dev/crm-records');
  expect(await newRepoParams(page)).toMatchObject({ name: 'crm-records', owner: 'octo-dev', visibility: 'private' });
});

test('on my GitHub Pages site, Repository starts as <owner>/gitcrm-data', async ({ page, baseURL }) => {
  await routeFakeGitHub(page);
  await servePagesSite(page, baseURL!);
  await page.goto(PAGES_SITE);
  await expect(page.getByLabel('Repository', { exact: true })).toHaveValue('octo-dev/gitcrm-data');
  expect(await newRepoParams(page)).toMatchObject({ name: 'gitcrm-data', owner: 'octo-dev', visibility: 'private' });
});

test('initializes a new private repository with exactly one commit', async ({ page }) => {
  const fake = await routeFakeGitHub(page);
  const commits = fake.commitCount();
  await connect(page, fake);
  await expect(page.getByRole('heading', { name: 'Set up a GitCRM workspace' })).toBeVisible();
  await page.getByLabel('Workspace name').fill('Example Studio');
  await page.getByRole('button', { name: 'Set up workspace' }).click();

  await expect(home(page)).toBeVisible();
  expect(fake.commitCount()).toBe(commits + 1);
  expect(fake.paths()).toEqual([WORKSPACE_PATH]);
  expect(JSON.parse(fake.file(WORKSPACE_PATH)!)).toMatchObject({
    schemaVersion: 1,
    name: 'Example Studio',
    defaultCurrency: 'USD',
    pipelineStages: [{ id: 'lead' }, { id: 'qualified' }, { id: 'proposal' }, { id: 'won' }, { id: 'lost' }],
  });
});

test('opens an existing workspace without a new commit', async ({ page }) => {
  const fake = await routeFakeGitHub(page);
  await seedWorkspace(fake);
  const commits = fake.commitCount();
  await connect(page, fake);
  await expect(home(page)).toBeVisible();
  await expect(page.getByRole('region', { name: 'Active records' })).toContainText('Contacts1');
  await expect(status(page)).toHaveText('Up to date');
  expect(fake.commitCount()).toBe(commits);
});

test('refuses a public repository and writes nothing', async ({ page }) => {
  const fake = await routeFakeGitHub(page, { private: false });
  await connect(page, fake);
  await expect(page.getByRole('alert')).toContainText('public');
  expect(fake.requests.filter((r) => r.method !== 'GET')).toEqual([]);
  expect(await savedConnection(page)).toBeNull();
});

test('a token without Contents write opens read-only', async ({ page }) => {
  const fake = await routeFakeGitHub(page, { canWrite: false });
  await connect(page, fake);
  await expect(page.getByRole('heading', { name: 'Set up a GitCRM workspace' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Read and write');
  await expect(page.getByRole('button', { name: 'Set up workspace' })).toBeDisabled();

  await seedWorkspace(fake);
  await page.getByRole('button', { name: 'Disconnect' }).click();
  await connect(page, fake);
  await expect(home(page)).toBeVisible();
  await expect(page.getByText('Read-only', { exact: true })).toBeVisible();
});

test('an archived repository opens read-only and says to unarchive it', async ({ page }) => {
  const fake = await routeFakeGitHub(page, { archived: true });
  await seedWorkspace(fake);
  await connect(page, fake);
  await expect(home(page)).toBeVisible();
  await expect(page.getByText(/Unarchive it on GitHub/)).toBeVisible();
  // POST /graphql reads records; nothing else may write.
  expect(fake.requests.filter((r) => r.method !== 'GET' && r.path !== '/graphql')).toEqual([]);
});

test('a repository the token cannot see lists every cause', async ({ page }) => {
  const fake = await routeFakeGitHub(page);
  await connect(page, fake, { repo: 'missing' });
  const alert = page.getByRole('alert');
  for (const cause of ['the name is right', 'Only select repositories', 'Read and write', 'approve']) await expect(alert).toContainText(cause);
});

test('the token link is filled in for the repository owner', async ({ page }) => {
  await routeFakeGitHub(page);
  await page.goto('/');
  await page.getByLabel('Repository', { exact: true }).fill('octo-dev/crm');
  const href = await page.getByRole('link', { name: /token form/ }).getAttribute('href');
  const url = new URL(href!);
  expect(url.pathname).toBe('/settings/personal-access-tokens/new');
  expect(url.searchParams.get('target_name')).toBe('octo-dev');
  expect(url.searchParams.get('contents')).toBe('write');
});

test('disconnect deletes the token and the record cache, and hides the data', async ({ page }) => {
  const fake = await routeFakeGitHub(page);
  await seedWorkspace(fake);
  await connect(page, fake);
  await expect(home(page)).toBeVisible();
  await expect.poll(() => cachedWorkspaces(page)).toBe(1);
  expect(await savedConnection(page)).not.toBeNull();

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Disconnect' }).click();
  await page.getByRole('button', { name: 'Confirm disconnect' }).click();

  await expect(page.getByRole('heading', { name: /Connect GitCRM/ })).toBeVisible();
  expect(await savedConnection(page)).toBeNull();
  expect(await cachedWorkspaces(page)).toBe(0);
  await expect(page.getByText('Example Studio')).toHaveCount(0);
});

test('a reload with a remembered token reconnects without downloading records', async ({ page }) => {
  const fake = await routeFakeGitHub(page);
  await seedWorkspace(fake);
  await connect(page, fake);
  await expect(status(page)).toHaveText('Up to date');
  await expect.poll(() => cachedWorkspaces(page)).toBe(1);

  fake.requests.length = 0;
  await page.reload();
  await expect(home(page)).toBeVisible();
  await expect(status(page)).toHaveText('Up to date');
  expect(fake.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
    'GET /user',
    'GET /repos/octo-dev/crm',
    'POST /repos/octo-dev/crm/git/blobs', // the write check, not a download
    'GET /repos/octo-dev/crm/git/ref/heads/main',
  ]);
});

test('without "Remember on this device", nothing is stored and a reload asks again', async ({ page }) => {
  const fake = await routeFakeGitHub(page);
  await seedWorkspace(fake);
  await connect(page, fake, { remember: false });
  await expect(home(page)).toBeVisible();
  expect(await savedConnection(page)).toBeNull();
  expect(await cachedWorkspaces(page)).toBe(0);

  await page.reload();
  await expect(page.getByRole('heading', { name: /Connect GitCRM/ })).toBeVisible();
});

test('a revoked token asks to connect again on reload', async ({ page }) => {
  const fake = await routeFakeGitHub(page);
  await seedWorkspace(fake);
  await connect(page, fake);
  await expect(home(page)).toBeVisible();

  fake.token = 'a-new-token'; // the old token no longer works
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('expired, or revoked');
  await expect(page.getByLabel('Repository', { exact: true })).toHaveValue('octo-dev/crm');
  await expect(page.getByText('Ava Bennett')).toHaveCount(0);
  expect(await savedConnection(page)).toBeNull();
});

test('when GitHub is unreachable, cached records stay on screen, read-only', async ({ page }) => {
  const fake = await routeFakeGitHub(page);
  await seedWorkspace(fake);
  await connect(page, fake);
  await expect(status(page)).toHaveText('Up to date');
  await expect.poll(() => cachedWorkspaces(page)).toBe(1);

  fake.failNext('GET', /^\/user$/, { network: 'before' });
  await page.reload();
  await expect(home(page)).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Could not reach GitHub');
  await expect(status(page)).toHaveText('Not synced');
});

test('keeps the token in one storage key and out of the URL, console, and cookies', async ({ page }) => {
  const logged: string[] = [];
  page.on('console', (message) => logged.push(message.text()));
  const fake = await routeFakeGitHub(page, { token: 'github_pat_e2e_secret' });
  await seedWorkspace(fake);
  await connect(page, fake);
  await expect(status(page)).toHaveText('Up to date');

  const keys = await page.evaluate((token) => Object.keys(localStorage).filter((key) => localStorage.getItem(key)!.includes(token)), fake.token);
  expect(keys).toEqual(['gitcrm.connection']);
  const cookies = JSON.stringify(await page.context().cookies());
  for (const text of [page.url(), cookies, await page.evaluate(() => JSON.stringify({ ...sessionStorage })), ...logged]) expect(text).not.toContain(fake.token);
});

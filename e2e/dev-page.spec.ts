// Phase 1 exit (docs/11): the developer page creates, reads, edits, and deletes one contact
// without data loss.
import type { FakeGitHub } from '../src/test/fake-github.ts';
import { expect, test, type Page } from './fixtures.ts';
import { routeFakeGitHub } from './fake-route.ts';

async function connect(page: Page, fake: FakeGitHub) {
  await page.goto('/dev.html');
  await page.getByLabel('Repository (owner/repo)').fill(`${fake.owner}/${fake.repo}`);
  await page.getByLabel('Fine-grained PAT').fill(fake.token);
  await page.getByRole('button', { name: 'Connect' }).click();
  await expect(page.getByText(`Connected to ${fake.owner}/${fake.repo}`)).toBeVisible();
}

async function createAva(page: Page) {
  await page.getByLabel('New contact name').fill('Ava Bennett');
  await page.getByLabel('New contact emails').fill('ava@example.test');
  await page.getByRole('button', { name: 'Create contact' }).click();
  await expect(page.getByRole('status')).toContainText('committed');
}

function contactFiles(fake: FakeGitHub) {
  return fake.paths().filter((path) => path.startsWith('data/contacts/'));
}

function state(page: Page) {
  return page.getByRole('status');
}

test('creates, reads, edits, and deletes one contact without data loss', async ({ page }) => {
  const fake = await routeFakeGitHub(page);
  await connect(page, fake);
  await createAva(page);

  const [path] = contactFiles(fake);
  expect(path).toMatch(/^data\/contacts\/[0-9a-f]{2}\/[0-9a-f-]{36}\.json$/);
  const created = JSON.parse(fake.file(path)!);
  expect(created).toMatchObject({ schemaVersion: 1, type: 'contact', name: 'Ava Bennett', emails: ['ava@example.test'], archivedAt: null });

  // A fresh page has no memory of the contact: it must come back from the repo.
  await page.reload();
  await connect(page, fake);
  await page.getByRole('button', { name: 'Load snapshot' }).click();
  await expect(state(page)).toContainText('loaded');
  const row = page.getByRole('listitem').filter({ hasText: 'Ava Bennett' });
  await row.getByRole('button', { name: 'Open' }).click();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Ava Bennett');

  await page.getByLabel('Emails', { exact: true }).fill('ava@example.test, ava@studio.test');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(state(page)).toContainText('committed');
  const edited = JSON.parse(fake.file(path)!);
  expect(edited).toEqual({ ...created, emails: ['ava@example.test', 'ava@studio.test'], updatedAt: edited.updatedAt });

  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Confirm delete' }).click();
  await expect(state(page)).toContainText('committed');
  expect(contactFiles(fake)).toEqual([]);
  expect(fake.lastCommitMessage()).toMatch(/^gitcrm: delete contact [0-9a-f]{8}$/);
  await expect(page.getByRole('listitem').filter({ hasText: 'Ava Bennett' })).toHaveCount(0);
});

test('a save against a stale SHA shows a conflict and overwrites nothing', async ({ page }) => {
  const fake = await routeFakeGitHub(page);
  await connect(page, fake);
  await createAva(page);
  const [path] = contactFiles(fake);

  // Another person saves the same contact first.
  const theirs = { ...JSON.parse(fake.file(path)!), name: 'Ava Bennett-Smith' };
  await fake.seed(path, `${JSON.stringify(theirs, null, 2)}\n`);

  await page.getByLabel('Name', { exact: true }).fill('Ava B.');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(state(page)).toContainText('conflict');
  await expect(page.getByLabel('Remote version')).toContainText('Ava Bennett-Smith');
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Ava B.');
  expect(JSON.parse(fake.file(path)!).name).toBe('Ava Bennett-Smith');

  // Retry after review: the next save goes against the remote version's SHA.
  await page.getByRole('button', { name: 'Use the remote version as the base' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(state(page)).toContainText('committed');
  expect(JSON.parse(fake.file(path)!).name).toBe('Ava B.');
});

test('refuses a public repository and writes nothing', async ({ page }) => {
  const fake = await routeFakeGitHub(page, { private: false });
  await page.goto('/dev.html');
  await page.getByLabel('Repository (owner/repo)').fill(`${fake.owner}/${fake.repo}`);
  await page.getByLabel('Fine-grained PAT').fill(fake.token);
  await page.getByRole('button', { name: 'Connect' }).click();
  await expect(state(page)).toContainText('public');
  await expect(page.getByRole('button', { name: 'Create contact' })).toHaveCount(0);
  expect(fake.requests.filter((r) => r.method !== 'GET')).toEqual([]);
});

test('keeps the token out of the URL, console, and browser storage', async ({ page }) => {
  const logged: string[] = [];
  page.on('console', (message) => logged.push(message.text()));
  const fake = await routeFakeGitHub(page, { token: 'github_pat_e2e_secret' });
  await connect(page, fake);
  await createAva(page);
  await page.getByRole('button', { name: 'Load snapshot' }).click();
  await expect(state(page)).toContainText('loaded');

  const stored = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage }, cookies: document.cookie }));
  for (const text of [page.url(), stored, ...logged]) expect(text).not.toContain(fake.token);
});

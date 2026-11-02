// Failure paths (docs/10, "Failure paths"): GitHub and the browser fail during a load, a save, or a
// delete. Each test checks what the user sees, what is on main, and that no request repeats.
import { recordPath, WORKSPACE_PATH } from '../src/core/paths.ts';
import { serializeRecord, serializeWorkspace } from '../src/core/record-file.ts';
import type { CRMRecord } from '../src/core/schemas.ts';
import { newWorkspaceConfig } from '../src/core/workspace.ts';
import type { FakeGitHub } from '../src/test/fake-github.ts';
import { expect, test, type Page } from './fixtures.ts';
import { connect } from './connect-page.ts';
import { routeFakeGitHub } from './fake-route.ts';
import { contact, field, go, homeHeading, open, openContact, seedWorkspace, status, task } from './workspace.ts';

const ava = contact('Ava Bennett');
const ben = contact('Ben Carter');
const callAva = task('Call Ava', { related: { type: 'contact', id: ava.id } });

const fileOf = (fake: FakeGitHub, record: CRMRecord) => JSON.parse(fake.file(recordPath(record.type, record.id))!);
const connectHeading = (page: Page) => page.getByRole('heading', { name: /Connect GitCRM/ });
const formAlert = (page: Page) => page.getByRole('alert');

// Opens Ava's edit form and changes her name, ready to save.
async function editAva(page: Page) {
  await openContact(page, 'Ava Bennett');
  await page.getByRole('link', { name: 'Edit', exact: true }).click();
  await field(page, 'Name').fill('Ava Bennett-Park');
}
const save = (page: Page) => page.getByRole('button', { name: 'Save contact' }).click();

test.describe('load', () => {
  test('a truncated tree stops the first load, says why, and writes nothing', async ({ page }) => {
    const fake = await routeFakeGitHub(page);
    await seedWorkspace(fake, [ava]);
    fake.truncateTrees = true;
    const commits = fake.commitCount();
    await connect(page, fake);
    await expect(connectHeading(page)).toBeVisible();
    await expect(page.getByText('The repository tree is too large to read in one request, so GitCRM cannot load every record')).toBeVisible();
    expect(fake.commitCount()).toBe(commits);
  });

  // GitHub ends a query that runs over 10 s with 502 or 504 (S-04), so GitCRM retries it once, split.
  test('a query that times out twice stops the first load, and Connect again loads the records', async ({ page }) => {
    const fake = await routeFakeGitHub(page);
    await seedWorkspace(fake, [ava]);
    const timeout = { respond: { status: 502, body: { message: 'Bad Gateway' } } };
    fake.failNext('POST', /\/graphql$/, timeout);
    fake.failNext('POST', /\/graphql$/, timeout);
    await connect(page, fake);
    await expect(page.getByText('GitHub had an error. Try again later.')).toBeVisible();
    expect(fake.count('POST', /\/graphql$/)).toBe(2);

    fake.failNext('POST', /\/graphql$/, timeout); // one timeout: the retry loads the records
    await connect(page, fake);
    await expect(homeHeading(page)).toBeVisible();
    expect(fake.count('POST', /\/graphql$/)).toBe(4);
    await go(page, 'Contacts');
    await expect(page.getByRole('table', { name: 'Contacts' })).toContainText('Ava Bennett');
  });

  test('workspace settings from a newer GitCRM, or not valid, block the workspace and nothing is written', async ({ page }) => {
    const fake = await routeFakeGitHub(page);
    const settings = serializeWorkspace(newWorkspaceConfig({ name: 'Example Studio', defaultCurrency: 'USD' }));
    await fake.seed(WORKSPACE_PATH, settings.replace('"schemaVersion": 1', '"schemaVersion": 3'));
    const commits = fake.commitCount();
    await connect(page, fake);
    await expect(page.getByText('A newer version of GitCRM set up this workspace. Open it with that version; this one will not change it.')).toBeVisible();

    await fake.seed(WORKSPACE_PATH, '{ "name": "Example');
    await page.reload();
    await expect(page.getByText(`The workspace settings file, ${WORKSPACE_PATH}, is invalid`)).toBeVisible();
    expect(fake.commitCount()).toBe(commits + 1); // the seed above, and no commit from GitCRM
    expect(fake.file(WORKSPACE_PATH)).toBe('{ "name": "Example');
  });
});

test.describe('save', () => {
  test('a token revoked during the session fails the save, keeps the form, and tries no other credential', async ({ page }) => {
    const fake = await open(page, [ava]);
    await editAva(page);
    fake.token = 'revoked';
    const requests = fake.requests.length;
    await save(page);
    await expect(formAlert(page)).toHaveText('The token expired or was revoked. Connect again with a new token. Your changes are still in this form.');
    await expect(field(page, 'Name')).toHaveValue('Ava Bennett-Park');
    expect(fake.requests.slice(requests).map((r) => r.method)).toEqual(['PUT']);
    expect(fileOf(fake, ava).name).toBe('Ava Bennett');
  });

  test('write access lost during the session: the save says to Refresh, and Refresh opens read-only', async ({ page }) => {
    const fake = await open(page, [ava]);
    await editAva(page);
    fake.canWrite = false;
    await save(page);
    await expect(formAlert(page)).toHaveText(
      'GitHub refused the request: Resource not accessible by personal access token. Refresh to check what the token can still do here. Your changes are still in this form.',
    );
    await page.getByRole('button', { name: 'Refresh' }).click();
    await expect(page.getByText('GitCRM is read-only here, so changes cannot be saved.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save contact' })).toBeDisabled();
    await expect(field(page, 'Name')).toHaveValue('Ava Bennett-Park');
  });

  test('a rate-limited save says when to try again, and a Save before then sends nothing', async ({ page }) => {
    const fake = await open(page, [ava]);
    await editAva(page);
    fake.failNext('PUT', /\/contents\//, {
      respond: { status: 403, body: { message: 'You have exceeded a secondary rate limit.' }, headers: { 'retry-after': '120', 'x-ratelimit-remaining': '0' } },
    });
    await save(page);
    const message = 'GitHub asked GitCRM to slow down. Try again in 2 min. Your changes are still in this form.';
    await expect(formAlert(page)).toHaveText(message);
    const requests = fake.requests.length;
    await save(page);
    await expect(formAlert(page)).toHaveText(message);
    expect(fake.requests.length).toBe(requests);
    expect(fake.count('PUT')).toBe(1);
  });

  test('a GitHub error on a save keeps the form and sends one request; the next Save works', async ({ page }) => {
    const fake = await open(page, [ava]);
    await editAva(page);
    fake.failNext('PUT', /\/contents\//, { respond: { status: 502, body: { message: 'Server Error' } } });
    await save(page);
    await expect(formAlert(page)).toHaveText('GitHub had an error. Try again later. Your changes are still in this form.');
    expect(fake.count('PUT')).toBe(1);
    expect(fileOf(fake, ava).name).toBe('Ava Bennett');

    await save(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Ava Bennett-Park' })).toBeVisible();
    expect(fileOf(fake, ava).name).toBe('Ava Bennett-Park');
  });

  test('when the response to a create is lost, GitCRM reads the file, counts the save once, and makes no duplicate', async ({ page }) => {
    const fake = await open(page);
    await go(page, 'Contacts');
    await page.getByRole('link', { name: 'New contact' }).click();
    await field(page, 'Name').fill('Ava Bennett');
    fake.failNext('PUT', /\/contents\//, { network: 'after' });
    await save(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Ava Bennett' })).toBeVisible();
    await expect(status(page)).toHaveText('Saved'); // no commit SHA came back, so no link
    expect(fake.paths().filter((path) => path.startsWith('data/'))).toHaveLength(1);
    expect(fake.count('PUT')).toBe(1);
  });

  test('when the response is lost and the read gets no answer, the form says the save may or may not have happened', async ({ page }) => {
    const fake = await open(page, [ava]);
    await editAva(page);
    fake.failNext('PUT', /\/contents\//, { network: 'after' });
    fake.failNext('GET', /\/contents\//, { network: 'before' });
    await save(page);
    await expect(formAlert(page)).toHaveText(
      'GitHub did not answer, so the change may or may not have been saved. Reload before you try again. Your changes are still in this form.',
    );
    expect(fake.count('PUT')).toBe(1);

    // The save had landed. After a reload, the records show it.
    await page.reload();
    await expect(status(page)).toHaveText('Up to date');
    await go(page, 'Contacts');
    await expect(page.getByRole('table', { name: 'Contacts' }).getByRole('link')).toHaveText(['Ava Bennett-Park']);
  });

  // A stand-in response: no spike recorded what GitHub returns for a branch that requires pull requests (docs/12).
  test('a write GitHub refuses for another reason, such as a branch rule, passes on its words and keeps the form', async ({ page }) => {
    const fake = await open(page, [ava]);
    await editAva(page);
    fake.failNext('PUT', /\/contents\//, { respond: { status: 409, body: { message: 'Changes must be made through a pull request.' } } });
    await save(page);
    await expect(formAlert(page)).toHaveText('GitHub refused the request: Changes must be made through a pull request. Your changes are still in this form.');
    await expect(page.getByRole('heading', { name: 'Someone else changed this' })).toHaveCount(0);
    expect(fake.count('PUT')).toBe(1);
    expect(fileOf(fake, ava).name).toBe('Ava Bennett');
  });

  test('a save after someone else changed another record works, and both changes stay on main', async ({ page }) => {
    const fake = await open(page, [ava, ben]);
    await editAva(page);
    await fake.seed(recordPath('contact', ben.id), serializeRecord({ ...ben, name: 'Ben Carter-Lee' }));
    await save(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Ava Bennett-Park' })).toBeVisible();
    expect(fileOf(fake, ava).name).toBe('Ava Bennett-Park');
    expect(fileOf(fake, ben).name).toBe('Ben Carter-Lee');
  });
});

test.describe('delete', () => {
  async function openDelete(page: Page) {
    await openContact(page, 'Ava Bennett');
    await page.getByRole('link', { name: 'Delete', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Delete Ava Bennett?' })).toBeVisible();
  }

  test('when the response to the ref update is lost, GitCRM reads main and reports the delete once', async ({ page }) => {
    const fake = await open(page, [ava, callAva]);
    await openDelete(page);
    const commits = fake.commitCount();
    fake.failNext('PATCH', /\/git\/refs\//, { network: 'after' });
    await page.getByRole('button', { name: 'Delete contact' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Contacts' })).toBeVisible();
    await expect(status(page)).toHaveText('Deleted · View commit');
    expect(fake.commitCount()).toBe(commits + 1);
    expect(fake.count('PATCH')).toBe(1);
    expect(fake.file(recordPath('contact', ava.id))).toBeUndefined();
    expect(fake.file(recordPath('task', callAva.id))).toBeUndefined();
  });

  test('when main moves on every attempt, the delete stops after 3 attempts and deletes nothing', async ({ page }) => {
    const fake = await open(page, [ava, callAva]);
    await openDelete(page);
    for (let i = 0; i < 4; i++) fake.failNext('PATCH', /\/git\/refs\//, { run: async () => void (await fake.seed('README.md', `saved by someone else ${i}`)) });
    await page.getByRole('button', { name: 'Delete contact' }).click();
    await expect(page.getByRole('alert')).toContainText('GitHub refused the request: Update is not a fast forward');
    expect(fake.count('PATCH')).toBe(3);
    expect(fake.file(recordPath('contact', ava.id))).toBeDefined();
    expect(fake.file(recordPath('task', callAva.id))).toBeDefined();
    await expect(page.getByRole('button', { name: 'Delete contact' })).toBeEnabled();
  });
});

test('with browser storage blocked, GitCRM connects for this tab only, and a reload asks again', async ({ page }) => {
  await page.addInitScript(() => {
    const blocked = () => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    };
    for (const name of ['getItem', 'setItem', 'removeItem', 'clear', 'key'] as const) Storage.prototype[name] = blocked;
    Object.defineProperty(window, 'indexedDB', { get: blocked });
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  const fake = await open(page, [ava]);
  await editAva(page);
  await save(page);
  await expect(page.getByRole('heading', { level: 1, name: 'Ava Bennett-Park' })).toBeVisible();
  expect(fileOf(fake, ava).name).toBe('Ava Bennett-Park');

  await page.reload();
  await expect(connectHeading(page)).toBeVisible();
  expect(errors).toEqual([]);
});

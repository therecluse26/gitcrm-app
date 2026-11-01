// Spec 02 (contacts and companies) and the save states of spec 07, against the fake GitHub.
import { recordPath } from '../src/core/paths.ts';
import { parseRecordFile, serializeRecord } from '../src/core/record-file.ts';
import type { CRMRecord } from '../src/core/schemas.ts';
import { gitBlobSha } from '../src/storage/encoding.ts';
import type { FakeGitHub } from '../src/test/fake-github.ts';
import { expect, test } from './fixtures.ts';
import { company, contact, field, go, open, openContact, status } from './workspace.ts';

const writes = (fake: FakeGitHub) => fake.requests.filter((r) => r.method === 'PUT');
const fileOf = (fake: FakeGitHub, record: CRMRecord) => JSON.parse(fake.file(recordPath(record.type, record.id))!);

test('creates a contact as a new schema version 1 file, and it is there after a reload', async ({ page }) => {
  const fake = await open(page);
  await go(page, 'Contacts');
  await page.getByRole('link', { name: 'New contact' }).click();
  await field(page, 'Name').fill('Ava Bennett');
  await field(page, 'Email 1').fill('ava@example.test');
  await page.getByRole('button', { name: 'Save contact' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Ava Bennett' })).toBeVisible();
  await expect(status(page)).toHaveText('Saved · View commit');
  const [path, ...others] = fake.paths().filter((p) => p.startsWith('data/'));
  expect(others).toEqual([]);
  expect(path).toMatch(/^data\/contacts\/([0-9a-f]{2})\/\1[0-9a-f]{6}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.json$/);
  const parsed = parseRecordFile(path, fake.file(path)!);
  expect(parsed.ok && parsed.record).toMatchObject({ schemaVersion: 1, type: 'contact', name: 'Ava Bennett', emails: ['ava@example.test'] });
  expect(fake.lastCommitMessage()).toMatch(/^gitcrm: create contact [0-9a-f]{8}$/);

  await page.reload();
  await expect(status(page)).toHaveText('Up to date');
  await expect(page.getByRole('heading', { level: 1, name: 'Ava Bennett' })).toBeVisible();
});

test('links a contact to a company, and the company lists the contact', async ({ page }) => {
  const northwind = company('Northwind Traders');
  const ava = contact('Ava Bennett');
  const fake = await open(page, [northwind, ava]);
  await openContact(page, 'Ava Bennett');
  await page.getByRole('link', { name: 'Edit' }).click();
  await field(page, 'Company').selectOption({ label: 'Northwind Traders' });
  await page.getByRole('button', { name: 'Save contact' }).click();

  await page.getByRole('link', { name: 'Northwind Traders' }).click();
  expect(fileOf(fake, ava).companyId).toBe(northwind.id);
  await expect(page.getByRole('list', { name: 'Contacts at Northwind Traders' }).getByRole('link')).toHaveText(['Ava Bennett']);
});

test('"Add contact" on a company page fills in the company', async ({ page }) => {
  const northwind = company('Northwind Traders');
  const fake = await open(page, [northwind]);
  await go(page, 'Companies');
  await page.getByRole('link', { name: 'Northwind Traders' }).click();
  await page.getByRole('link', { name: 'Add contact' }).click();
  await expect(field(page, 'Company')).toHaveValue(northwind.id);
  await field(page, 'Name').fill('Ben Carter');
  await page.getByRole('button', { name: 'Save contact' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Ben Carter' })).toBeVisible();
  const [path] = fake.paths().filter((p) => p.startsWith('data/contacts/'));
  expect(JSON.parse(fake.file(path)!).companyId).toBe(northwind.id);
});

test('an edit sends the loaded blob SHA and changes no other file', async ({ page }) => {
  const ava = contact('Ava Bennett', { emails: ['ava@example.test'] });
  const ben = contact('Ben Carter');
  const fake = await open(page, [ava, ben]);
  const benBefore = fake.file(recordPath('contact', ben.id));
  await openContact(page, 'Ava Bennett');
  await page.getByRole('link', { name: 'Edit' }).click();
  await field(page, 'Email 1').fill('ava@studio.test');
  await page.getByRole('button', { name: 'Save contact' }).click();

  await expect(status(page)).toHaveText('Saved · View commit');
  expect(writes(fake)).toEqual([
    expect.objectContaining({ path: `/repos/octo-dev/crm/contents/${recordPath('contact', ava.id)}`, body: expect.objectContaining({ sha: await gitBlobSha(serializeRecord(ava)) }) }),
  ]);
  expect(fileOf(fake, ava).emails).toEqual(['ava@studio.test']);
  expect(fake.file(recordPath('contact', ben.id))).toBe(benBefore);
  expect(fake.lastCommitMessage()).toBe(`gitcrm: update contact ${ava.id.slice(0, 8)}`);
});

test('a malformed email shows a field error and saves nothing', async ({ page }) => {
  const fake = await open(page);
  await go(page, 'Contacts');
  await page.getByRole('link', { name: 'New contact' }).click();
  await field(page, 'Name').fill('Ava Bennett');
  await field(page, 'Email 1').fill('ava@');
  await page.getByRole('button', { name: 'Save contact' }).click();

  await expect(page.getByText('Enter a valid email address, such as ava@example.com.')).toBeVisible();
  await expect(field(page, 'Email 1')).toBeFocused();
  expect(writes(fake)).toEqual([]);
});

test('archive hides a contact until "Show archived" is on, and restore keeps its UUID', async ({ page }) => {
  const ava = contact('Ava Bennett');
  const fake = await open(page, [ava, contact('Ben Carter')]);
  await openContact(page, 'Ava Bennett');
  await page.getByRole('button', { name: 'Archive' }).click();
  await expect(page.getByRole('button', { name: 'Restore' })).toBeVisible();
  expect(fileOf(fake, ava).archivedAt).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);

  await go(page, 'Contacts');
  await expect(page.getByRole('list', { name: 'Contacts' }).getByRole('link')).toHaveText(['Ben Carter']);
  await expect(page.getByText('1 contact. 1 archived contact hidden.')).toBeVisible();
  await page.getByRole('checkbox', { name: 'Show archived' }).click();
  await page.getByRole('list', { name: 'Contacts' }).getByRole('link', { name: 'Ava Bennett' }).click();
  await page.getByRole('button', { name: 'Restore' }).click();

  await expect(page.getByRole('button', { name: 'Archive' })).toBeVisible();
  expect(fileOf(fake, ava)).toMatchObject({ id: ava.id, archivedAt: null });
  expect(fake.paths().filter((p) => p.startsWith('data/'))).toHaveLength(2);
});

test('after a conflict, Retry after review saves my change and keeps the other one', async ({ page }) => {
  const ava = contact('Ava Bennett', { emails: ['ava@example.test'] });
  const fake = await open(page, [ava]);
  await openContact(page, 'Ava Bennett');
  await page.getByRole('link', { name: 'Edit' }).click();
  await field(page, 'Phone 1').fill('555-0100');
  // Another user changes the email first.
  await fake.seed(recordPath('contact', ava.id), serializeRecord({ ...ava, emails: ['ava@studio.test'], updatedAt: '2026-10-29T13:00:00Z' }));
  await page.getByRole('button', { name: 'Save contact' }).click();

  const panel = page.getByRole('region', { name: 'Someone else changed this contact' });
  await expect(panel.getByRole('heading')).toBeFocused();
  await expect(panel.getByRole('row', { name: /^Email/ })).toHaveText(/ava@studio\.testNot changed/);
  await expect(panel.getByRole('row', { name: /^Phone/ })).toHaveText(/None555-0100/);
  expect(fileOf(fake, ava).phones).toEqual([]);
  await panel.getByRole('button', { name: 'Retry after review' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Ava Bennett' })).toBeVisible();
  expect(fileOf(fake, ava)).toMatchObject({ emails: ['ava@studio.test'], phones: ['555-0100'] });
});

test('after a conflict, Discard mine takes the version on GitHub', async ({ page }) => {
  const ava = contact('Ava Bennett', { emails: ['ava@example.test'] });
  const fake = await open(page, [ava]);
  await openContact(page, 'Ava Bennett');
  await page.getByRole('link', { name: 'Edit' }).click();
  await field(page, 'Email 1').fill('ava@mine.test');
  await fake.seed(recordPath('contact', ava.id), serializeRecord({ ...ava, emails: ['ava@studio.test'], updatedAt: '2026-10-29T13:00:00Z' }));
  await page.getByRole('button', { name: 'Save contact' }).click();
  await page.getByRole('button', { name: 'Discard mine' }).click();

  await expect(field(page, 'Email 1')).toHaveValue('ava@studio.test');
  await expect(page.getByText('Unsaved changes')).toHaveCount(0);
  // GitCRM loaded the newer version after the conflict, so the contact page shows it too.
  await page.getByRole('link', { name: 'Cancel' }).click();
  await expect(page.getByRole('link', { name: 'ava@studio.test' })).toBeVisible();
  expect(writes(fake)).toHaveLength(1);
});

test('saving a form without changes makes no commit', async ({ page }) => {
  const fake = await open(page, [contact('Ava Bennett')]);
  const commits = fake.commitCount();
  await openContact(page, 'Ava Bennett');
  await page.getByRole('link', { name: 'Edit' }).click();
  await page.getByRole('button', { name: 'Save contact' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Ava Bennett' })).toBeVisible();
  await expect(status(page)).toHaveText('Up to date');
  expect(fake.commitCount()).toBe(commits);
  expect(writes(fake)).toEqual([]);
});

test('offline, Save keeps the form and does not claim the save succeeded', async ({ page }) => {
  const ava = contact('Ava Bennett');
  const fake = await open(page, [ava]);
  await openContact(page, 'Ava Bennett');
  await page.getByRole('link', { name: 'Edit' }).click();
  await field(page, 'Name').fill('Ava Bennett-Park');
  fake.failNext('PUT', /\/contents\//, { network: 'before' });
  await page.getByRole('button', { name: 'Save contact' }).click();

  await expect(page.getByRole('alert')).toHaveText('Could not reach GitHub. Check the connection, then try again. Your changes are still in this form.');
  await expect(field(page, 'Name')).toHaveValue('Ava Bennett-Park');
  await expect(status(page)).toHaveText('Up to date');
  expect(fileOf(fake, ava).name).toBe('Ava Bennett');

  await page.getByRole('button', { name: 'Save contact' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Ava Bennett-Park' })).toBeVisible();
  expect(fileOf(fake, ava).name).toBe('Ava Bennett-Park');
});

test('leaving a form with unsaved changes asks first', async ({ page }) => {
  await open(page, [contact('Ava Bennett')]);
  await openContact(page, 'Ava Bennett');
  await page.getByRole('link', { name: 'Edit' }).click();
  await field(page, 'Name').fill('Ava B.');
  await expect(page.getByText('Unsaved changes')).toBeVisible();

  page.once('dialog', (dialog) => void dialog.dismiss());
  await go(page, 'Companies');
  await expect(page.getByRole('heading', { level: 1, name: 'Edit Ava Bennett' })).toBeVisible();
  await expect(field(page, 'Name')).toHaveValue('Ava B.');

  page.once('dialog', (dialog) => void dialog.accept());
  await go(page, 'Companies');
  await expect(page.getByRole('heading', { level: 1, name: 'Companies' })).toBeVisible();
});

test('a read-only token cannot add, edit, or archive', async ({ page }) => {
  await open(page, [contact('Ava Bennett')], { canWrite: false });
  await go(page, 'Contacts');
  await expect(page.getByRole('link', { name: 'New contact' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Ava Bennett' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Ava Bennett' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Edit' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Archive' })).toHaveCount(0);
});

test('a company website gets https://, and a javascript: link is refused', async ({ page }) => {
  const fake = await open(page);
  await go(page, 'Companies');
  await page.getByRole('link', { name: 'New company' }).click();
  await field(page, 'Name').fill('Northwind Traders');
  await field(page, 'Website').fill('javascript:alert(1)');
  await page.getByRole('button', { name: 'Save company' }).click();
  await expect(page.getByText('Enter a web address, such as https://example.com.')).toBeVisible();
  expect(writes(fake)).toEqual([]);

  await field(page, 'Website').fill('northwind.example');
  await page.getByRole('button', { name: 'Save company' }).click();
  await expect(page.getByRole('link', { name: 'https://northwind.example' })).toHaveAttribute('href', 'https://northwind.example');
  const [path] = fake.paths().filter((p) => p.startsWith('data/companies/'));
  expect(JSON.parse(fake.file(path)!).website).toBe('https://northwind.example');
});

test('searches and sorts the contact list', async ({ page }) => {
  const northwind = company('Northwind Traders');
  await open(page, [
    northwind,
    contact('Ava Bennett', { updatedAt: '2026-10-01T00:00:00Z' }),
    contact('Ben Carter', { tags: ['vip'], updatedAt: '2026-10-03T00:00:00Z' }),
    contact('Carla Diaz', { companyId: northwind.id, updatedAt: '2026-10-02T00:00:00Z' }),
  ]);
  await go(page, 'Contacts');
  const names = page.getByRole('list', { name: 'Contacts' }).getByRole('link');
  await expect(names).toHaveText(['Ava Bennett', 'Ben Carter', 'Carla Diaz']);

  await field(page, 'Search contacts').fill('north');
  await expect(names).toHaveText(['Carla Diaz']);
  await field(page, 'Search contacts').fill('VIP');
  await expect(names).toHaveText(['Ben Carter']);
  await field(page, 'Search contacts').fill('');
  await field(page, 'Sort by').selectOption('Recently updated');
  await expect(names).toHaveText(['Ben Carter', 'Carla Diaz', 'Ava Bennett']);
});

test('warns about an exact duplicate email, and still saves', async ({ page }) => {
  const fake = await open(page, [contact('Ava Bennett', { emails: ['ava@example.test'] })]);
  await go(page, 'Contacts');
  await page.getByRole('link', { name: 'New contact' }).click();
  await field(page, 'Name').fill('Ava B.');
  await field(page, 'Email 1').fill('AVA@example.test');
  await expect(page.getByText('Ava Bennett also has AVA@example.test. Duplicates are allowed.')).toBeVisible();
  await page.getByRole('button', { name: 'Save contact' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Ava B.' })).toBeVisible();
  expect(fake.paths().filter((p) => p.startsWith('data/contacts/'))).toHaveLength(2);
});

test('a broken company link is reported, and the contact still opens', async ({ page }) => {
  await open(page, [contact('Ava Bennett', { companyId: 'a28a8fb0-52c6-493d-9a11-99a4f0b8a6cf' })]);
  await openContact(page, 'Ava Bennett');
  await expect(page.getByText('Missing company (ID a28a8fb0).')).toBeVisible();
  await go(page, 'Settings');
  await expect(page.getByRole('list', { name: 'Files that need attention' })).toContainText('companyId: no company with ID a28a8fb0 is in the workspace');
});

// Spec 06, delete: the cascade preview, one commit, and the conflict check, against the fake GitHub.
import { recordPath } from '../src/core/paths.ts';
import { serializeRecord } from '../src/core/record-file.ts';
import { expect, test, type Page } from './fixtures.ts';
import { activity, company, contact, field, go, open, openContact, opportunity, status, task } from './workspace.ts';

const northwind = company('Northwind Traders');
const ava = contact('Ava Bennett', { companyId: northwind.id });
const ben = contact('Ben Carter');
const deal = opportunity('Website rebuild', 'lead', { companyId: northwind.id, contactIds: [ava.id, ben.id] });
const callAva = task('Call Ava', { related: { type: 'contact', id: ava.id } });
const metAva = activity('Met Ava at the launch.', { related: { type: 'contact', id: ava.id } });
const oldNote = activity('An old note about Ava.', { related: { type: 'contact', id: ava.id }, archivedAt: '2026-10-29T13:00:00Z' });
const records = [northwind, ava, ben, deal, callAva, metAva, oldNote];

const pathOf = (record: { type: Parameters<typeof recordPath>[0]; id: string }) => recordPath(record.type, record.id);
const deleteButton = (page: Page, type: string) => page.getByRole('button', { name: `Delete ${type}` });

async function openDelete(page: Page, name: string) {
  await openContact(page, name);
  await page.getByRole('link', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: `Delete ${name}?` })).toBeVisible();
}

test('the delete page lists every change, and one commit deletes the contact, its task and activities, and unlinks the opportunity', async ({ page }) => {
  const fake = await open(page, records);
  await openDelete(page, 'Ava Bennett');
  await expect(page.getByText('This deletes the contact, 1 task, and 2 activities, and unlinks 1 opportunity.')).toBeVisible();
  const deleted = page.getByRole('region', { name: 'Also deleted' });
  await expect(deleted.getByRole('listitem')).toHaveCount(3);
  await expect(deleted).toContainText('Task: Call Ava');
  await expect(deleted.getByRole('listitem').filter({ hasText: 'Archived' })).toHaveCount(1);
  await expect(page.getByRole('region', { name: 'Unlinked' }).getByRole('listitem')).toHaveText(['Opportunity: Website rebuild']);
  await expect(page.getByText('Previous Git versions remain: anyone who can read the repository can still find them in its history.')).toBeVisible();

  const commits = fake.commitCount();
  await deleteButton(page, 'contact').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Contacts' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Contacts' }).getByRole('link')).toHaveText(['Ben Carter']);
  await expect(status(page)).toContainText('Deleted');
  await expect(status(page).getByRole('link', { name: 'View commit' })).toHaveAttribute('href', new RegExp(`/commit/${fake.head}$`));
  expect(fake.commitCount()).toBe(commits + 1);
  expect(fake.lastCommitMessage()).toBe(`gitcrm: delete contact ${ava.id.slice(0, 8)}`);
  for (const record of [ava, callAva, metAva, oldNote]) expect(fake.file(pathOf(record))).toBeUndefined();
  expect(JSON.parse(fake.file(pathOf(deal))!)).toMatchObject({ contactIds: [ben.id], companyId: northwind.id });

  // The app holds the rewritten opportunity at its new blob SHA, so an edit saves without a conflict.
  await go(page, 'Pipeline');
  await page.getByRole('link', { name: 'Website rebuild' }).click();
  await expect(page.getByRole('link', { name: 'Ben Carter' })).toBeVisible();
  await expect(page.getByText('Ava Bennett')).toHaveCount(0);
  await page.getByRole('link', { name: 'Edit', exact: true }).click();
  await field(page, 'Title').fill('Website rebuild, phase 2');
  await page.getByRole('button', { name: 'Save opportunity' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Website rebuild, phase 2' })).toBeVisible();
  expect(JSON.parse(fake.file(pathOf(deal))!)).toMatchObject({ title: 'Website rebuild, phase 2', contactIds: [ben.id] });
});

test('deleting a company clears companyId in its contacts and opportunities, in the same commit', async ({ page }) => {
  const fake = await open(page, records);
  await go(page, 'Companies');
  await page.getByRole('link', { name: 'Northwind Traders' }).click();
  await page.getByRole('link', { name: 'Delete', exact: true }).click();
  await expect(page.getByText('This deletes the company and unlinks 1 contact and 1 opportunity.')).toBeVisible();
  const commits = fake.commitCount();
  await deleteButton(page, 'company').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Companies' })).toBeVisible();
  expect(fake.commitCount()).toBe(commits + 1);
  expect(fake.file(pathOf(northwind))).toBeUndefined();
  expect(JSON.parse(fake.file(pathOf(ava))!)).toMatchObject({ companyId: null, name: 'Ava Bennett' });
  expect(JSON.parse(fake.file(pathOf(deal))!)).toMatchObject({ companyId: null, contactIds: [ava.id, ben.id] });
});

test('an activity has Delete, and after the delete its contact page opens without it', async ({ page }) => {
  const fake = await open(page, records);
  await openContact(page, 'Ava Bennett');
  await page.getByRole('link', { name: /^Delete note from/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: /^Delete the note from/ })).toBeVisible();
  await expect(page.getByText('This deletes the activity.')).toBeVisible();
  await page.getByRole('link', { name: 'Cancel' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Ava Bennett' })).toBeVisible();

  await page.getByRole('link', { name: /^Delete note from/ }).click();
  await deleteButton(page, 'activity').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Ava Bennett' })).toBeVisible();
  await expect(page.getByText('Met Ava at the launch.')).toHaveCount(0);
  expect(fake.file(pathOf(metAva))).toBeUndefined();
  expect(fake.file(pathOf(callAva))).toBeDefined();
});

test('a record added on main after the page listed the changes stops the delete, and the lists then include it', async ({ page }) => {
  const fake = await open(page, records);
  await openDelete(page, 'Ava Bennett');
  const late = task('Send Ava the contract', { related: { type: 'contact', id: ava.id } });
  await fake.seed(pathOf(late), serializeRecord(late));
  const commits = fake.commitCount();

  await deleteButton(page, 'contact').click();
  await expect(page.getByRole('alert')).toContainText('Someone changed the records after this page listed them.');
  await expect(page.getByText('This deletes the contact, 2 tasks, and 2 activities, and unlinks 1 opportunity.')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Also deleted' })).toContainText('Task: Send Ava the contract');
  expect(fake.commitCount()).toBe(commits);
  expect(fake.file(pathOf(ava))).toBeDefined();

  await deleteButton(page, 'contact').click();
  await expect(page.getByRole('heading', { level: 1, name: 'Contacts' })).toBeVisible();
  expect(fake.commitCount()).toBe(commits + 1);
  for (const record of [ava, callAva, late]) expect(fake.file(pathOf(record))).toBeUndefined();
});

test('a file that cannot be read disables Delete, and the page names the file', async ({ page }) => {
  const fake = await open(page, records);
  const bad = recordPath('opportunity', 'ab000000-0000-4000-8000-000000000000');
  await fake.seed(bad, '{ "title": "Half a file"');
  await page.getByRole('button', { name: 'Refresh' }).click();
  await openDelete(page, 'Ben Carter');
  await expect(page.getByText(`1 file cannot be read, so GitCRM cannot tell whether it links to this record: ${bad}`)).toBeVisible();
  await expect(deleteButton(page, 'contact')).toBeDisabled();
});

test('while GitCRM checks GitHub, Delete waits', async ({ page }) => {
  const fake = await open(page, records);
  await openDelete(page, 'Ben Carter');
  let land = () => {};
  const held = new Promise<void>((started) => {
    fake.failNext('GET', /\/git\/ref\/heads\//, { run: () => new Promise<void>((resolve) => ((land = resolve), started())) });
  });
  await page.getByRole('button', { name: 'Refresh' }).click();
  await held;
  await expect(page.getByText('You can delete when GitCRM finishes checking GitHub.')).toBeVisible();
  await expect(deleteButton(page, 'contact')).toBeDisabled();
  land();
  await expect(deleteButton(page, 'contact')).toBeEnabled();
});

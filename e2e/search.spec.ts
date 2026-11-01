// Spec 05, search: every record type, found in memory, against the fake GitHub.
import { expect, test, type Page } from './fixtures.ts';
import { activity, company, contact, field, go, open, opportunity, status, task } from './workspace.ts';

test.use({ timezoneId: 'America/New_York', locale: 'en-US' });

const northwind = company('Northwind Traders', { website: 'https://northwind.example' });
const ava = contact('Ava Bennett', { emails: ['ava@northwind.example', 'ava.b@home.example'], phones: ['+1 555 0100'], companyId: northwind.id });
const deal = opportunity('Website rebuild', 'proposal', { companyId: northwind.id, contactIds: [ava.id], valueMinor: 1_200_000 });
const records = [
  northwind,
  ava,
  contact('Ben Carter', { emails: ['ben@contoso.example'] }),
  contact('Ava Archer', { archivedAt: '2026-10-29T13:00:00Z' }),
  deal,
  task('Send the proposal', { related: { type: 'opportunity', id: deal.id } }),
  activity('Talked about the launch date.\nShe wants it before March.', { kind: 'call', related: { type: 'contact', id: ava.id } }),
];

const results = (page: Page, group: string) => page.getByRole('main').getByRole('list', { name: group });
const summary = (page: Page) => page.getByRole('main').getByRole('status');

async function searchFor(page: Page, query: string) {
  await go(page, 'Search');
  await expect(page.getByRole('heading', { level: 1, name: 'Search' })).toBeVisible();
  await field(page, 'Search records').fill(query);
}

test('a name or email fragment finds the contact, with its company and first email, and no request leaves the browser', async ({ page }) => {
  const fake = await open(page, records);
  const requests = fake.requests.length;
  await searchFor(page, 'ava@north');
  await expect(results(page, 'Contacts').getByRole('listitem')).toHaveCount(1);
  await expect(results(page, 'Contacts').getByRole('link', { name: 'Ava Bennett' })).toBeVisible();
  await expect(results(page, 'Contacts')).toContainText('Northwind Traders · ava@northwind.example');

  await field(page, 'Search records').fill('BENN');
  await expect(results(page, 'Contacts').getByRole('link', { name: 'Ava Bennett' })).toBeVisible();
  expect(fake.requests).toHaveLength(requests);
});

test('a company name finds the company and its opportunity, and the record type narrows the results', async ({ page }) => {
  await open(page, records);
  await searchFor(page, 'northwind');
  await expect(results(page, 'Companies').getByRole('link', { name: 'Northwind Traders' })).toBeVisible();
  await expect(results(page, 'Opportunities').getByRole('link', { name: 'Website rebuild' })).toBeVisible();
  await expect(results(page, 'Opportunities')).toContainText('Proposal · Northwind Traders · $12,000.00');
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Contacts', 'Companies', 'Opportunities']);

  await page.getByLabel('Record type').selectOption('Opportunities');
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(['Opportunities']);
  await expect(summary(page)).toHaveText('1 record');

  await results(page, 'Opportunities').getByRole('link', { name: 'Website rebuild' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Website rebuild' })).toBeVisible();
});

test('a task and an activity are found by their related record, and show as they do on a record page', async ({ page }) => {
  await open(page, records);
  await searchFor(page, 'website rebuild');
  const followUp = results(page, 'Tasks');
  await expect(followUp.getByRole('checkbox', { name: 'Complete Send the proposal' })).toBeEnabled();
  await expect(followUp).toContainText('For Website rebuild');

  await field(page, 'Search records').fill('ava bennett');
  const calls = results(page, 'Activities');
  await expect(calls).toContainText('Call');
  await expect(calls).toContainText('Talked about the launch date.\nShe wants it before March.', { useInnerText: true });
  await expect(calls.getByRole('link', { name: 'Ava Bennett' })).toBeVisible();
  await expect(calls.getByRole('button', { name: /^Archive call/ })).toBeEnabled();
  await calls.getByRole('link', { name: /^Edit call/ }).click();
  await expect(field(page, 'What happened')).toHaveValue('Talked about the launch date.\nShe wants it before March.');
});

test('with "All types", a group shows its first 10 results, and "Show all" chooses its record type', async ({ page }) => {
  const team = Array.from({ length: 12 }, (_, i) => contact(`Team member ${String(i + 1).padStart(2, '0')}`, { companyId: northwind.id }));
  await open(page, [...records, ...team]);
  await searchFor(page, 'team member');
  await expect(results(page, 'Contacts').getByRole('listitem')).toHaveCount(10);
  await expect(page.getByText('Showing 10 of 12 contacts.')).toBeVisible();
  await expect(summary(page)).toHaveText('12 records');

  await page.getByRole('button', { name: 'Show all 12 contacts' }).click();
  await expect(page.getByLabel('Record type')).toHaveValue('contact');
  await expect(results(page, 'Contacts').getByRole('listitem')).toHaveCount(12);
  await expect(page.getByRole('heading', { level: 2, name: 'Contacts' })).toBeFocused();
  await expect(page.getByRole('button', { name: /^Show all/ })).toHaveCount(0);
});

test('archived records are hidden and counted until "Show archived"', async ({ page }) => {
  await open(page, records);
  await searchFor(page, 'ava');
  await expect(summary(page)).toHaveText('3 records. 1 archived record hidden.');
  await expect(results(page, 'Contacts').getByRole('link')).toHaveText(['Ava Bennett']);

  await page.getByRole('checkbox', { name: 'Show archived' }).click();
  await expect(summary(page)).toHaveText('4 records');
  await expect(results(page, 'Contacts').getByRole('link')).toHaveText(['Ava Archer', 'Ava Bennett']);
  await expect(results(page, 'Contacts').getByRole('listitem').first()).toContainText('Archived');
});

test('an empty search shows no results and says what to search for', async ({ page }) => {
  await open(page, records);
  await searchFor(page, 'ava');
  await expect(results(page, 'Contacts')).toBeVisible();
  await field(page, 'Search records').fill(' ');
  await expect(page.getByRole('main').getByRole('list')).toHaveCount(0);
  await expect(page.getByText('Search by name, email, phone, tag, title, or what happened.')).toBeVisible();

  await field(page, 'Search records').fill('zzz');
  await expect(summary(page)).toHaveText('0 records');
});

test('the results follow a save, and the search is still there after a result and Back', async ({ page }) => {
  await open(page, records);
  await searchFor(page, 'ava');
  await results(page, 'Contacts').getByRole('link', { name: 'Ava Bennett' }).click();
  await page.getByRole('link', { name: 'Edit', exact: true }).click();
  await field(page, 'Name').fill('Ava Lopez');
  await page.getByRole('button', { name: 'Save contact' }).click();
  await expect(status(page)).toHaveText('Saved · View commit');

  await go(page, 'Search');
  await expect(field(page, 'Search records')).toHaveValue('ava');
  await expect(results(page, 'Contacts').getByRole('link')).toHaveText(['Ava Lopez']);
  await expect(results(page, 'Opportunities')).toContainText('Website rebuild');

  await results(page, 'Contacts').getByRole('link', { name: 'Ava Lopez' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Ava Lopez' })).toBeVisible();
  await page.goBack();
  await expect(field(page, 'Search records')).toHaveValue('ava');
  await expect(results(page, 'Contacts').getByRole('link')).toHaveText(['Ava Lopez']);
});

test('the search text never enters the page address, and Disconnect clears it', async ({ page }) => {
  const fake = await open(page, records);
  await searchFor(page, 'ava bennett');
  await expect(results(page, 'Contacts')).toBeVisible();
  expect(new URL(page.url()).hash).toBe('#/search');

  await go(page, 'Settings');
  await page.getByRole('button', { name: 'Disconnect' }).click();
  await page.getByRole('button', { name: 'Confirm disconnect' }).click();
  // Connect again in the same page, without a reload that would clear memory anyway.
  await page.getByLabel('Repository', { exact: true }).fill(`${fake.owner}/${fake.repo}`);
  await page.getByLabel('Fine-grained personal access token').fill(fake.token);
  await page.getByRole('button', { name: 'Connect' }).click();
  await go(page, 'Search');
  await expect(page.getByRole('heading', { level: 1, name: 'Search' })).toBeVisible();
  await expect(field(page, 'Search records')).toHaveValue('');
});

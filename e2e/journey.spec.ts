// The Phase 2 exit journey (docs/11): company -> contact -> opportunity -> note -> follow-up task,
// through the UI only, in an empty workspace on the fake GitHub. A reload then shows it all again.
import { expect, test } from './fixtures.ts';
import { field, go, homeHeading, open, status } from './workspace.ts';

test.use({ timezoneId: 'America/New_York', locale: 'en-US' });

test('company -> contact -> opportunity -> note -> follow-up task, and it all stays after a reload', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-29T15:00:00Z'));
  const fake = await open(page);
  const heading = (name: string) => page.getByRole('heading', { level: 1, name });
  const saved = () => expect(status(page)).toHaveText('Saved · View commit');

  await go(page, 'Companies');
  await page.getByRole('link', { name: 'New company' }).click();
  await field(page, 'Name').fill('Northwind Traders');
  await page.getByRole('button', { name: 'Save company' }).click();
  await expect(heading('Northwind Traders')).toBeVisible();
  await saved();

  await page.getByRole('link', { name: 'Add contact' }).click();
  await field(page, 'Name').fill('Ava Bennett');
  await page.getByRole('button', { name: 'Save contact' }).click();
  await expect(heading('Ava Bennett')).toBeVisible();
  await saved();

  // From the contact page, the opportunity gets the contact and the contact's company.
  await page.getByRole('link', { name: 'Add opportunity' }).click();
  await field(page, 'Title').fill('Website rebuild');
  await field(page, 'Stage').selectOption({ label: 'Proposal' });
  await field(page, 'Value').fill('2500');
  await expect(field(page, 'Company').locator('option:checked')).toHaveText('Northwind Traders');
  await expect(page.getByRole('list', { name: 'Chosen contacts' })).toContainText('Ava Bennett');
  await page.getByRole('button', { name: 'Save opportunity' }).click();
  await expect(heading('Website rebuild')).toBeVisible();
  await saved();

  await page.getByRole('link', { name: 'Log activity' }).click();
  await field(page, 'What happened').fill('Discussed the scope. Ava wants a revised quote.');
  await page.getByRole('button', { name: 'Save activity' }).click();
  await expect(heading('Website rebuild')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Activity with Website rebuild' })).toContainText('Ava wants a revised quote.');
  await saved();

  await page.getByRole('link', { name: 'Add task' }).click();
  await field(page, 'Title').fill('Send revised proposal');
  await field(page, 'Due date').fill('2026-11-02');
  await page.getByRole('button', { name: 'Save task' }).click();
  await expect(heading('Send revised proposal')).toBeVisible();
  await saved();

  // Five records, five commits, and every link points at the record it should.
  const files = Object.fromEntries(
    fake
      .paths()
      .filter((p) => p.startsWith('data/'))
      .map((p) => [p.split('/')[1], JSON.parse(fake.file(p)!)]),
  );
  expect(Object.keys(files).sort()).toEqual(['activities', 'companies', 'contacts', 'opportunities', 'tasks']);
  const { companies: northwind, contacts: ava, opportunities: deal, activities: note, tasks: followUp } = files;
  expect(ava.companyId).toBe(northwind.id);
  expect(deal).toMatchObject({ stageId: 'proposal', valueMinor: 250000, currency: 'USD', companyId: northwind.id, contactIds: [ava.id] });
  expect(note).toMatchObject({ kind: 'note', occurredAt: '2026-10-29T15:00:00Z', related: { type: 'opportunity', id: deal.id } });
  expect(followUp).toMatchObject({ dueDate: '2026-11-02', completedAt: null, related: { type: 'opportunity', id: deal.id } });
  expect(fake.requests.filter((r) => r.method === 'PUT')).toHaveLength(5);

  // The reload keeps the address, so the task page loads again from the remembered token.
  await page.reload();
  await expect(heading('Send revised proposal')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Website rebuild' })).toBeVisible();
  await go(page, 'Home');
  await expect(homeHeading(page)).toBeVisible();
  await expect(page.getByRole('list', { name: 'Recent activity' })).toContainText('with Website rebuild');
  await go(page, 'Tasks');
  await expect(page.getByRole('region', { name: 'Upcoming' })).toContainText('For Website rebuild');
  await page.getByRole('link', { name: 'Website rebuild' }).click();
  await expect(heading('Website rebuild')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Northwind Traders' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Tasks for Website rebuild' })).toContainText('Send revised proposal');
  await expect(page.getByRole('list', { name: 'Activity with Website rebuild' })).toContainText('Ava wants a revised quote.');
  await page.getByRole('link', { name: 'Ava Bennett' }).click();
  await expect(page.getByRole('list', { name: 'Opportunities with Ava Bennett' })).toContainText('Website rebuild');
});

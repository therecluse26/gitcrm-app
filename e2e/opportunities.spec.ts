// Spec 03 (opportunities and pipeline) and the stage editor (ADR-019), against the fake GitHub.
import { recordPath, WORKSPACE_PATH } from '../src/core/paths.ts';
import { serializeRecord, serializeWorkspace } from '../src/core/record-file.ts';
import type { CRMRecord } from '../src/core/schemas.ts';
import { newWorkspaceConfig } from '../src/core/workspace.ts';
import type { FakeGitHub } from '../src/test/fake-github.ts';
import { expect, test, type Page } from './fixtures.ts';
import { company, contact, field, go, open, opportunity, status } from './workspace.ts';

const writes = (fake: FakeGitHub) => fake.requests.filter((r) => r.method === 'PUT');
const fileOf = (fake: FakeGitHub, record: CRMRecord) => JSON.parse(fake.file(recordPath(record.type, record.id))!);
const stagesOf = (fake: FakeGitHub) => JSON.parse(fake.file(WORKSPACE_PATH)!).pipelineStages as { id: string; label: string; position: number }[];
// A board column, by stage name.
const column = (page: Page, name: string) => page.getByRole('region', { name, exact: true });
const titlesIn = (page: Page, name: string) => column(page, name).getByRole('listitem').getByRole('link');
const moveMenu = (page: Page, title: string) => page.getByLabel(`Move ${title} to stage`);
const stagesCard = (page: Page) => page.getByRole('region', { name: 'Pipeline stages' });

async function openPipeline(page: Page) {
  await go(page, 'Pipeline');
  await expect(page.getByRole('heading', { level: 1, name: 'Pipeline' })).toBeVisible();
}

async function openStages(page: Page) {
  await go(page, 'Settings');
  await expect(stagesCard(page)).toBeVisible();
}

test('creates "Website rebuild" in Proposal for $2500.00 USD, stored as stageId "proposal" and valueMinor 250000', async ({ page }) => {
  const northwind = company('Northwind Traders');
  const ava = contact('Ava Bennett', { companyId: northwind.id });
  const fake = await open(page, [northwind, ava]);
  await openPipeline(page);
  await page.getByRole('link', { name: 'New opportunity' }).click();
  await field(page, 'Title').fill('Website rebuild');
  await field(page, 'Stage').selectOption({ label: 'Proposal' });
  await field(page, 'Value').fill('2500.00');
  await expect(field(page, 'Currency')).toHaveValue('USD');
  await field(page, 'Company').selectOption({ label: 'Northwind Traders' });
  await field(page, 'Add a contact').selectOption({ label: 'Ava Bennett (Northwind Traders)' });
  await page.getByRole('button', { name: 'Save opportunity' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Website rebuild' })).toBeVisible();
  await expect(status(page)).toHaveText('Saved · View commit');
  const [path] = fake.paths().filter((p) => p.startsWith('data/opportunities/'));
  expect(JSON.parse(fake.file(path)!)).toMatchObject({ type: 'opportunity', title: 'Website rebuild', stageId: 'proposal', valueMinor: 250000, currency: 'USD', companyId: northwind.id, contactIds: [ava.id] });
  expect(fake.lastCommitMessage()).toMatch(/^gitcrm: create opportunity [0-9a-f]{8}$/);

  await openPipeline(page);
  await expect(titlesIn(page, 'Proposal')).toHaveText(['Website rebuild']);
  await expect(column(page, 'Proposal')).toContainText('$2,500.00');
  await expect(column(page, 'Proposal')).toContainText('Northwind Traders · Ava Bennett');
  // Won and Lost carry a text cue, not only a different look (docs/08).
  await expect(column(page, 'Won')).toContainText('Closed');
  await expect(column(page, 'Proposal')).not.toContainText('Closed');
});

test('moving to Qualified updates only that opportunity, and the stage stays after a reload', async ({ page }) => {
  const deal = opportunity('Website rebuild', 'lead');
  const other = opportunity('Logo refresh', 'lead');
  const fake = await open(page, [deal, other]);
  const otherFile = fake.file(recordPath('opportunity', other.id));
  await openPipeline(page);
  let land = () => {};
  fake.failNext('PUT', /\/contents\//, { run: () => new Promise<void>((resolve) => (land = resolve)) });
  await moveMenu(page, 'Website rebuild').selectOption({ label: 'Qualified' });

  // Pending: the card shows in its new stage until the commit lands.
  await expect(titlesIn(page, 'Qualified')).toHaveText(['Website rebuild']);
  await expect(column(page, 'Qualified')).toContainText('Moving…');
  await expect(moveMenu(page, 'Logo refresh')).toBeDisabled();
  land();
  await expect(status(page)).toHaveText('Saved · View commit');
  await expect(column(page, 'Qualified')).not.toContainText('Moving…');
  expect(writes(fake).map((w) => w.path)).toEqual([`/repos/octo-dev/crm/contents/${recordPath('opportunity', deal.id)}`]);
  expect(fileOf(fake, deal).stageId).toBe('qualified');
  expect(fake.file(recordPath('opportunity', other.id))).toBe(otherFile);

  await page.reload();
  await expect(titlesIn(page, 'Qualified')).toHaveText(['Website rebuild']);
  await expect(titlesIn(page, 'Lead')).toHaveText(['Logo refresh']);
});

test('moves an opportunity with the keyboard only, through its Move to stage menu', async ({ page }) => {
  const deal = opportunity('Website rebuild', 'lead');
  const fake = await open(page, [deal]);
  await openPipeline(page);
  await moveMenu(page, 'Website rebuild').focus();
  await page.keyboard.press('ArrowDown');
  await expect(titlesIn(page, 'Qualified')).toHaveText(['Website rebuild']);
  await expect.poll(() => fileOf(fake, deal).stageId).toBe('qualified');
});

test('drag and drop moves an opportunity to another column', async ({ page }) => {
  const deal = opportunity('Website rebuild', 'lead');
  const fake = await open(page, [deal]);
  await openPipeline(page);
  await titlesIn(page, 'Lead').first().dragTo(column(page, 'Proposal'));
  await expect(titlesIn(page, 'Proposal')).toHaveText(['Website rebuild']);
  await expect.poll(() => fileOf(fake, deal).stageId).toBe('proposal');
});

test('a failed move puts the card back and says why', async ({ page }) => {
  const deal = opportunity('Website rebuild', 'lead');
  const fake = await open(page, [deal]);
  await openPipeline(page);
  fake.failNext('PUT', /\/contents\//, { network: 'before' });
  await moveMenu(page, 'Website rebuild').selectOption({ label: 'Won' });

  await expect(page.getByRole('alert')).toContainText('Website rebuild was not moved. Could not reach GitHub.');
  await expect(titlesIn(page, 'Lead')).toHaveText(['Website rebuild']);
  await expect(titlesIn(page, 'Won')).toHaveCount(0);
  expect(fileOf(fake, deal).stageId).toBe('lead');
});

test('a move after someone else changed the opportunity is not saved, and the board shows their version', async ({ page }) => {
  const deal = opportunity('Website rebuild', 'lead');
  const fake = await open(page, [deal]);
  await openPipeline(page);
  fake.failNext('PUT', /\/contents\//, {
    run: async () => void (await fake.seed(recordPath('opportunity', deal.id), serializeRecord({ ...deal, title: 'Website rebuild and hosting', updatedAt: '2026-10-29T13:00:00Z' }))),
  });
  await moveMenu(page, 'Website rebuild').selectOption({ label: 'Proposal' });

  await expect(page.getByRole('alert')).toContainText('Website rebuild was not moved. Someone else changed it after it was loaded.');
  await expect(titlesIn(page, 'Lead')).toHaveText(['Website rebuild and hosting']);
  expect(fileOf(fake, deal)).toMatchObject({ title: 'Website rebuild and hosting', stageId: 'lead' });
});

test('a retry after a conflict keeps my amount with my currency, and their other changes', async ({ page }) => {
  const deal = opportunity('Website rebuild', 'lead', { valueMinor: 250000 });
  const fake = await open(page, [deal]);
  await page.goto(`/#/opportunities/${deal.id}/edit`);
  await field(page, 'Value').fill('3000');
  // Someone else changes the title and the currency while the form is open.
  await fake.seed(recordPath('opportunity', deal.id), serializeRecord({ ...deal, title: 'Website rebuild and hosting', currency: 'JPY', updatedAt: '2026-10-29T13:00:00Z' }));
  await page.getByRole('button', { name: 'Save opportunity' }).click();
  await page.getByRole('button', { name: 'Retry after review' }).click();

  await expect(status(page)).toHaveText('Saved · View commit');
  expect(fileOf(fake, deal)).toMatchObject({ title: 'Website rebuild and hosting', valueMinor: 300000, currency: 'USD' });
});

test('the list view moves opportunities with the same menu', async ({ page }) => {
  const deal = opportunity('Website rebuild', 'lead', { valueMinor: 250000 });
  const fake = await open(page, [deal]);
  await openPipeline(page);
  await field(page, 'View').selectOption('List');
  const row = page.getByRole('table', { name: 'Opportunities' }).getByRole('row', { name: /Website rebuild/ });
  await expect(row).toContainText('$2,500.00');
  await moveMenu(page, 'Website rebuild').selectOption({ label: 'Proposal' });
  await expect.poll(() => fileOf(fake, deal).stageId).toBe('proposal');
  await expect(moveMenu(page, 'Website rebuild')).toHaveValue('proposal');
});

test('"Open only" hides Won and Lost, and archived opportunities show on request', async ({ page }) => {
  await open(page, [opportunity('Audit', 'won'), opportunity('Website rebuild', 'lead'), opportunity('Old pitch', 'lead', { archivedAt: '2026-10-29T12:00:00Z' })]);
  await openPipeline(page);
  await expect(page.getByText('2 opportunities. 1 archived opportunity hidden.')).toBeVisible();
  await field(page, 'Show').selectOption('Open only');
  await expect(column(page, 'Won')).toHaveCount(0);
  await expect(column(page, 'Lost')).toHaveCount(0);
  await page.getByText('Show archived').click();
  await expect(titlesIn(page, 'Lead')).toHaveText(['Old pitch', 'Website rebuild']);
});

test('renaming Proposal to "Quote sent" changes only .gitcrm/workspace.json, in one commit', async ({ page }) => {
  const fake = await open(page, [opportunity('Website rebuild', 'proposal')]);
  const commits = fake.commitCount();
  await openStages(page);
  await stagesCard(page).getByLabel('Name of stage 3').fill('Quote sent');
  await expect(stagesCard(page)).toContainText('Unsaved changes');
  await stagesCard(page).getByRole('button', { name: 'Save stages' }).click();

  await expect(status(page)).toHaveText('Saved · View commit');
  expect(fake.commitCount()).toBe(commits + 1);
  expect(writes(fake).map((w) => w.path)).toEqual([`/repos/octo-dev/crm/contents/${WORKSPACE_PATH}`]);
  expect(stagesOf(fake).find((s) => s.id === 'proposal')?.label).toBe('Quote sent');
  await openPipeline(page);
  await expect(titlesIn(page, 'Quote sent')).toHaveText(['Website rebuild']);
});

test('removing a stage in use is blocked with its count, and Won and Lost offer no Remove', async ({ page }) => {
  const fake = await open(page, [opportunity('Website rebuild', 'qualified'), opportunity('Old pitch', 'qualified', { archivedAt: '2026-10-29T12:00:00Z' })]);
  await openStages(page);
  await stagesCard(page).getByRole('button', { name: 'Remove Qualified' }).click();
  await expect(stagesCard(page)).toContainText('Qualified has 2 opportunities, 1 of them archived, so it cannot be removed. Move them to another stage first.');
  await expect(stagesCard(page).getByRole('button', { name: 'Remove Won' })).toHaveCount(0);
  await expect(stagesCard(page).getByRole('button', { name: 'Remove Lost' })).toHaveCount(0);

  await stagesCard(page).getByRole('button', { name: 'Remove Lead' }).click();
  await stagesCard(page).getByRole('button', { name: 'Save stages' }).click();
  await expect(status(page)).toHaveText('Saved · View commit');
  expect(stagesOf(fake).map((s) => [s.id, s.position])).toEqual([
    ['qualified', 0],
    ['proposal', 1],
    ['won', 2],
    ['lost', 3],
  ]);
});

test('adds a stage and moves it up, saved in one commit', async ({ page }) => {
  const fake = await open(page);
  const commits = fake.commitCount();
  await openStages(page);
  await stagesCard(page).getByLabel('New stage name').fill('Negotiation');
  await stagesCard(page).getByRole('button', { name: 'Add stage' }).click();
  await stagesCard(page).getByRole('button', { name: 'Move Negotiation up' }).click();
  await stagesCard(page).getByRole('button', { name: 'Save stages' }).click();
  await expect(status(page)).toHaveText('Saved · View commit');
  expect(fake.commitCount()).toBe(commits + 1);
  expect(stagesOf(fake).map((s) => s.id)).toEqual(['lead', 'qualified', 'negotiation', 'proposal', 'won', 'lost']);
  await openPipeline(page);
  await expect(column(page, 'Negotiation')).toBeVisible();
});

test('a stage edit after someone else changed the settings is not saved, until the latest stages are loaded', async ({ page }) => {
  const fake = await open(page);
  await openStages(page);
  const theirs = { ...newWorkspaceConfig({ name: 'Example Studio', defaultCurrency: 'USD' }) };
  theirs.pipelineStages = theirs.pipelineStages.map((s) => (s.id === 'lead' ? { ...s, label: 'Inbound' } : s));
  fake.failNext('PUT', /\/contents\//, { run: async () => void (await fake.seed(WORKSPACE_PATH, serializeWorkspace(theirs))) });
  await stagesCard(page).getByLabel('Name of stage 3').fill('Quote sent');
  await stagesCard(page).getByRole('button', { name: 'Save stages' }).click();

  await expect(stagesCard(page)).toContainText('Someone else changed the workspace settings, so your stage changes were not saved.');
  expect(stagesOf(fake).find((s) => s.id === 'proposal')?.label).toBe('Proposal');
  await expect(stagesCard(page).getByRole('button', { name: 'Save stages' })).toBeDisabled();
  await stagesCard(page).getByRole('button', { name: 'Load the latest stages' }).click();
  await expect(stagesCard(page).getByLabel('Name of stage 1')).toHaveValue('Inbound');
  await expect(stagesCard(page).getByLabel('Name of stage 3')).toHaveValue('Proposal');
});

test('a chosen contact that left the workspace is refused on save (spec 03, "Missing relation")', async ({ page }) => {
  const ava = contact('Ava Bennett');
  const fake = await open(page, [ava]);
  await openPipeline(page);
  await page.getByRole('link', { name: 'New opportunity' }).click();
  await field(page, 'Title').fill('Website rebuild');
  await field(page, 'Add a contact').selectOption({ label: 'Ava Bennett' });
  await expect(page.getByRole('list', { name: 'Chosen contacts' })).toContainText('Ava Bennett');

  fake.remove(recordPath('contact', ava.id));
  await page.getByRole('button', { name: 'Refresh' }).click();
  await expect(page.getByRole('list', { name: 'Chosen contacts' })).toContainText(`Missing contact (ID ${ava.id.slice(0, 8)})`);
  await page.getByRole('button', { name: 'Save opportunity' }).click();
  await expect(page.getByText('A chosen contact is no longer in the workspace. Remove it, then save.')).toBeVisible();
  expect(writes(fake)).toEqual([]);
});

test('amounts follow the currency’s decimal places', async ({ page }) => {
  const fake = await open(page);
  await openPipeline(page);
  await page.getByRole('link', { name: 'New opportunity' }).click();
  await field(page, 'Title').fill('Tokyo launch');
  await field(page, 'Currency').fill('JPY');
  await field(page, 'Value').fill('2500.5');
  await page.getByRole('button', { name: 'Save opportunity' }).click();
  await expect(page.getByText('JPY amounts have no decimal places.')).toBeVisible();
  await expect(field(page, 'Value')).toBeFocused();

  await field(page, 'Value').fill('2,500');
  await page.getByRole('button', { name: 'Save opportunity' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Tokyo launch' })).toBeVisible();
  await expect(page.getByText('¥2,500')).toBeVisible();
  const [path] = fake.paths().filter((p) => p.startsWith('data/opportunities/'));
  expect(JSON.parse(fake.file(path)!)).toMatchObject({ valueMinor: 2500, currency: 'JPY' });
});

test('an opportunity in a stage that no longer exists shows in its own column and in Settings', async ({ page }) => {
  await open(page, [opportunity('Lost track', 'negotiation')]);
  await openPipeline(page);
  await expect(titlesIn(page, 'Unknown stage')).toHaveText(['Lost track']);
  await go(page, 'Settings');
  await expect(page.getByRole('list', { name: 'Files that need attention' })).toContainText('stageId: no stage "negotiation" is in .gitcrm/workspace.json');
});

test('a read-only token cannot add or move opportunities, or edit stages', async ({ page }) => {
  await open(page, [opportunity('Website rebuild', 'lead')], { canWrite: false });
  await openPipeline(page);
  await expect(page.getByRole('link', { name: 'New opportunity' })).toHaveCount(0);
  await expect(moveMenu(page, 'Website rebuild')).toBeDisabled();
  await openStages(page);
  await expect(stagesCard(page).getByRole('textbox')).toHaveCount(0);
  await expect(stagesCard(page)).toContainText('Lead');
});

test('a company page lists its opportunities, and "Add opportunity" fills in the company', async ({ page }) => {
  const northwind = company('Northwind Traders');
  await open(page, [northwind, opportunity('Website rebuild', 'lead', { companyId: northwind.id, valueMinor: 250000 })]);
  await go(page, 'Companies');
  await page.getByRole('link', { name: 'Northwind Traders' }).click();
  await expect(page.getByRole('list', { name: 'Opportunities with Northwind Traders' })).toContainText('Website rebuild');
  await page.getByRole('link', { name: 'Add opportunity' }).click();
  await expect(field(page, 'Company')).toHaveValue(northwind.id);
});

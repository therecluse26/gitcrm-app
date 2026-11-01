// Spec 10 (custom fields), against the fake GitHub: the Settings card, the three forms, the
// record pages, search, and the values that a save must keep.
import { withCustomFields, type CustomField, type CustomFieldSets } from '../src/core/custom-fields.ts';
import { recordPath, WORKSPACE_PATH } from '../src/core/paths.ts';
import { serializeRecord, serializeWorkspace } from '../src/core/record-file.ts';
import type { CRMRecord } from '../src/core/schemas.ts';
import type { FakeGitHub } from '../src/test/fake-github.ts';
import { expect, test } from './fixtures.ts';
import { company, contact, exampleConfig, field, go, open, openContact, opportunity, status } from './workspace.ts';

const writes = (fake: FakeGitHub) => fake.requests.filter((r) => r.method === 'PUT');
const fileOf = (fake: FakeGitHub, record: CRMRecord) => JSON.parse(fake.file(recordPath(record.type, record.id))!);
const settingsFile = (fake: FakeGitHub) => JSON.parse(fake.file(WORKSPACE_PATH)!);

const def = (id: string, label: string, type: CustomField['type'], changes: Partial<CustomField> = {}): CustomField => ({ id, label, type, position: 0, archived: false, options: [], ...changes });
const linkedin = def('linkedin', 'LinkedIn', 'url');
const source = def('lead-source', 'Lead source', 'select', {
  position: 1,
  options: [
    { id: 'conference', label: 'Conference', archived: false },
    { id: 'referral', label: 'Referral', archived: false },
    { id: 'fair', label: 'Trade fair', archived: true },
  ],
});
const employees = def('employees', 'Employees', 'number', { position: 2 });
const withFields = (sets: Partial<CustomFieldSets>) => withCustomFields(exampleConfig(), { contact: [], company: [], opportunity: [], ...sets });
const contactFields = withFields({ contact: [linkedin, source, employees] });

// A Detail row on a record page: the label, then the value.
const detail = (page: import('@playwright/test').Page, label: string) => page.locator('dl > div').filter({ has: page.getByText(label, { exact: true }) });

test('adds contact fields in Settings, in one commit to the settings file only, with schemaVersion 2', async ({ page }) => {
  const fake = await open(page, [contact('Ava Bennett')]);
  await go(page, 'Settings');
  const fields = page.getByRole('region', { name: 'Contact fields' });
  await fields.getByLabel('New contact field name').fill('LinkedIn');
  await fields.getByLabel('Type').selectOption({ label: 'Web address' });
  await fields.getByRole('button', { name: 'Add field' }).click();
  await fields.getByLabel('New contact field name').fill('Lead source');
  await fields.getByLabel('Type').selectOption({ label: 'Choice list' });
  await fields.getByLabel('New contact field name').press('Enter');
  await fields.getByLabel('New option of Lead source').fill('Conference');
  await fields.getByRole('button', { name: 'Add option' }).click();
  await fields.getByLabel('New option of Lead source').fill('Referral');
  await fields.getByLabel('New option of Lead source').press('Enter');
  // A taken name is refused before it reaches the draft.
  await fields.getByLabel('New contact field name').fill('linkedin');
  await fields.getByRole('button', { name: 'Add field' }).click();
  await expect(fields.getByText('Another contact field is already called "LinkedIn".')).toBeVisible();
  // A field or option that was never saved is dropped, not kept as removed.
  await fields.getByLabel('New contact field name').fill('Temp');
  await fields.getByLabel('New contact field name').press('Enter');
  await fields.getByRole('button', { name: 'Remove Temp' }).click();
  await fields.getByLabel('New option of Lead source').fill('Other');
  await fields.getByLabel('New option of Lead source').press('Enter');
  await fields.getByRole('button', { name: 'Remove option Other of Lead source' }).click();
  await expect(fields.getByRole('button', { name: /^Restore/ })).toHaveCount(0);
  // Rename and reorder; the ID stays.
  await fields.getByRole('button', { name: 'Move Lead source up' }).click();
  await fields.getByLabel('Name of contact field 2').fill('LinkedIn profile');

  const commits = fake.commitCount();
  await page.getByRole('button', { name: 'Save custom fields' }).click();
  await expect(status(page)).toHaveText('Saved · View commit');
  expect(fake.commitCount()).toBe(commits + 1);
  expect(writes(fake).map((w) => w.path)).toEqual([`/repos/octo-dev/crm/contents/${WORKSPACE_PATH}`]);
  expect(settingsFile(fake)).toMatchObject({
    schemaVersion: 2,
    customFields: {
      contact: [
        {
          id: 'lead-source',
          label: 'Lead source',
          type: 'select',
          position: 0,
          archived: false,
          options: [
            { id: 'conference', label: 'Conference', archived: false },
            { id: 'referral', label: 'Referral', archived: false },
          ],
        },
        { id: 'linkedin', label: 'LinkedIn profile', type: 'url', position: 1, archived: false, options: [] },
      ],
      company: [],
      opportunity: [],
    },
  });
  expect(settingsFile(fake).customFields.contact).toHaveLength(2);
});

test("fills in a contact's custom fields, and the contact page shows them", async ({ page }) => {
  const ava = contact('Ava Bennett');
  const fake = await open(page, [ava], {}, contactFields);
  await openContact(page, 'Ava Bennett');
  await expect(detail(page, 'Lead source')).toHaveText('Lead sourceNone');
  await page.getByRole('link', { name: 'Edit' }).click();
  await field(page, 'LinkedIn').fill('linkedin.com/in/ava');
  await field(page, 'Lead source').selectOption({ label: 'Referral' });
  await expect(field(page, 'Lead source').getByRole('option')).toHaveText(['None', 'Conference', 'Referral']);
  await page.getByRole('button', { name: 'Save contact' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Ava Bennett' })).toBeVisible();
  await expect(detail(page, 'LinkedIn').getByRole('link', { name: 'https://linkedin.com/in/ava' })).toHaveAttribute('href', 'https://linkedin.com/in/ava');
  await expect(detail(page, 'Lead source')).toHaveText('Lead sourceReferral');
  expect(fileOf(fake, ava).customFields).toEqual({ 'lead-source': 'referral', linkedin: 'https://linkedin.com/in/ava' });
  expect(fake.file(recordPath('contact', ava.id))).toContain('"customFields": {\n    "lead-source": "referral",\n    "linkedin"');
});

test('a number with a comma is refused, and nothing is written', async ({ page }) => {
  const fake = await open(page, [contact('Ava Bennett')], {}, contactFields);
  await openContact(page, 'Ava Bennett');
  await page.getByRole('link', { name: 'Edit' }).click();
  await field(page, 'Employees').fill('1,200');
  await page.getByRole('button', { name: 'Save contact' }).click();
  await expect(page.getByText('Enter a number with a period for decimals, such as 1200 or 3.5.')).toBeVisible();
  await expect(field(page, 'Employees')).toBeFocused();
  expect(writes(fake)).toEqual([]);
});

test('removing a field hides it and keeps its values; restoring it shows them again', async ({ page }) => {
  const ava = contact('Ava Bennett', { phones: ['555-0100'], customFields: { 'lead-source': 'referral' } });
  const fake = await open(page, [ava], {}, contactFields);
  await go(page, 'Settings');
  await page.getByRole('button', { name: 'Remove Lead source' }).click();
  await page.getByRole('button', { name: 'Save custom fields' }).click();
  await expect(status(page)).toHaveText('Saved · View commit');
  expect(settingsFile(fake).customFields.contact.find((f: CustomField) => f.id === 'lead-source')).toMatchObject({ archived: true, position: 2 });

  await openContact(page, 'Ava Bennett');
  await expect(detail(page, 'Lead source')).toHaveCount(0);
  await page.getByRole('link', { name: 'Edit' }).click();
  await expect(field(page, 'Lead source')).toHaveCount(0);
  await field(page, 'Phone 1').fill('555-0199');
  await page.getByRole('button', { name: 'Save contact' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Ava Bennett' })).toBeVisible();
  expect(fileOf(fake, ava)).toMatchObject({ phones: ['555-0199'], customFields: { 'lead-source': 'referral' } });

  await go(page, 'Settings');
  await page.getByRole('button', { name: 'Restore Lead source' }).click();
  await page.getByRole('button', { name: 'Save custom fields' }).click();
  await expect(status(page)).toHaveText('Saved · View commit');
  await openContact(page, 'Ava Bennett');
  await expect(detail(page, 'Lead source')).toHaveText('Lead sourceReferral');
});

test('a save keeps the values of removed fields and options, and values that do not fit', async ({ page }) => {
  const stored = { 'lead-source': 'fair', old: 'kept', employees: 'many' };
  const config = withFields({ contact: [linkedin, source, employees, def('old', 'Old', 'text', { position: 3, archived: true })] });
  const ava = contact('Ava Bennett', { customFields: stored });
  const fake = await open(page, [ava], {}, config);
  await openContact(page, 'Ava Bennett');
  // A removed option's value is hidden, the same as a removed field's.
  await expect(detail(page, 'Lead source')).toHaveText('Lead sourceNone');
  await page.getByRole('link', { name: 'Edit' }).click();
  await field(page, 'LinkedIn').fill('https://linkedin.com/in/ava');
  await page.getByRole('button', { name: 'Save contact' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Ava Bennett' })).toBeVisible();
  expect(fileOf(fake, ava).customFields).toEqual({ ...stored, linkedin: 'https://linkedin.com/in/ava' });
});

test('two people change different custom fields, and the retry keeps both', async ({ page }) => {
  const ava = contact('Ava Bennett', { customFields: { linkedin: 'https://linkedin.com/in/ava', 'lead-source': 'conference' } });
  const fake = await open(page, [ava], {}, contactFields);
  await openContact(page, 'Ava Bennett');
  await page.getByRole('link', { name: 'Edit' }).click();
  await field(page, 'LinkedIn').fill('https://linkedin.com/in/ava-b');
  // Another user changes the lead source first.
  await fake.seed(recordPath('contact', ava.id), serializeRecord({ ...ava, customFields: { ...ava.customFields, 'lead-source': 'referral' }, updatedAt: '2026-10-29T13:00:00Z' }));
  await page.getByRole('button', { name: 'Save contact' }).click();

  const panel = page.getByRole('region', { name: 'Someone else changed this contact' });
  await expect(panel.getByRole('row', { name: /^Lead source/ })).toHaveText(/ReferralNot changed/);
  await expect(panel.getByRole('row', { name: /^LinkedIn/ })).toHaveText(/linkedin\.com\/in\/avahttps:\/\/linkedin\.com\/in\/ava-b/);
  await panel.getByRole('button', { name: 'Retry after review' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Ava Bennett' })).toBeVisible();
  expect(fileOf(fake, ava).customFields).toEqual({ linkedin: 'https://linkedin.com/in/ava-b', 'lead-source': 'referral' });
});

test('a stored value that does not fit is listed in Settings, and the page shows it as stored', async ({ page }) => {
  const ava = contact('Ava Bennett', { customFields: { employees: 'many' } });
  await open(page, [ava], {}, contactFields);
  await openContact(page, 'Ava Bennett');
  await expect(detail(page, 'Employees')).toHaveText('Employees"many" Not a valid number. See Settings.');
  await go(page, 'Settings');
  await expect(page.getByRole('list', { name: 'Files that need attention' })).toHaveText(`${recordPath('contact', ava.id)}: customFields.employees: "many" is not a valid number`);
});

test('company and opportunity forms show their own fields, of every type', async ({ page }) => {
  const config = withFields({
    company: [def('industry', 'Industry', 'text')],
    opportunity: [def('signed', 'Signed', 'checkbox'), def('renewal', 'Renewal', 'date', { position: 1 })],
  });
  const acme = company('Acme Corp');
  const deal = opportunity('Website rebuild', 'lead');
  const fake = await open(page, [acme, deal], {}, config);

  await go(page, 'Companies');
  await page.getByRole('link', { name: 'Acme Corp' }).click();
  await page.getByRole('link', { name: 'Edit' }).click();
  await field(page, 'Industry').fill(' Logistics ');
  await expect(field(page, 'Signed')).toHaveCount(0);
  await page.getByRole('button', { name: 'Save company' }).click();
  await expect(detail(page, 'Industry')).toHaveText('IndustryLogistics');
  expect(fileOf(fake, acme).customFields).toEqual({ industry: 'Logistics' });

  await page.goto(`/#/opportunities/${deal.id}`);
  await expect(detail(page, 'Signed')).toHaveText('SignedNo');
  await page.getByRole('link', { name: 'Edit' }).click();
  await page.getByRole('checkbox', { name: 'Signed' }).click();
  await field(page, 'Renewal').fill('2027-01-31');
  await page.getByRole('button', { name: 'Save opportunity' }).click();
  await expect(detail(page, 'Signed')).toHaveText('SignedYes');
  await expect(detail(page, 'Renewal')).toHaveText(`Renewal${new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date('2027-01-31T00:00:00Z'))}`);
  expect(fileOf(fake, deal).customFields).toEqual({ signed: true, renewal: '2027-01-31' });
  await go(page, 'Contacts');
  await page.getByRole('link', { name: 'New contact' }).click();
  await expect(field(page, 'Industry')).toHaveCount(0);
});

test('search finds the name of a chosen option', async ({ page }) => {
  await open(page, [contact('Ava Bennett', { customFields: { 'lead-source': 'referral' } }), contact('Ben Carter')], {}, contactFields);
  await go(page, 'Search');
  await page.getByRole('searchbox').fill('referral');
  await expect(page.getByRole('list', { name: 'Contacts' }).getByRole('link')).toHaveText(['Ava Bennett']);
});

test('both Settings cards have unsaved changes: each save keeps the other card\'s change', async ({ page }) => {
  const fake = await open(page);
  await go(page, 'Settings');
  const fields = page.getByRole('region', { name: 'Contact fields' });
  const saved = async (button: string, commits: number) => {
    await page.getByRole('button', { name: button }).click();
    await expect.poll(() => fake.commitCount()).toBe(commits);
    await expect(page.getByRole('button', { name: button })).toBeDisabled();
  };
  const commits = fake.commitCount();

  // Stages first, then custom fields.
  await page.getByLabel('Name of stage 1').fill('New lead');
  await fields.getByLabel('New contact field name').fill('LinkedIn');
  await fields.getByLabel('New contact field name').press('Enter');
  await saved('Save stages', commits + 1);
  await saved('Save custom fields', commits + 2);
  // Then the other order.
  await page.getByLabel('Name of stage 2').fill('Fit');
  await fields.getByLabel('New contact field name').fill('Lead source');
  await fields.getByLabel('New contact field name').press('Enter');
  await saved('Save custom fields', commits + 3);
  await saved('Save stages', commits + 4);

  await expect(page.getByText('Someone else changed the workspace settings')).toHaveCount(0);
  const file = settingsFile(fake);
  expect(file.pipelineStages.slice(0, 2).map((s: { label: string }) => s.label)).toEqual(['New lead', 'Fit']);
  expect(file.customFields.contact.map((f: CustomField) => f.id)).toEqual(['linkedin', 'lead-source']);
  expect(file.schemaVersion).toBe(2);
});

test('after someone else changed the custom fields, a save is refused until the latest fields are loaded', async ({ page }) => {
  const fake = await open(page, [], {}, contactFields);
  await go(page, 'Settings');
  await page.getByLabel('Name of contact field 1').fill('LinkedIn URL');
  // Another user renames the field and a stage, and this browser loads both.
  const theirs = withFields({ contact: [{ ...linkedin, label: 'Profile' }, source, employees] });
  theirs.pipelineStages = theirs.pipelineStages.map((s) => (s.id === 'lead' ? { ...s, label: 'Inbound' } : s));
  await fake.seed(WORKSPACE_PATH, serializeWorkspace(theirs));
  await page.getByRole('button', { name: 'Refresh' }).click();
  await expect(page.getByLabel('Name of stage 1')).toHaveValue('Inbound');

  await page.getByRole('button', { name: 'Save custom fields' }).click();
  const card = page.getByRole('region', { name: 'Custom fields' });
  await expect(card).toContainText('Someone else changed the workspace settings, so your custom field changes were not saved.');
  expect(settingsFile(fake).customFields.contact[0].label).toBe('Profile');
  await card.getByRole('button', { name: 'Load the latest custom fields' }).click();
  await expect(page.getByLabel('Name of contact field 1')).toHaveValue('Profile');
});

test('renaming a stage keeps the custom fields and version 2', async ({ page }) => {
  const fake = await open(page, [], {}, contactFields);
  await go(page, 'Settings');
  await page.getByLabel('Name of stage 1').fill('New lead');
  await page.getByRole('button', { name: 'Save stages' }).click();
  await expect(status(page)).toHaveText('Saved · View commit');
  expect(settingsFile(fake)).toMatchObject({ schemaVersion: 2, pipelineStages: [{ label: 'New lead' }, {}, {}, {}, {}], customFields: contactFields.customFields });
});

test('a read-only token sees the fields, and cannot change them', async ({ page }) => {
  await open(page, [], { canWrite: false }, contactFields);
  await go(page, 'Settings');
  const card = page.getByRole('region', { name: 'Custom fields' });
  await expect(card.getByRole('listitem')).toHaveText(['LinkedIn (Web address)', 'Lead source (Choice list)', 'Employees (Number)']);
  await expect(card.getByRole('button')).toHaveCount(0);
});

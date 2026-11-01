// Spec 05, export: the JSON snapshot and the CSV files, built in the browser, against the fake GitHub.
import { readFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';
import { recordPath, WORKSPACE_PATH } from '../src/core/paths.ts';
import { serializeRecord } from '../src/core/record-file.ts';
import { readCsv, readValue } from '../src/test/csv-reader.ts';
import { expect, test, type Page } from './fixtures.ts';
import { activity, company, contact, go, open, opportunity, task } from './workspace.ts';

const northwind = company('Northwind Traders', { website: 'https://northwind.example' });
const ava = contact('=Ava Bennett', { emails: ['ava@northwind.example'], phones: ['+1 555 0100'], companyId: northwind.id });
const zoe = contact('Zoë Ålund', { archivedAt: '2026-10-29T13:00:00Z' });
const deal = opportunity('Website rebuild', 'proposal', { companyId: northwind.id, contactIds: [ava.id], valueMinor: 1_200_000 });
const records = [
  northwind,
  ava,
  zoe,
  deal,
  task('Send the proposal', { related: { type: 'opportunity', id: deal.id } }),
  activity('Talked about the launch date.\r\nShe wants it before March.', { kind: 'call', related: { type: 'contact', id: ava.id } }),
];

const REF = /\/git\/ref\/heads\//;
const refresh = (page: Page) => page.getByRole('button', { name: 'Refresh' }).click();
const exportButtons = (page: Page) => [page.getByRole('button', { name: 'Export JSON snapshot' }), page.getByRole('button', { name: 'Export CSV' })];

// ignoreBOM keeps the byte order mark at the start of each CSV file.
const utf8 = new TextDecoder('utf-8', { ignoreBOM: true });
async function downloadZip(page: Page, button: string) {
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: button }).click()]);
  const zip = unzipSync(await readFile(await download.path()));
  return { name: download.suggestedFilename(), files: Object.fromEntries(Object.entries(zip).map(([path, data]) => [path, utf8.decode(data)])) };
}

function table(csv: string) {
  const [header, ...rows] = readCsv(csv);
  return rows.map((row) => Object.fromEntries(header.map((column, i) => [column, row[i]])));
}

test('"Export JSON snapshot" downloads every file with its text on main, and no request leaves the browser', async ({ page }) => {
  const fake = await open(page, records);
  await go(page, 'Settings');
  const requests: string[] = [];
  page.on('request', (request) => void (request.url().startsWith('blob:') || requests.push(request.url())));

  const { name, files } = await downloadZip(page, 'Export JSON snapshot');
  expect(name).toMatch(/^gitcrm-example-studio-\d{4}-\d{2}-\d{2}-snapshot\.zip$/);
  expect(Object.keys(files).filter((path) => path.startsWith('data/'))).toHaveLength(records.length);
  for (const record of records) expect(files[recordPath(record.type, record.id)]).toBe(serializeRecord(record));
  expect(JSON.parse(files[recordPath('contact', ava.id)]).name).toBe('=Ava Bennett');
  expect(JSON.parse(files[WORKSPACE_PATH])).toMatchObject({ name: 'Example Studio' });
  expect(files['DATA-DICTIONARY.md']).toContain(`| Commit | ${fake.head} |`);
  expect(files['DATA-DICTIONARY.md']).toContain('| Contacts | 2 | 1 |');
  expect(Object.keys(files).filter((path) => path.startsWith('schemas/'))).toHaveLength(6);
  expect(requests).toEqual([]);
});

test('"Export CSV" downloads one CSV per record type, with IDs for the links, and a formula shown as text', async ({ page }) => {
  await open(page, records);
  await go(page, 'Settings');
  const { name, files } = await downloadZip(page, 'Export CSV');
  expect(name).toMatch(/^gitcrm-example-studio-\d{4}-\d{2}-\d{2}-csv\.zip$/);
  expect(Object.keys(files).filter((path) => path.endsWith('.csv')).toSorted()).toEqual(['activities.csv', 'companies.csv', 'contacts.csv', 'opportunities.csv', 'tasks.csv']);

  const contacts = table(files['contacts.csv']);
  const avaRow = contacts.find((row) => row.id === ava.id)!;
  expect(avaRow).toMatchObject({ name: "'=Ava Bennett", phones: "'+1 555 0100", emails: 'ava@northwind.example', companyId: northwind.id });
  expect(readValue(avaRow.name)).toBe('=Ava Bennett');
  expect(contacts.find((row) => row.id === zoe.id)).toMatchObject({ name: 'Zoë Ålund', archivedAt: '2026-10-29T13:00:00Z' });
  expect(table(files['companies.csv'])).toEqual([expect.objectContaining({ id: northwind.id, website: 'https://northwind.example' })]);
  expect(table(files['opportunities.csv'])).toEqual([expect.objectContaining({ id: deal.id, companyId: northwind.id, contactIds: ava.id, stageLabel: 'Proposal', value: '12000.00' })]);
  expect(table(files['tasks.csv'])).toEqual([expect.objectContaining({ relatedType: 'opportunity', relatedId: deal.id })]);
  expect(table(files['activities.csv'])).toEqual([expect.objectContaining({ body: 'Talked about the launch date.\r\nShe wants it before March.', relatedType: 'contact', relatedId: ava.id })]);
});

test('a file that cannot be read blocks both exports, and the Export card names it', async ({ page }) => {
  const fake = await open(page, records);
  const bad = recordPath('contact', 'ab000000-0000-4000-8000-000000000000');
  await fake.seed(bad, '{ "name": "Half a file"');
  await go(page, 'Settings');
  await refresh(page);
  await expect(page.getByRole('list', { name: 'Files that need attention' })).toContainText(bad);
  await expect(page.getByText(`1 file cannot be read, so the export would not be complete: ${bad}`)).toBeVisible();
  for (const button of exportButtons(page)) await expect(button).toBeDisabled();
});

test('while GitCRM loads the records, or after its check of GitHub failed, both exports wait', async ({ page }) => {
  const fake = await open(page, records);
  await go(page, 'Settings');
  let land = () => {};
  const held = new Promise<void>((started) => {
    fake.failNext('GET', REF, { run: () => new Promise<void>((resolve) => ((land = resolve), started())) });
  });
  await refresh(page);
  await held;
  await expect(page.getByText('You can export when GitCRM finishes loading the records.')).toBeVisible();
  for (const button of exportButtons(page)) await expect(button).toBeDisabled();
  land();
  for (const button of exportButtons(page)) await expect(button).toBeEnabled();

  fake.failNext('GET', REF, { network: 'before' });
  await refresh(page);
  await expect(page.getByText('GitCRM could not check GitHub, so these records may be out of date. Refresh, then export.')).toBeVisible();
  for (const button of exportButtons(page)) await expect(button).toBeDisabled();
});

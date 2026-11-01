// Spec 04 (tasks and manual activities), against the fake GitHub. The page clock is fixed, so
// "today" and "now" are known; each test names its time zone.
import { recordPath } from '../src/core/paths.ts';
import type { CRMRecord } from '../src/core/schemas.ts';
import type { FakeGitHub } from '../src/test/fake-github.ts';
import { expect, test, type Page } from './fixtures.ts';
import { activity, company, contact, field, go, open, openContact, opportunity, status, task } from './workspace.ts';

test.use({ timezoneId: 'America/New_York', locale: 'en-US' });

// 11:00 in New York, on Thursday 2026-10-29.
const NOW = new Date('2026-10-29T15:00:00Z');

const writes = (fake: FakeGitHub) => fake.requests.filter((r) => r.method === 'PUT');
const fileOf = (fake: FakeGitHub, record: CRMRecord) => JSON.parse(fake.file(recordPath(record.type, record.id))!);
const newFile = (fake: FakeGitHub, folder: string) => {
  const [path] = fake.paths().filter((p) => p.startsWith(`data/${folder}/`));
  return JSON.parse(fake.file(path)!);
};
const section = (page: Page, name: string) => page.getByRole('region', { name, exact: true });
const checkbox = (page: Page, title: string) => page.getByRole('checkbox', { name: `Complete ${title}` });

async function openAt(page: Page, records: CRMRecord[], at = NOW, options = {}) {
  await page.clock.setFixedTime(at);
  return open(page, records, options);
}

async function openOpportunity(page: Page, title: string) {
  await go(page, 'Pipeline');
  await page.getByRole('link', { name: title }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
}

test('logging a note on a contact commits one new activity file, and the note shows on its timeline', async ({ page }) => {
  const ava = contact('Ava Bennett');
  const fake = await openAt(page, [ava]);
  await openContact(page, 'Ava Bennett');
  await page.getByRole('link', { name: 'Log activity' }).click();
  await expect(field(page, 'Kind')).toHaveValue('note');
  await expect(field(page, 'When')).toHaveValue('2026-10-29T11:00');
  await expect(field(page, 'Related to').locator('option:checked')).toHaveText('Ava Bennett');
  await field(page, 'What happened').fill('Discussed timeline and budget.\nShe wants a quote by Friday.');
  await page.getByRole('button', { name: 'Save activity' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Ava Bennett' })).toBeVisible();
  await expect(status(page)).toHaveText('Saved · View commit');
  const timeline = page.getByRole('list', { name: 'Activity with Ava Bennett' });
  await expect(timeline).toContainText('Note');
  await expect(timeline).toContainText('Oct 29, 2026, 11:00 AM');
  await expect(timeline).toContainText('She wants a quote by Friday.');
  expect(writes(fake)).toHaveLength(1);
  expect(newFile(fake, 'activities')).toMatchObject({
    type: 'activity',
    kind: 'note',
    body: 'Discussed timeline and budget.\nShe wants a quote by Friday.',
    occurredAt: '2026-10-29T15:00:00Z',
    related: { type: 'contact', id: ava.id },
  });
  expect(fake.lastCommitMessage()).toMatch(/^gitcrm: create activity [0-9a-f]{8}$/);
});

test('a time entered in New York is stored in UTC, and shows in New York time', async ({ page }) => {
  const fake = await openAt(page, [contact('Ava Bennett')]);
  await openContact(page, 'Ava Bennett');
  await page.getByRole('link', { name: 'Log activity' }).click();
  await field(page, 'Kind').selectOption({ label: 'Call' });
  await field(page, 'What happened').fill('Called about the quote.');
  await field(page, 'When').fill('2026-10-26T12:15');
  await page.getByRole('button', { name: 'Save activity' }).click();

  await expect(page.getByRole('list', { name: 'Activity with Ava Bennett' })).toContainText('Oct 26, 2026, 12:15 PM');
  expect(newFile(fake, 'activities')).toMatchObject({ kind: 'call', occurredAt: '2026-10-26T16:15:00Z' });
});

test('a follow-up task linked to an opportunity shows on the opportunity page and in Tasks', async ({ page }) => {
  const deal = opportunity('Website rebuild', 'proposal');
  const fake = await openAt(page, [deal]);
  await openOpportunity(page, 'Website rebuild');
  await page.getByRole('link', { name: 'Add task' }).click();
  await field(page, 'Title').fill('Send revised proposal');
  await field(page, 'Due date').fill('2026-11-02');
  await expect(field(page, 'Related to').locator('option:checked')).toHaveText('Website rebuild');
  await page.getByRole('button', { name: 'Save task' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Send revised proposal' })).toBeVisible();
  await expect(status(page)).toHaveText('Saved · View commit');
  expect(newFile(fake, 'tasks')).toMatchObject({ type: 'task', title: 'Send revised proposal', dueDate: '2026-11-02', completedAt: null, related: { type: 'opportunity', id: deal.id } });
  expect(fake.lastCommitMessage()).toMatch(/^gitcrm: create task [0-9a-f]{8}$/);

  await page.getByRole('link', { name: 'Website rebuild' }).click();
  await expect(page.getByRole('list', { name: 'Tasks for Website rebuild' })).toContainText('Send revised proposal');
  await go(page, 'Tasks');
  await expect(section(page, 'Upcoming')).toContainText('Send revised proposal');
  await expect(section(page, 'Upcoming')).toContainText('Due Nov 2, 2026');
  await expect(section(page, 'Upcoming')).toContainText('For Website rebuild');
});

test('completing a task stores completedAt in UTC, and it moves to Completed after the commit', async ({ page }) => {
  const followUp = task('Send revised proposal', { dueDate: '2026-11-02' });
  const fake = await openAt(page, [followUp]);
  await go(page, 'Tasks');
  let land = () => {};
  fake.failNext('PUT', /\/contents\//, { run: () => new Promise<void>((resolve) => (land = resolve)) });
  await checkbox(page, 'Send revised proposal').click();

  // Pending: checked, still in Upcoming, until the commit lands.
  await expect(checkbox(page, 'Send revised proposal')).toBeChecked();
  await expect(section(page, 'Upcoming')).toContainText('Saving…');
  land();
  await expect(status(page)).toHaveText('Saved · View commit');
  await expect(page.getByText('0 open tasks')).toBeVisible();
  expect(fileOf(fake, followUp).completedAt).toBe('2026-10-29T15:00:00Z');

  await field(page, 'Show').selectOption({ label: 'Completed tasks' });
  await expect(section(page, 'Completed')).toContainText('Completed Oct 29, 2026');
  await checkbox(page, 'Send revised proposal').click();
  await expect(page.getByText('0 completed tasks')).toBeVisible();
  expect(fileOf(fake, followUp).completedAt).toBeNull();
});

test('a failed completion leaves the task open and says why', async ({ page }) => {
  const followUp = task('Send revised proposal');
  const fake = await openAt(page, [followUp]);
  await go(page, 'Tasks');
  fake.failNext('PUT', /\/contents\//, { network: 'before' });
  await checkbox(page, 'Send revised proposal').click();

  await expect(page.getByRole('alert')).toContainText('Send revised proposal was not marked complete. Could not reach GitHub.');
  await expect(checkbox(page, 'Send revised proposal')).not.toBeChecked();
  await expect(section(page, 'Upcoming')).toContainText('Send revised proposal');
  expect(fileOf(fake, followUp).completedAt).toBeNull();
});

test.describe('overdue uses the local calendar date, with no background service', () => {
  // 22:00 on Sunday 2026-11-01 in New York; already 12:00 on Monday 2026-11-02 in Tokyo.
  const LATE = new Date('2026-11-02T03:00:00Z');
  const records = [task('Call back', { dueDate: '2026-11-01' }), task('Pay invoice', { dueDate: '2026-10-31' })];

  test('in New York, a task due on Nov 1 is due today, not overdue', async ({ page }) => {
    const fake = await openAt(page, records, LATE);
    await go(page, 'Tasks');
    await expect(section(page, 'Overdue')).toContainText('Pay invoice');
    await expect(section(page, 'Overdue')).not.toContainText('Call back');
    await expect(section(page, 'Upcoming')).toContainText('Call back');
    await expect(section(page, 'Upcoming')).toContainText('Due today');
    expect(writes(fake)).toEqual([]);
  });

  test.describe('in Tokyo', () => {
    test.use({ timezoneId: 'Asia/Tokyo' });
    test('the same task is overdue', async ({ page }) => {
      await openAt(page, records, LATE);
      await go(page, 'Tasks');
      await expect(section(page, 'Overdue')).toContainText('Call back');
      await expect(section(page, 'Overdue')).toContainText('Overdue · due Nov 1, 2026');
      await expect(section(page, 'Upcoming')).toHaveCount(0);
    });
  });
});

test('a note with HTML or a script shows as plain text and never runs', async ({ page }) => {
  const ava = contact('Ava Bennett');
  const body = '<img src=x onerror="window.__xss=1"><script>window.__xss=2</script><b>bold</b>';
  await openAt(page, [ava, activity(body, { related: { type: 'contact', id: ava.id } })]);
  await expect(page.getByRole('list', { name: 'Recent activity' })).toContainText(body);
  await openContact(page, 'Ava Bennett');
  const timeline = page.getByRole('list', { name: 'Activity with Ava Bennett' });
  await expect(timeline).toContainText(body);
  await expect(timeline.locator('img, script, b')).toHaveCount(0);
  expect(await page.evaluate(() => (window as { __xss?: number }).__xss)).toBeUndefined();
});

test('the timeline puts the latest activity first, and orders a tie by ID', async ({ page }) => {
  const ava = contact('Ava Bennett');
  const related = { type: 'contact' as const, id: ava.id };
  const at = '2026-10-26T16:15:00Z';
  const [first, second] = [activity('Tie A', { related, occurredAt: at }), activity('Tie B', { related, occurredAt: at })].sort((a, b) => (a.id < b.id ? -1 : 1));
  await openAt(page, [ava, activity('Older', { related, occurredAt: '2026-10-01T09:00:00Z' }), second, activity('Latest', { related, occurredAt: '2026-10-28T09:00:00Z' }), first]);
  await openContact(page, 'Ava Bennett');
  const items = page.getByRole('list', { name: 'Activity with Ava Bennett' }).getByRole('listitem');
  await expect(items).toHaveCount(4);
  const bodies = await items.locator('p').allTextContents();
  expect(bodies).toEqual(['Latest', first.body, second.body, 'Older']);
});

test('a linked record that left the workspace is refused on save', async ({ page }) => {
  const ava = contact('Ava Bennett');
  const fake = await openAt(page, [ava]);
  await openContact(page, 'Ava Bennett');
  await page.getByRole('link', { name: 'Add task' }).click();
  await field(page, 'Title').fill('Call back');

  fake.remove(recordPath('contact', ava.id));
  await page.getByRole('button', { name: 'Refresh' }).click();
  await expect(field(page, 'Related to').locator('option:checked')).toHaveText(`Missing contact (ID ${ava.id.slice(0, 8)})`);
  await page.getByRole('button', { name: 'Save task' }).click();
  await expect(page.getByText('The chosen record is no longer in the workspace. Choose another one, or none.')).toBeVisible();
  expect(writes(fake)).toEqual([]);
});

test('archiving an activity hides it from the timeline until "Show archived"', async ({ page }) => {
  const ava = contact('Ava Bennett');
  const note = activity('Discussed timeline.', { related: { type: 'contact', id: ava.id } });
  const fake = await openAt(page, [ava, note]);
  await openContact(page, 'Ava Bennett');
  await page.getByRole('button', { name: /^Archive note from/ }).click();

  await expect(page.getByText('1 archived activity hidden.')).toBeVisible();
  await expect(page.getByText('No activity yet.')).toBeVisible();
  expect(fileOf(fake, note)).toMatchObject({ id: note.id, archivedAt: '2026-10-29T15:00:00Z' });
  await page.getByRole('button', { name: 'Show archived' }).click();
  await expect(page.getByRole('list', { name: 'Activity with Ava Bennett' })).toContainText('Discussed timeline.');
  await expect(page.getByRole('list', { name: 'Activity with Ava Bennett' })).toContainText('Archived');
});

test('Home lists the tasks due today or overdue, and the latest activity', async ({ page }) => {
  const northwind = company('Northwind Traders');
  await openAt(page, [
    northwind,
    task('Pay invoice', { dueDate: '2026-10-20' }),
    task('Follow up', { dueDate: '2026-10-29' }),
    task('Book call', { dueDate: '2026-11-02' }),
    task('Done', { dueDate: '2026-10-01', completedAt: '2026-10-02T09:00:00Z' }),
    activity('Met at the expo.', { kind: 'meeting', related: { type: 'company', id: northwind.id } }),
  ]);
  const due = page.getByRole('list', { name: 'Tasks due' });
  await expect(due.getByRole('listitem')).toHaveCount(2);
  await expect(due).toContainText('Pay invoice');
  await expect(due).toContainText('Overdue · due Oct 20, 2026');
  await expect(due).toContainText('Due today');
  const recent = page.getByRole('list', { name: 'Recent activity' });
  await expect(recent).toContainText('Meeting');
  await expect(recent).toContainText('with Northwind Traders');
  await expect(recent).toContainText('Met at the expo.');
});

test('a read-only token cannot add tasks or activities, or complete tasks', async ({ page }) => {
  const ava = contact('Ava Bennett');
  await openAt(page, [ava, task('Call back', { related: { type: 'contact', id: ava.id } })], NOW, { canWrite: false });
  await go(page, 'Tasks');
  await expect(page.getByRole('link', { name: 'New task' })).toHaveCount(0);
  await expect(checkbox(page, 'Call back')).toBeDisabled();
  await openContact(page, 'Ava Bennett');
  await expect(page.getByRole('link', { name: 'Add task' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Log activity' })).toHaveCount(0);
  await expect(checkbox(page, 'Call back')).toBeDisabled();
});

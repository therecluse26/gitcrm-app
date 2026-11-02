// A connected workspace with records, and the page helpers the record specs share.
import { expect, type Page } from '@playwright/test';
import { recordPath, WORKSPACE_PATH } from '../src/core/paths.ts';
import { serializeRecord, serializeWorkspace } from '../src/core/record-file.ts';
import { newRecord } from '../src/core/records.ts';
import type { Activity, Company, Contact, CRMRecord, Opportunity, Task, WorkspaceConfig } from '../src/core/schemas.ts';
import { newWorkspaceConfig } from '../src/core/workspace.ts';
import type { FakeGitHub, FakeGitHubOptions } from '../src/test/fake-github.ts';
import { connect } from './connect-page.ts';
import { routeFakeGitHub } from './fake-route.ts';

const now = new Date('2026-10-29T12:00:00Z');

export function contact(name: string, changes: Partial<Contact> = {}): Contact {
  return { ...newRecord('contact', { name, emails: [], phones: [], companyId: null, tags: [] }, { now }), ...changes };
}

export function company(name: string, changes: Partial<Company> = {}): Company {
  return { ...newRecord('company', { name, website: null, tags: [] }, { now }), ...changes };
}

export function opportunity(title: string, stageId: string, changes: Partial<Opportunity> = {}): Opportunity {
  return {
    ...newRecord('opportunity', { title, stageId, companyId: null, contactIds: [], valueMinor: null, currency: 'USD', expectedCloseDate: null }, { now }),
    ...changes,
  };
}

export function task(title: string, changes: Partial<Task> = {}): Task {
  return { ...newRecord('task', { title, description: '', dueDate: null, completedAt: null, related: null }, { now }), ...changes };
}

export function activity(body: string, changes: Partial<Activity> = {}): Activity {
  return { ...newRecord('activity', { kind: 'note', body, occurredAt: '2026-10-26T16:15:00Z', related: null }, { now }), ...changes };
}

export const exampleConfig = () => newWorkspaceConfig({ name: 'Example Studio', defaultCurrency: 'USD' });

export async function seedWorkspace(fake: FakeGitHub, records: CRMRecord[], config: WorkspaceConfig = exampleConfig()) {
  await fake.seed(WORKSPACE_PATH, serializeWorkspace(config));
  for (const record of records) await fake.seed(recordPath(record.type, record.id), serializeRecord(record));
}

export const homeHeading = (page: Page) => page.getByRole('heading', { level: 1, name: 'Example Studio' });

// A connected workspace holding `records`, with the home page on screen.
export async function open(page: Page, records: CRMRecord[] = [], options: FakeGitHubOptions = {}, config?: WorkspaceConfig) {
  const fake = await routeFakeGitHub(page, options);
  await seedWorkspace(fake, records, config);
  await connect(page, fake);
  await expect(homeHeading(page)).toBeVisible();
  return fake;
}

export const go = (page: Page, name: string) => page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name }).click();
export const status = (page: Page) => page.getByRole('banner').getByRole('status');
export const field = (page: Page, label: string) => page.getByLabel(label, { exact: true });

export async function openContact(page: Page, name: string) {
  await go(page, 'Contacts');
  await page.getByRole('table', { name: 'Contacts' }).getByRole('link', { name }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

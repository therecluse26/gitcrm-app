// Fills in and submits the connect screen.
import type { Page } from '@playwright/test';
import type { FakeGitHub } from '../src/test/fake-github.ts';

export async function connect(page: Page, fake: FakeGitHub, { remember = true, repo = fake.repo } = {}) {
  await page.goto('./'); // the app's folder, which is not the site root on GitHub Pages (spec 09)
  await page.getByLabel('Repository', { exact: true }).fill(`${fake.owner}/${repo}`);
  await page.getByLabel('Fine-grained personal access token').fill(fake.token);
  if (!remember) await page.getByRole('checkbox', { name: 'Remember on this device' }).click();
  await page.getByRole('button', { name: 'Connect' }).click();
}

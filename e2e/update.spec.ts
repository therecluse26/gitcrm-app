// Spec 11 (template updates): the update banner, on a copy's GitHub Pages site.
import { expect, test, type Page } from './fixtures.ts';
import { PAGES_SITE, routeFakeGitHub, servePagesSite } from './fake-route.ts';

const TEMPLATE = 'therecluse26/GitCRM'; // TEMPLATE in src/app/update.ts
const RELEASE = `https://api.github.com/repos/${TEMPLATE}/releases/latest`;
const banner = (page: Page) => page.getByRole('status').filter({ hasText: 'is available' });

// Registered after the fake GitHub, so this route answers first.
async function releaseIs(page: Page, tag: string) {
  const requests: Record<string, string>[] = [];
  await page.route(RELEASE, async (route) => {
    requests.push(route.request().headers());
    await route.fulfill({ json: { tag_name: tag } });
  });
  return requests;
}

test('a newer release shows the update button, which opens my copy\'s update workflow', async ({ page, baseURL }) => {
  const fake = await routeFakeGitHub(page);
  const requests = await releaseIs(page, 'v99.0.0');
  await servePagesSite(page, baseURL!);
  await page.goto(PAGES_SITE);

  await expect(banner(page)).toContainText('GitCRM v99.0.0 is available');
  await expect(banner(page).getByRole('link', { name: 'Update GitCRM' })).toHaveAttribute('href', 'https://github.com/octo-dev/gitcrm/actions/workflows/template-update.yml');
  await expect(banner(page).getByRole('link', { name: "What's new" })).toHaveAttribute('href', `https://github.com/${TEMPLATE}/releases/tag/v99.0.0`);
  expect(requests).toHaveLength(1);
  expect(requests[0]).not.toHaveProperty('authorization'); // the PAT goes only to the data repository

  // The app shows it too, after connect, from the same request.
  await page.getByLabel('Repository', { exact: true }).fill(`${fake.owner}/${fake.repo}`);
  await page.getByLabel('Fine-grained personal access token').fill(fake.token);
  await page.getByRole('button', { name: 'Connect' }).click();
  await expect(page.getByRole('heading', { name: 'Set up a GitCRM workspace' })).toBeVisible();
  await page.getByLabel('Workspace name').fill('Example Studio');
  await page.getByRole('button', { name: 'Set up workspace' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Example Studio' })).toBeVisible();
  await expect(banner(page)).toContainText('GitCRM v99.0.0 is available');
  expect(requests).toHaveLength(1);
});

test('the same or an older release shows nothing', async ({ page, baseURL }) => {
  await routeFakeGitHub(page);
  const requests = await releaseIs(page, 'v0.0.1');
  await servePagesSite(page, baseURL!);
  await page.goto(PAGES_SITE);
  await expect(page.getByLabel('Repository', { exact: true })).toBeVisible();
  await expect.poll(() => requests.length).toBe(1);
  await expect(banner(page)).toHaveCount(0);
});

test('off GitHub Pages, the app does not ask for releases', async ({ page }) => {
  await routeFakeGitHub(page);
  const requests = await releaseIs(page, 'v99.0.0');
  await page.goto('./');
  await expect(page.getByLabel('Repository', { exact: true })).toBeVisible();
  await expect(banner(page)).toHaveCount(0);
  expect(requests).toHaveLength(0);
});

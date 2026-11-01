// Spec 09: the same build runs from any folder on a static host. The "github-pages" project serves
// it from /GitCRM/ with no custom headers, the way GitHub Pages serves a project site.
import { expect, test } from './fixtures.ts';
import { company, go, open } from './workspace.ts';

test("every request goes to the app's own folder or to api.github.com, and the address keeps the folder", async ({ page, baseURL }) => {
  const folder = new URL('./', baseURL).href;
  const requests: string[] = [];
  page.on('request', (request) => void requests.push(request.url()));
  await open(page, [company('Acme Corp')]);
  for (const name of ['Contacts', 'Companies', 'Pipeline', 'Tasks', 'Search', 'Settings']) {
    await go(page, name);
    await expect(page).toHaveURL(`${folder}#/${name.toLowerCase()}`);
  }
  expect(requests.filter((url) => url.startsWith(folder)).length).toBeGreaterThan(2); // the page, the script, the stylesheet
  expect(requests.filter((url) => !url.startsWith(folder) && !url.startsWith('https://api.github.com/'))).toEqual([]);
});

// docs/08, "Accessibility checks": WCAG 2.2 AA (PRODUCT_REQUIREMENTS). axe checks each page and
// state. The other checks measure what axe cannot: focus indicators, field borders, and the
// keyboard-only path.
import AxeBuilder from '@axe-core/playwright';
import { withCustomFields, type CustomField } from '../src/core/custom-fields.ts';
import { recordPath } from '../src/core/paths.ts';
import { serializeRecord } from '../src/core/record-file.ts';
import { expect, test, type Page } from './fixtures.ts';
import { connect } from './connect-page.ts';
import { PAGES_SITE, routeFakeGitHub, servePagesSite } from './fake-route.ts';
import { activity, company, contact, exampleConfig, field, open, opportunity, status, task } from './workspace.ts';

const acme = company('Acme Corp', { website: 'https://acme.example' });
const ava = contact('Ava Bennett', { companyId: acme.id, emails: ['ava@acme.example'] });
const deal = opportunity('Website rebuild', 'lead', { companyId: acme.id, contactIds: [ava.id], valueMinor: 250000 });
const call = task('Call Ava', { related: { type: 'contact', id: ava.id } });
const note = activity('Met at the conference', { related: { type: 'contact', id: ava.id } });
const records = [acme, ava, deal, call, note];

const PAGES: [name: string, path: string][] = [
  ['Home', '/'],
  ['Contacts', '/contacts'],
  ['a contact', `/contacts/${ava.id}`],
  ['new contact', '/contacts/new'],
  ['edit contact', `/contacts/${ava.id}/edit`],
  ['delete contact', `/contacts/${ava.id}/delete`],
  ['Companies', '/companies'],
  ['a company', `/companies/${acme.id}`],
  ['new company', '/companies/new'],
  ['the board', '/pipeline'],
  ['an opportunity', `/opportunities/${deal.id}`],
  ['new opportunity', '/opportunities/new'],
  ['Tasks', '/tasks'],
  ['a task', `/tasks/${call.id}`],
  ['new task', '/tasks/new'],
  ['new activity', '/activities/new'],
  ['edit activity', `/activities/${note.id}/edit`],
  ['Search', '/search'],
  ['Settings', '/settings'],
  ['Page not found', '/nowhere'],
];

// A page change inside the app, without a reload.
async function visit(page: Page, path: string) {
  await page.evaluate((hash) => (location.hash = hash), `#${path}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

type Measure = { control: string; contrast: number };

// Runs in the page. `focus`: the contrast of the focused control's ring or outline against the
// background behind it. `borders`: the same for each field's border. A 1x1 canvas turns any CSS
// color into sRGB and blends it the way the page does.
async function measure(mode: 'focus' | 'borders'): Promise<Measure[]> {
  const ctx = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true })!;
  const paint = (colors: string[]) => {
    ctx.clearRect(0, 0, 1, 1);
    for (const color of colors) {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
    }
    return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
  };
  const luminance = (rgb: number[]) => {
    const [r, g, b] = rgb.map((v) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: number[], b: number[]) => {
    const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (light + 0.05) / (dark + 0.05);
  };
  // Every background behind `el`, outermost first, on the white page.
  const behind = (el: Element | null) => {
    const layers: string[] = [];
    for (; el; el = el.parentElement) layers.unshift(getComputedStyle(el).backgroundColor);
    return ['white', ...layers];
  };
  const named = (el: Element) => {
    const labelledBy = el.getAttribute('aria-labelledby');
    const text = el.getAttribute('aria-label') ?? (labelledBy && document.getElementById(labelledBy)?.textContent) ?? (el as HTMLInputElement).labels?.[0]?.textContent ?? el.textContent;
    return `${el.tagName.toLowerCase()} "${(text ?? '').trim().slice(0, 40)}"`;
  };
  const against = (el: Element, color: string) => contrast(paint([...behind(el.parentElement), color]), paint(behind(el.parentElement)));

  if (mode === 'borders') {
    return [...document.querySelectorAll('input:not([type="hidden"]):not([aria-hidden="true"]), select, textarea, [role="checkbox"]')]
      .filter((el) => el.checkVisibility() && !el.matches(':disabled'))
      .map((el) => ({ control: named(el), contrast: against(el, getComputedStyle(el).borderTopColor) }));
  }
  const el = document.activeElement!;
  for (const animation of el.getAnimations()) animation.finish(); // a ring that fades in: read its final color
  const style = getComputedStyle(el);
  const colors = [...style.boxShadow.matchAll(/((?:rgba?|oklab|oklch|lab|lch|color)\([^)]*\)) [-\d.]+px [-\d.]+px [-\d.]+px ([\d.]+)px/g)]
    .filter(([, , spread]) => Number(spread) > 0)
    .map(([, color]) => color);
  if (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0) colors.push(style.outlineColor);
  return [{ control: named(el), contrast: Math.max(0, ...colors.map((color) => against(el, color))) }];
}

// Each control that Tab reaches on the page, with its focus indicator's contrast. Tab goes once
// around the page, past the page body, until it comes back to a control it has seen.
async function tabStops(page: Page): Promise<Measure[]> {
  const stops: Measure[] = [];
  const seen = await page.evaluateHandle(() => new WeakSet<Element>());
  for (let i = 0; i < 100; i++) {
    await page.keyboard.press('Tab');
    const at = await seen.evaluate((set) => {
      const el = document.activeElement;
      if (!el || el === document.body) return 'body';
      if (set.has(el)) return 'seen';
      set.add(el);
      return 'new';
    });
    if (at === 'seen') return stops;
    if (at === 'new') stops.push(...(await page.evaluate(measure, 'focus' as const)));
  }
  throw new Error('Tab reached more than 100 controls');
}

// axe, the focus indicators, the field borders, and no running animation. Soft, so one run lists
// every problem on the page.
async function checkPage(page: Page, name: string) {
  // A control still fading in, such as a button that was disabled. A cancelled fade counts as done.
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
  const found = violations.flatMap(({ id, nodes }) => nodes.map((node) => `${id}: ${node.target.join(' ')}: ${node.any[0]?.message ?? node.failureSummary}`));
  expect.soft(found, `${name}: axe`).toEqual([]);
  expect.soft((await page.evaluate(measure, 'borders' as const)).filter(({ contrast }) => contrast < 3), `${name}: field borders below 3:1`).toEqual([]);
  expect.soft(await page.evaluate(() => document.getAnimations().filter((a) => a instanceof CSSAnimation).length), `${name}: running animations`).toBe(0);
  const stops = await tabStops(page);
  expect.soft(stops.length, `${name}: Tab stops`).toBeGreaterThan(0);
  expect.soft(stops.filter(({ contrast }) => contrast < 3), `${name}: focus indicators below 3:1`).toEqual([]);
}

for (const [name, path] of PAGES) {
  test(`${name}: axe finds nothing, and focus indicators and field borders reach 3:1`, async ({ page }) => {
    await open(page, records);
    await visit(page, path);
    await checkPage(page, name);
  });
}

test('the connect screen and workspace setup, with and without field errors', async ({ page }) => {
  const fake = await routeFakeGitHub(page);
  await page.goto('/');
  await checkPage(page, 'connect');
  await page.getByRole('button', { name: 'Connect' }).click();
  await expect(field(page, 'Repository')).toBeFocused();
  await checkPage(page, 'connect, with field errors');

  await connect(page, fake);
  await expect(page.getByRole('heading', { name: 'Set up a GitCRM workspace' })).toBeVisible();
  await checkPage(page, 'workspace setup');
});

test('the update banner on the connect screen (spec 11)', async ({ page, baseURL }) => {
  await routeFakeGitHub(page);
  await page.route('https://api.github.com/repos/therecluse26/GitCRM/releases/latest', (route) => route.fulfill({ json: { tag_name: 'v99.0.0' } }));
  await servePagesSite(page, baseURL!);
  await page.goto(PAGES_SITE);
  await expect(page.getByRole('link', { name: 'Update GitCRM' })).toBeVisible();
  await checkPage(page, 'update banner');
});

test('a form with field errors, a failed save, and the conflict panel', async ({ page }) => {
  const fake = await open(page, records);
  await visit(page, '/contacts/new');
  await page.getByRole('button', { name: 'Save contact' }).click();
  await expect(field(page, 'Name')).toBeFocused();
  await checkPage(page, 'field errors');

  await visit(page, `/contacts/${ava.id}/edit`);
  await field(page, 'Phone 1').fill('555-0100');
  fake.failNext('PUT', /\/contents\//, { respond: { status: 502, body: { message: 'Server Error' } } });
  await page.getByRole('button', { name: 'Save contact' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await checkPage(page, 'a failed save');

  await fake.seed(recordPath('contact', ava.id), serializeRecord({ ...ava, emails: ['ava@studio.test'], updatedAt: '2026-10-29T13:00:00Z' }));
  await page.getByRole('button', { name: 'Save contact' }).click();
  await expect(page.getByRole('region', { name: 'Someone else changed this contact' })).toBeVisible();
  await checkPage(page, 'the conflict panel');
});

test('a read-only workspace', async ({ page }) => {
  await open(page, records, { canWrite: false });
  for (const [name, path] of [['a contact', `/contacts/${ava.id}`], ['the board', '/pipeline']]) {
    await visit(page, path);
    await checkPage(page, `read-only: ${name}`);
  }
});

test('custom fields: the Settings card, a form with each type and an error, and a record page', async ({ page }) => {
  const def = (id: string, type: CustomField['type'], position: number, changes: Partial<CustomField> = {}): CustomField => ({ id, label: id, type, position, archived: false, options: [], ...changes });
  const options = [
    { id: 'referral', label: 'Referral', archived: false },
    { id: 'fair', label: 'Trade fair', archived: true },
  ];
  const fields = [def('notes', 'text', 0), def('employees', 'number', 1), def('met', 'date', 2), def('vip', 'checkbox', 3), def('linkedin', 'url', 4), def('source', 'select', 5, { options }), def('old', 'text', 6, { archived: true })];
  const config = withCustomFields(exampleConfig(), { contact: fields, company: [], opportunity: [] });
  const stored = { ...ava, customFields: { employees: 'many', linkedin: 'https://linkedin.example/ava', source: 'referral' } };
  await open(page, [acme, stored, deal], {}, config);
  await visit(page, '/settings');
  await checkPage(page, 'custom fields: Settings');
  await visit(page, `/contacts/${ava.id}`);
  await checkPage(page, 'custom fields: a contact');
  await visit(page, `/contacts/${ava.id}/edit`);
  await field(page, 'employees').fill('1,200');
  await page.getByRole('button', { name: 'Save contact' }).click();
  await expect(field(page, 'employees')).toBeFocused();
  await checkPage(page, 'custom fields: field errors');
});

// docs/10, "Nonfunctional probes": keyboard-only contact creation, an error, and a stage move.
test('with the keyboard only: create a contact, fix an empty Name, and move an opportunity', async ({ page }) => {
  await open(page, records);
  const tabTo = async (target: ReturnType<Page['getByRole']>) => {
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press('Tab');
      if (await target.evaluate((el) => el === document.activeElement)) return;
    }
    throw new Error(`Tab never reached ${target}`);
  };
  const nav = page.getByRole('navigation', { name: 'Main' });

  await tabTo(nav.getByRole('link', { name: 'Contacts' }));
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: 'Contacts' })).toBeFocused();
  await tabTo(page.getByRole('link', { name: 'New contact' }));
  await page.keyboard.press('Enter');
  await tabTo(page.getByRole('button', { name: 'Save contact' }));
  await page.keyboard.press('Enter');
  await expect(field(page, 'Name')).toBeFocused();
  await expect(field(page, 'Name')).toHaveAccessibleDescription('Enter a name.');
  await page.keyboard.type('Ben Carter');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: 'Ben Carter' })).toBeFocused();
  await expect(status(page)).toHaveText(/Saved/);

  await tabTo(nav.getByRole('link', { name: 'Pipeline' }));
  await page.keyboard.press('Enter');
  await tabTo(page.getByLabel('Move Website rebuild to stage'));
  await page.keyboard.press('ArrowDown');
  const qualified = page.getByRole('region', { name: 'Qualified', exact: true });
  await expect(qualified.getByRole('link', { name: 'Website rebuild' })).toBeVisible();
});

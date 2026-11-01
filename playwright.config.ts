import { defineConfig, devices } from '@playwright/test';

// The tests run against the built app, so every test runs under its Content Security Policy
// (docs/07). The developer page (Phase 1) is not built, so its test uses the dev server.
const appPort = 5200;
const devPort = 5199;
const pagesPort = 5201;
// CI tests the build that it deploys (spec 09): E2E_BUILD names that folder. Otherwise each run
// builds fresh, because a reused build could be an old one.
const built = process.env.E2E_BUILD ?? 'node_modules/.e2e-dist';
const build = process.env.E2E_BUILD ? '' : `npx vite build --outDir ${built} --emptyOutDir --logLevel warn && `;

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: Boolean(process.env.CI),
  reporter: 'list',
  projects: [
    { name: 'app', testIgnore: /(dev-page|bench)\.spec\.ts/, use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${appPort}` } },
    { name: 'dev-page', testMatch: /dev-page\.spec\.ts/, use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${devPort}` } },
    // The same build from a folder, with no custom headers: the GitHub Pages shape (spec 09).
    { name: 'github-pages', testMatch: /(journey|security|hosting)\.spec\.ts/, use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${pagesPort}/GitCRM/` } },
    // Timings for docs/06, only with BENCH=1 (e2e/bench.spec.ts).
    ...(process.env.BENCH ? [{ name: 'bench', testMatch: /bench\.spec\.ts/, use: { ...devices['Desktop Chrome'], baseURL: process.env.BENCH_URL ?? `http://localhost:${appPort}/` } }] : []),
  ],
  webServer: [
    {
      command: `${build}npx vite preview --outDir ${built} --port ${appPort} --strictPort`,
      url: `http://localhost:${appPort}/`,
      reuseExistingServer: false,
    },
    {
      // Starts after the server above, so the build is there.
      command: `npx vite preview --outDir ${built} --base /GitCRM/ --port ${pagesPort} --strictPort`,
      url: `http://localhost:${pagesPort}/GitCRM/`,
      reuseExistingServer: false,
    },
    {
      command: `npx vite --port ${devPort} --strictPort`,
      url: `http://localhost:${devPort}/dev.html`,
      // Never reuse: another app on this port would answer, and the tests would check that app.
      reuseExistingServer: false,
    },
  ],
});

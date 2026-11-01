import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { CSP, HEADERS } from './scripts/csp.ts';

// The Content Security Policy goes into the built page only, right after the charset and before
// every script and stylesheet. The dev server needs inline scripts and a WebSocket. The build also
// gets a _headers file for hosts that read one, such as Cloudflare Pages (spec 09).
const csp: Plugin = {
  name: 'gitcrm-csp',
  apply: 'build',
  transformIndexHtml(html) {
    const charset = '<meta charset="UTF-8" />';
    if (!html.includes(charset)) throw new Error(`index.html needs ${charset}, so the policy can follow it`);
    return html.replace(charset, `${charset}\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`);
  },
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: '_headers', source: HEADERS });
  },
};

export default defineConfig({
  // Relative asset paths keep the build host-agnostic (ADR-010).
  base: './',
  plugins: [react(), tailwindcss(), csp],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
});

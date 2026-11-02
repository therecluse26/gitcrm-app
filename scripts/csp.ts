// The Content Security Policy of the built app (ADR-010, docs/07). Vite puts it in a <meta> tag,
// and the build audit checks it. A <meta> policy cannot set frame-ancestors: the host sends that
// header, and the app refuses to run inside a frame.
export const CSP_DIRECTIVES: [directive: string, value: string][] = [
  ['default-src', "'none'"], // anything not listed here: frames, workers, objects, media, images
  ['script-src', "'self'"], // the app's own bundle only: no inline script, no eval
  ['style-src', "'self'"],
  ['font-src', "'self'"], // the bundled IBM Plex font files
  ['connect-src', 'https://api.github.com'], // the PAT and CRM data can reach no other site
  ['base-uri', "'none'"], // a planted <base> tag cannot move the relative asset paths
  ['form-action', "'none'"], // forms never submit natively; the app handles them in script
  // Trusted Types: a string can never become HTML or script, the usual way into an XSS. The app
  // needs no policy: only React DOM has such sinks, for elements GitCRM never renders.
  ['require-trusted-types-for', "'script'"],
  ['trusted-types', "'none'"],
];

export const CSP = CSP_DIRECTIVES.map(([directive, value]) => `${directive} ${value}`).join('; ');

// The build's _headers file (spec 09). A host that reads it, such as Cloudflare Pages, sends the
// same policy as a header, with frame-ancestors, so no other site can frame the app. GitHub Pages
// serves it as a plain file. X-Robots-Tag repeats the robots meta tag in index.html: each owner's
// site is a front end to private data, so search engines leave it out.
export const HEADERS = `/*\n  Content-Security-Policy: ${CSP}; frame-ancestors 'none'\n  X-Robots-Tag: noindex\n`;

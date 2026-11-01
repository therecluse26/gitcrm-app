// The static bundle audit (docs/07, "Content Security Policy and build audit"). `npm run build`
// runs it on dist/, and any finding fails the build. Usage: node scripts/check-build.ts [dir]
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

// Every host named in the bundle. Only api.github.com receives requests (connect-src); the others
// are plain text. A new host fails the build until someone reviews it and adds it here.
const REVIEWED_HOSTS = new Set([
  'api.github.com', // the GitHub REST and GraphQL APIs
  'github.com', // links: the token form, commits
  'www.w3.org', // SVG and XML namespaces
  'json-schema.org', // $schema in the exported JSON Schemas
  'example.com', // form hints, such as "https://example.com"
  'localhost', // the router's fallback origin
  'react.dev', // links in React's error messages
  'base-ui.com', // links in Base UI's error messages
  'tailwindcss.com', // Tailwind's license comment
]);

const FILE = /^(index\.html|_headers|assets\/[\w.-]+\.(js|css|woff2))$/;
const TOKEN = /\b(gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})/;
const EMAIL = /[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+\.)+[A-Za-z]{2,}/g;
// Reserved for examples (RFC 2606, RFC 6761): an address here is a hint, not someone's address.
const EXAMPLE_DOMAIN = /@(([a-z0-9-]+\.)*example\.(com|org|net)|([a-z0-9-]+\.)+(example|test))$/i;
const POLICY_META = /<meta http-equiv="Content-Security-Policy" content="([^"]*)"\s*\/?>/;

function auditPolicy(policy: string): string[] {
  const directives = new Map(policy.split(';').map((part) => part.trim().split(/\s+/)).map(([name, ...values]) => [name, values.join(' ')]));
  const problems: string[] = [];
  if (directives.get('default-src') !== "'none'") problems.push("The policy's default-src must be 'none'");
  if (directives.get('script-src') !== "'self'") problems.push("The policy's script-src must be exactly 'self'");
  if (directives.get('connect-src') !== 'https://api.github.com') problems.push("The policy's connect-src must be exactly https://api.github.com");
  if (directives.get('require-trusted-types-for') !== "'script'") problems.push('The policy must require Trusted Types for scripts');
  for (const unsafe of ["'unsafe-inline'", "'unsafe-eval'", "'unsafe-hashes'", "'wasm-unsafe-eval'"]) {
    if (policy.includes(unsafe)) problems.push(`The policy allows ${unsafe}`);
  }
  return problems;
}

function auditPage(html: string): string[] {
  const policy = POLICY_META.exec(html);
  if (!policy) return ['index.html has no Content Security Policy meta tag'];
  const problems: string[] = [];
  const firstResource = html.search(/<script|<link/);
  if (firstResource !== -1 && firstResource < policy.index) problems.push('index.html: the Content Security Policy must come before every script and stylesheet');
  problems.push(...auditPolicy(policy[1]));
  if (/<script(?![^>]*\bsrc=)[^>]*>/.test(html)) problems.push('index.html has an inline script');
  if (/<style[\s>]|\sstyle=/.test(html)) problems.push('index.html has an inline style');
  if (/\son[a-z]+=/.test(html)) problems.push('index.html has an event handler attribute');
  if (!/<meta name="robots" content="noindex"\s*\/?>/.test(html)) problems.push('index.html has no <meta name="robots" content="noindex"> tag');
  return problems;
}

// Hosts such as Cloudflare Pages read _headers (spec 09): a URL pattern on its own line, then
// indented `Name: value` lines, or `! Name` to remove a header. A line may hold at most 2,000 characters.
function auditHeaders(text: string, policy: string | undefined): string[] {
  const problems: string[] = [];
  const rules: { pattern: string; headers: string[] }[] = [];
  text.split('\n').forEach((line, i) => {
    if (line.length > 2000) problems.push(`_headers: line ${i + 1} is longer than 2,000 characters`);
    if (line.trim() === '' || line.trim().startsWith('#')) return;
    if (/^\s/.test(line)) rules.at(-1)?.headers.push(line.trim());
    else rules.push({ pattern: line.trim(), headers: [] });
  });
  const touchesPolicy = (header: string) => /^(!\s*)?content-security-policy\s*(:|$)/i.test(header);
  const all = rules.find(({ pattern }) => pattern === '/*')?.headers.filter(touchesPolicy) ?? [];
  if (all.length !== 1 || all[0] !== `Content-Security-Policy: ${policy}; frame-ancestors 'none'`) {
    problems.push(`_headers: the /* rule must send the policy from index.html, then "; frame-ancestors 'none'"`);
  }
  for (const { pattern, headers } of rules) {
    if (pattern !== '/*' && headers.some(touchesPolicy)) problems.push(`_headers: the ${pattern} rule changes the Content-Security-Policy header`);
  }
  return problems;
}

// `files`: each built file's path, relative to the build folder, and its text.
export function auditBuild(files: Map<string, string>): string[] {
  const problems: string[] = [];
  for (const [path, text] of files) {
    if (!FILE.test(path)) {
      problems.push(`Unexpected file in the build: ${path}`);
      continue;
    }
    if (path.endsWith('.woff2')) continue;
    if (path === 'index.html') problems.push(...auditPage(text));
    if (path === '_headers') problems.push(...auditHeaders(text, POLICY_META.exec(files.get('index.html') ?? '')?.[1]));
    if (/sourceMappingURL=/.test(text)) problems.push(`${path} links a source map`);
    if (TOKEN.test(text)) problems.push(`${path} holds something shaped like a GitHub token`);
    for (const [email] of text.matchAll(EMAIL)) if (!EXAMPLE_DOMAIN.test(email)) problems.push(`${path} holds an email address: ${email}`);
    const hosts = new Set([...text.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map(([, host]) => host.toLowerCase().replace(/\.$/, '')));
    for (const host of hosts) if (!REVIEWED_HOSTS.has(host)) problems.push(`${path} names a host that nobody reviewed: ${host}`);
  }
  if (!files.has('index.html')) problems.push('The build has no index.html');
  if (!files.has('_headers')) problems.push('The build has no _headers file');
  return problems;
}

async function readBuild(dir: string): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  for (const entry of await readdir(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    files.set(relative(dir, path).split('\\').join('/'), entry.name.endsWith('.woff2') ? '' : await readFile(path, 'utf8'));
  }
  return files;
}

if (import.meta.main) {
  const dir = process.argv[2] ?? 'dist';
  const problems = auditBuild(await readBuild(dir));
  if (problems.length > 0) {
    console.error(`The build audit found ${problems.length} problem(s) in ${dir}/:\n${problems.map((p) => `- ${p}`).join('\n')}`);
    process.exit(1);
  }
  console.log(`Build audit: ${dir}/ passed.`);
}

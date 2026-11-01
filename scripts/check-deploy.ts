// The live check (spec 09). After each deploy, the workflow checks that the site serves every
// file of this build byte for byte. GitHub Pages sends no custom headers, so the check reads only
// bytes. It tries 6 times, 10 seconds apart, because a new deployment can take a moment to reach
// every request.
// Usage: node scripts/check-deploy.ts <site url> [dir]
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const TRIES = 6;
const PAUSE_MS = 10_000;

const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((byte, i) => byte === b[i]);

// `files`: each built file's path, relative to the build folder, and its bytes.
export async function checkDeploy(site: URL, files: Map<string, Uint8Array>, get: (url: URL) => Promise<Response> = fetch): Promise<string[]> {
  const problems: string[] = [];
  for (const [path, bytes] of files) {
    const url = new URL(path === 'index.html' ? './' : path, site);
    let response: Response;
    // A request that fails, such as a TLS handshake while a new site gets its certificate, is a
    // problem like any other, so the caller tries again.
    try {
      response = await get(url);
    } catch (error) {
      const { message, cause } = error as Error;
      problems.push(`${url}: ${message}${cause instanceof Error ? ` (${cause.message.trim()})` : ''}`);
      continue;
    }
    if (!response.ok) problems.push(`${url}: HTTP ${response.status}`);
    else if (!same(new Uint8Array(await response.arrayBuffer()), bytes)) problems.push(`${url} differs from the build`);
  }
  return problems;
}

async function readBuild(dir: string): Promise<Map<string, Uint8Array>> {
  const files = new Map<string, Uint8Array>();
  for (const entry of await readdir(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    files.set(relative(dir, path).split('\\').join('/'), await readFile(path));
  }
  return files;
}

if (import.meta.main) {
  const [site, dir = 'dist'] = process.argv.slice(2);
  if (!site) throw new Error('Usage: node scripts/check-deploy.ts <site url> [dir]');
  const files = await readBuild(dir);
  for (let attempt = 1; ; attempt++) {
    const problems = await checkDeploy(new URL(site), files);
    if (problems.length === 0) {
      console.log(`Live check: ${site} serves ${dir}/.`);
      break;
    }
    if (attempt === TRIES) {
      console.error(`The live check found ${problems.length} problem(s) at ${site} after ${TRIES} tries:\n${problems.map((p) => `- ${p}`).join('\n')}`);
      process.exit(1);
    }
    await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
  }
}

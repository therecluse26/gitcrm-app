// The template update (spec 11, ADR-026). Runs in a copy of the template, from the copy's own
// main, before any template file is in the working tree. When the release is newer than the
// version in package.json, it commits the template's files at that tag on the branch
// template-update/<tag>, except .github/workflows/: the workflow's own token cannot change those,
// so the pull request lists them instead.
// Usage: node scripts/template-update.ts <owner/repo> <release tag> <out dir>
// Prints the branch name, or nothing when the copy is up to date, and writes <out dir>/body.md.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const WORKFLOWS = '.github/workflows';

function parseVersion(text: string): number[] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(text);
  return match && match.slice(1).map(Number);
}

export function isNewer(tag: string, current: string): boolean {
  const release = tag.startsWith('v') ? parseVersion(tag.slice(1)) : null;
  if (!release) throw new Error(`The release tag ${tag} is not vMAJOR.MINOR.PATCH`);
  const copy = parseVersion(current);
  if (!copy) throw new Error(`The version ${current} in package.json is not MAJOR.MINOR.PATCH`);
  const i = release.findIndex((n, at) => n !== copy[at]);
  return i !== -1 && release[i] > copy[i];
}

// `source` is the URL that git fetches the tag from; tests pass a local folder.
export function prepareUpdate({ dir, template, source, tag }: { dir: string; template: string; source: string; tag: string }): { branch: string; body: string } | null {
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
  const current = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version;
  if (!isNewer(tag, current)) return null;

  git('fetch', '-q', '--no-tags', '--depth', '1', source, `refs/tags/${tag}:refs/tags/${tag}`);
  // Workflow files that the template added or changed by this tag.
  const workflows = git('diff', '--name-only', '--no-renames', '--diff-filter=AM', 'HEAD', tag, '--', WORKFLOWS).split('\n').filter(Boolean);
  const branch = `template-update/${tag}`;
  git('switch', '-q', '-c', branch);
  git('rm', '-rq', '--', '.', `:!${WORKFLOWS}`);
  git('checkout', tag, '--', '.', `:!${WORKFLOWS}`);
  const bot = ['-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com'];
  git(...bot, 'commit', '-q', '--allow-empty', '-m', `Update GitCRM to ${tag}`);

  const web = `https://github.com/${template}`;
  const lines = [
    `GitCRM ${tag} is out. This copy runs ${current}.`,
    '',
    `Release notes: ${web}/releases/tag/${tag}`,
    '',
    `The branch ${branch} makes every file the same as the template at ${tag}, except \`${WORKFLOWS}/\`. A change of your own to one of these files is replaced too, so review the diff before you merge. After the merge, the Deploy workflow deploys the new version.`,
  ];
  if (workflows.length > 0) {
    lines.push('', `The workflow's own token cannot change workflow files. After the merge, copy each of these files from ${tag} by hand:`, '');
    lines.push(...workflows.map((path) => `- [${path}](${web}/blob/${tag}/${path})`));
  }
  return { branch, body: `${lines.join('\n')}\n` };
}

if (import.meta.main) {
  const [template, tag, out] = process.argv.slice(2);
  if (!template || !tag || !out) throw new Error('Usage: node scripts/template-update.ts <owner/repo> <release tag> <out dir>');
  const update = prepareUpdate({ dir: process.cwd(), template, source: `https://github.com/${template}.git`, tag });
  if (update) {
    writeFileSync(join(out, 'body.md'), update.body);
    console.log(update.branch);
  }
}

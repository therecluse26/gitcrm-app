// The template update (spec 11, ADR-026). Runs in a copy of the template, from the copy's own
// main, before any template file is in the working tree. When the release is newer than the
// version in package.json, it commits the template's files at that tag on the current branch,
// except .github/workflows/: the workflow's own token cannot change those, so the run summary
// lists them instead.
// Usage: node scripts/template-update.ts <owner/repo> <release tag> <out dir>
// Writes <out dir>/summary.md only when it made the commit, and <out dir>/workflows.txt when the
// release also changed workflow files.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isNewer } from '../src/core/version.ts';

const WORKFLOWS = '.github/workflows';

// `source` is the URL that git fetches the tag from; tests pass a local folder.
export function applyUpdate({ dir, template, source, tag }: { dir: string; template: string; source: string; tag: string }): { summary: string; workflows: string[] } | null {
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
  const current = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version;
  if (!isNewer(tag, current)) return null;

  git('fetch', '-q', '--no-tags', '--depth', '1', source, `refs/tags/${tag}:refs/tags/${tag}`);
  // Otherwise the copy reports its old version afterwards, and the app offers the update again.
  const released = JSON.parse(git('show', `${tag}:package.json`)).version;
  if (`v${released}` !== tag) throw new Error(`The release ${tag} has version ${released} in package.json. A release tag must be v<version>.`);
  // Workflow files that the template added or changed by this tag.
  const workflows = git('diff', '--name-only', '--no-renames', '--diff-filter=AM', 'HEAD', tag, '--', WORKFLOWS).split('\n').filter(Boolean);
  git('rm', '-rq', '--', '.', `:!${WORKFLOWS}`);
  git('checkout', tag, '--', '.', `:!${WORKFLOWS}`);
  const bot = ['-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com'];
  git(...bot, 'commit', '-q', '--allow-empty', '-m', `Update GitCRM to ${tag}`);

  const web = `https://github.com/${template}`;
  const lines = [
    `This copy now runs GitCRM ${tag}. It ran ${current}.`,
    '',
    `Release notes: ${web}/releases/tag/${tag}`,
    '',
    `Every file is now the same as the template at ${tag}, except \`${WORKFLOWS}/\`. To undo the update, revert its commit. The Deploy workflow deploys the new version.`,
  ];
  if (workflows.length > 0) {
    lines.push('', `The workflow's own token cannot change workflow files. Copy each of these files from ${tag} by hand:`, '');
    lines.push(...workflows.map((path) => `- [${path}](${web}/blob/${tag}/${path})`));
  }
  return { summary: `${lines.join('\n')}\n`, workflows };
}

// One GitHub error annotation, which the run shows without a stack trace. GitHub's escapes keep a
// message of several lines, such as a failed git command's, in one annotation.
export function errorAnnotation(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `::error::${message.trimEnd().replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')}`;
}

if (import.meta.main) {
  try {
    const [template, tag, out] = process.argv.slice(2);
    if (!template || !tag || !out) throw new Error('Usage: node scripts/template-update.ts <owner/repo> <release tag> <out dir>');
    const update = applyUpdate({ dir: process.cwd(), template, source: `https://github.com/${template}.git`, tag });
    if (update) {
      writeFileSync(join(out, 'summary.md'), update.summary);
      if (update.workflows.length > 0) writeFileSync(join(out, 'workflows.txt'), `${update.workflows.join('\n')}\n`);
    }
  } catch (error) {
    console.log(errorAnnotation(error));
    process.exitCode = 1;
  }
}

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applyUpdate } from './template-update.ts';

describe('applyUpdate', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  function repo(files: Record<string, string>): string {
    const dir = mkdtempSync(join(tmpdir(), 'gitcrm-update-'));
    dirs.push(dir);
    git(dir, 'init', '-q', '-b', 'main');
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), text);
    }
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', 'first');
    return dir;
  }
  const git = (dir: string, ...args: string[]) =>
    execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args], { cwd: dir, encoding: 'utf8' }).trim();
  const version = (v: string) => JSON.stringify({ name: 'gitcrm', version: v });

  // The template at v0.2.0, and a copy of v0.1.0 with a workflow of its own.
  function setUp() {
    const template = repo({
      'package.json': version('0.2.0'),
      'src/app.ts': 'new',
      'src/added.ts': 'added',
      '.github/workflows/deploy.yml': 'deploy v2',
      '.github/workflows/new.yml': 'new workflow',
    });
    git(template, 'tag', '-a', 'v0.2.0', '-m', 'v0.2.0');
    const copy = repo({
      'package.json': version('0.1.0'),
      'src/app.ts': 'old',
      'src/removed.ts': 'removed',
      '.github/workflows/deploy.yml': 'deploy v1',
      '.github/workflows/mine.yml': 'my workflow',
    });
    return { template, copy };
  }

  it("commits the template's files at the tag on the copy's branch, except .github/workflows/", () => {
    const { template, copy } = setUp();
    expect(applyUpdate({ dir: copy, template: 'octo-dev/GitCRM', source: template, tag: 'v0.2.0' })).not.toBeNull();
    expect(git(copy, 'branch', '--show-current')).toBe('main');
    expect(git(copy, 'ls-files').split('\n')).toEqual(['.github/workflows/deploy.yml', '.github/workflows/mine.yml', 'package.json', 'src/added.ts', 'src/app.ts']);
    expect(readFileSync(join(copy, 'src/app.ts'), 'utf8')).toBe('new');
    expect(readFileSync(join(copy, '.github/workflows/deploy.yml'), 'utf8')).toBe('deploy v1');
    expect(git(copy, 'status', '--porcelain')).toBe('');
    expect(git(copy, 'log', '-1', '--format=%s')).toBe('Update GitCRM to v0.2.0');
    expect(git(copy, 'rev-list', '--count', 'HEAD')).toBe('2'); // one commit on top of the copy's main
  });

  it('writes a run summary, and lists the workflow files to copy by hand', () => {
    const { template, copy } = setUp();
    const { summary, workflows } = applyUpdate({ dir: copy, template: 'octo-dev/GitCRM', source: template, tag: 'v0.2.0' })!;
    expect(summary).toContain('This copy now runs GitCRM v0.2.0. It ran 0.1.0.');
    expect(summary).toContain('https://github.com/octo-dev/GitCRM/releases/tag/v0.2.0');
    expect(summary).toContain('- [.github/workflows/deploy.yml](https://github.com/octo-dev/GitCRM/blob/v0.2.0/.github/workflows/deploy.yml)');
    expect(summary).toContain('- [.github/workflows/new.yml](https://github.com/octo-dev/GitCRM/blob/v0.2.0/.github/workflows/new.yml)');
    expect(summary).not.toContain('mine.yml'); // the template does not have it, so there is nothing to copy
    expect(workflows).toEqual(['.github/workflows/deploy.yml', '.github/workflows/new.yml']);
  });

  it('does nothing when the copy is as new as the release', () => {
    const { template, copy } = setUp();
    writeFileSync(join(copy, 'package.json'), version('0.2.0'));
    git(copy, 'commit', '-qam', 'already 0.2.0');
    expect(applyUpdate({ dir: copy, template: 'octo-dev/GitCRM', source: template, tag: 'v0.2.0' })).toBeNull();
    expect(git(copy, 'rev-list', '--count', 'HEAD')).toBe('2');
    expect(git(copy, 'tag')).toBe(''); // nothing fetched
  });

  // Otherwise the copy would report the old version, and offer the same update again.
  it('refuses a release whose package.json has another version, and changes nothing', () => {
    const { template, copy } = setUp();
    git(template, 'tag', '-a', 'v0.3.0', '-m', 'v0.3.0');
    expect(() => applyUpdate({ dir: copy, template: 'octo-dev/GitCRM', source: template, tag: 'v0.3.0' })).toThrow(
      'The release v0.3.0 has version 0.2.0 in package.json. A release tag must be v<version>.',
    );
    expect(git(copy, 'rev-list', '--count', 'HEAD')).toBe('1');
    expect(git(copy, 'status', '--porcelain')).toBe('');
  });
});

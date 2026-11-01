import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { isNewer, prepareUpdate } from './template-update.ts';

describe('isNewer', () => {
  it('compares vMAJOR.MINOR.PATCH with the copy version, number by number', () => {
    expect(isNewer('v0.2.0', '0.1.0')).toBe(true);
    expect(isNewer('v0.10.0', '0.9.3')).toBe(true);
    expect(isNewer('v1.0.0', '0.99.99')).toBe(true);
    expect(isNewer('v0.1.0', '0.1.0')).toBe(false);
    expect(isNewer('v0.1.0', '0.2.0')).toBe(false);
  });

  it('refuses a tag or a version in another form', () => {
    expect(() => isNewer('release-2', '0.1.0')).toThrow('The release tag release-2 is not vMAJOR.MINOR.PATCH');
    expect(() => isNewer('v0.2.0-beta', '0.1.0')).toThrow('The release tag v0.2.0-beta is not vMAJOR.MINOR.PATCH');
    expect(() => isNewer('v0.2.0', 'latest')).toThrow('The version latest in package.json is not MAJOR.MINOR.PATCH');
  });
});

describe('prepareUpdate', () => {
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

  it("makes a branch with the template's files at the tag, except .github/workflows/", () => {
    const { template, copy } = setUp();
    const update = prepareUpdate({ dir: copy, template: 'octo-dev/GitCRM', source: template, tag: 'v0.2.0' });
    expect(update?.branch).toBe('template-update/v0.2.0');
    expect(git(copy, 'branch', '--show-current')).toBe('template-update/v0.2.0');
    expect(git(copy, 'ls-files').split('\n')).toEqual(['.github/workflows/deploy.yml', '.github/workflows/mine.yml', 'package.json', 'src/added.ts', 'src/app.ts']);
    expect(readFileSync(join(copy, 'src/app.ts'), 'utf8')).toBe('new');
    expect(readFileSync(join(copy, '.github/workflows/deploy.yml'), 'utf8')).toBe('deploy v1');
    expect(git(copy, 'status', '--porcelain')).toBe('');
    expect(git(copy, 'log', '-1', '--format=%s')).toBe('Update GitCRM to v0.2.0');
    expect(git(copy, 'rev-list', '--count', 'HEAD')).toBe('2'); // one commit on top of the copy's main
  });

  it('writes a pull request body that lists the workflow files to copy by hand', () => {
    const { template, copy } = setUp();
    const { body } = prepareUpdate({ dir: copy, template: 'octo-dev/GitCRM', source: template, tag: 'v0.2.0' })!;
    expect(body).toContain('GitCRM v0.2.0 is out. This copy runs 0.1.0.');
    expect(body).toContain('https://github.com/octo-dev/GitCRM/releases/tag/v0.2.0');
    expect(body).toContain('- [.github/workflows/deploy.yml](https://github.com/octo-dev/GitCRM/blob/v0.2.0/.github/workflows/deploy.yml)');
    expect(body).toContain('- [.github/workflows/new.yml](https://github.com/octo-dev/GitCRM/blob/v0.2.0/.github/workflows/new.yml)');
    expect(body).not.toContain('mine.yml'); // the template does not have it, so there is nothing to copy
  });

  it('does nothing when the copy is as new as the release', () => {
    const { template, copy } = setUp();
    writeFileSync(join(copy, 'package.json'), version('0.2.0'));
    git(copy, 'commit', '-qam', 'already 0.2.0');
    expect(prepareUpdate({ dir: copy, template: 'octo-dev/GitCRM', source: template, tag: 'v0.2.0' })).toBeNull();
    expect(git(copy, 'branch', '--show-current')).toBe('main');
    expect(git(copy, 'tag')).toBe(''); // nothing fetched
  });
});

import { describe, expect, it } from 'vitest';
import { newRecord } from '@/core/records.ts';
import type { Task } from '@/core/schemas.ts';
import { isDue, isOverdue, listTasks, pageGroups } from './task-list.ts';

const now = new Date('2026-10-29T12:00:00Z');
const today = '2026-10-29';

function task(title: string, changes: Partial<Task> = {}): Task {
  return { ...newRecord('task', { title, description: '', dueDate: null, completedAt: null, related: null }, { now }), ...changes };
}

const titles = (result: ReturnType<typeof listTasks>) => result.groups.map((g) => [g.name, g.tasks.map((t) => t.title)]);
const open = { show: 'open', showArchived: false, page: 0 } as const;

describe('isOverdue and isDue', () => {
  it('compare the due date with the local calendar date, so a task due today is not overdue', () => {
    expect(isOverdue(task('a', { dueDate: '2026-10-28' }), today)).toBe(true);
    expect(isOverdue(task('b', { dueDate: today }), today)).toBe(false);
    expect(isOverdue(task('c'), today)).toBe(false);
    expect(isDue(task('b', { dueDate: today }), today)).toBe(true);
    expect(isDue(task('d', { dueDate: '2026-10-30' }), today)).toBe(false);
  });

  it('never count a completed task', () => {
    const done = task('a', { dueDate: '2026-10-01', completedAt: '2026-10-02T09:00:00Z' });
    expect(isOverdue(done, today)).toBe(false);
    expect(isDue(done, today)).toBe(false);
  });
});

describe('listTasks', () => {
  it('groups open tasks into Overdue and Upcoming, by due date, with undated tasks last', () => {
    const tasks = [
      task('Send contract'),
      task('Book call', { dueDate: '2026-11-02' }),
      task('Follow up', { dueDate: today }),
      task('Pay invoice', { dueDate: '2026-10-20' }),
      task('Call back', { dueDate: '2026-10-28' }),
      task('Done', { dueDate: '2026-10-01', completedAt: '2026-10-02T09:00:00Z' }),
    ];
    expect(titles(listTasks(tasks, today, open))).toEqual([
      ['Overdue', ['Pay invoice', 'Call back']],
      ['Upcoming', ['Follow up', 'Book call', 'Send contract']],
    ]);
  });

  it('leaves out an empty group', () => {
    expect(titles(listTasks([task('Book call', { dueDate: '2026-11-02' })], today, open))).toEqual([['Upcoming', ['Book call']]]);
    expect(listTasks([], today, open).groups).toEqual([]);
  });

  it('shows completed tasks, most recently completed first', () => {
    const tasks = [
      task('Older', { completedAt: '2026-10-20T09:00:00Z' }),
      task('Open'),
      task('Newer', { completedAt: '2026-10-28T09:00:00Z' }),
    ];
    expect(titles(listTasks(tasks, today, { ...open, show: 'completed' }))).toEqual([['Completed', ['Newer', 'Older']]]);
  });

  it('hides archived tasks and counts them, unless asked to show them', () => {
    const tasks = [task('Kept'), task('Archived', { archivedAt: '2026-10-28T09:00:00Z' }), task('Archived done', { completedAt: '2026-10-28T09:00:00Z', archivedAt: '2026-10-28T09:00:00Z' })];
    expect(listTasks(tasks, today, open)).toMatchObject({ shown: 1, hiddenArchived: 1 });
    expect(titles(listTasks(tasks, today, { ...open, showArchived: true }))).toEqual([['Upcoming', ['Archived', 'Kept']]]);
  });
});

describe('pageGroups (spec 08)', () => {
  const overdue = Array.from({ length: 30 }, (_, i) => task(`Late ${i}`, { dueDate: '2026-10-01' }));
  const upcoming = Array.from({ length: 40 }, (_, i) => task(`Soon ${i}`, { dueDate: '2026-11-01' }));
  const { groups } = listTasks([...upcoming, ...overdue], today, open);

  it('pages the groups as one list, so a page can end in Overdue and go on in Upcoming', () => {
    const first = pageGroups(groups, 0);
    expect(first.groups.map((g) => [g.name, g.tasks.length])).toEqual([['Overdue', 30], ['Upcoming', 20]]);
    expect(first.page).toMatchObject({ index: 0, count: 2, from: 1, to: 50, total: 70 });
    const second = pageGroups(groups, 1);
    expect(second.groups.map((g) => [g.name, g.tasks.length])).toEqual([['Upcoming', 20]]);
    expect([...first.groups[1].tasks, ...second.groups[0].tasks]).toEqual(groups[1].tasks);
  });

  it('shows the last page when the list got shorter', () => {
    expect(pageGroups(groups, 5).page).toMatchObject({ index: 1, from: 51, to: 70 });
  });
});

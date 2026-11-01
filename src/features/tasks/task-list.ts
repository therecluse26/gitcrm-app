// The Tasks list (spec 04): open tasks grouped into Overdue and Upcoming, or the completed tasks.
// "Overdue" compares the due date with today's local date when the list shows; no background
// service marks anything.
import type { Task } from '@/core/schemas.ts';
import { onePage, type Page } from '../list-page.ts';

export type TaskView = { show: 'open' | 'completed'; showArchived: boolean; page: number };
export const DEFAULT_TASK_VIEW: TaskView = { show: 'open', showArchived: false, page: 0 };

export type TaskGroup = { name: 'Overdue' | 'Upcoming' | 'Completed'; tasks: Task[] };

type Dated = Pick<Task, 'dueDate' | 'completedAt'>;
export const isOverdue = (task: Dated, today: string) => task.completedAt === null && task.dueDate !== null && task.dueDate < today;
export const isDue = (task: Dated, today: string) => task.completedAt === null && task.dueDate !== null && task.dueDate <= today;

const byTitle = (a: Task, b: Task) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }) || (a.id < b.id ? -1 : 1);

// Earliest due date first; a task with no due date comes last.
export function compareOpen(a: Task, b: Task): number {
  if (a.dueDate === b.dueDate) return byTitle(a, b);
  if (a.dueDate === null || b.dueDate === null) return a.dueDate === null ? 1 : -1;
  return a.dueDate < b.dueDate ? -1 : 1;
}

const byCompleted = (a: Task, b: Task) => Date.parse(b.completedAt!) - Date.parse(a.completedAt!) || byTitle(a, b);

export function listTasks(tasks: Task[], today: string, view: Pick<TaskView, 'show' | 'showArchived'>): { groups: TaskGroup[]; shown: number; hiddenArchived: number } {
  const matching = tasks.filter((task) => (task.completedAt !== null) === (view.show === 'completed'));
  const shown = view.showArchived ? matching : matching.filter((task) => task.archivedAt === null);
  const groups: TaskGroup[] =
    view.show === 'completed'
      ? [{ name: 'Completed', tasks: shown.toSorted(byCompleted) }]
      : [
          { name: 'Overdue', tasks: shown.filter((task) => isOverdue(task, today)).sort(compareOpen) },
          { name: 'Upcoming', tasks: shown.filter((task) => !isOverdue(task, today)).sort(compareOpen) },
        ];
  return { groups: groups.filter((group) => group.tasks.length > 0), shown: shown.length, hiddenArchived: matching.length - shown.length };
}

// The groups in pages of 50 as one list (spec 08): a page can end in Overdue and go on in Upcoming.
export function pageGroups(groups: TaskGroup[], index: number): { groups: TaskGroup[]; page: Page<Task> } {
  const page = onePage(groups.flatMap((group) => group.tasks), index);
  const onPage = new Set(page.rows);
  return { groups: groups.map((group) => ({ ...group, tasks: group.tasks.filter((task) => onPage.has(task)) })).filter((group) => group.tasks.length > 0), page };
}

import type { Task } from '@/core/schemas.ts';
import { formatCalendarDate, formatDate } from '../records.ts';
import { isOverdue } from './task-list.ts';

// Words, not only color, say that a task is overdue (docs/08).
export function dueText(task: Task, today: string): string {
  if (task.completedAt) return `Completed ${formatDate(task.completedAt)}`;
  if (!task.dueDate) return 'No due date';
  if (isOverdue(task, today)) return `Overdue · due ${formatCalendarDate(task.dueDate)}`;
  return task.dueDate === today ? 'Due today' : `Due ${formatCalendarDate(task.dueDate)}`;
}

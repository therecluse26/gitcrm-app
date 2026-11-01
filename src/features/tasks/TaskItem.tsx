// One task in a list: a checkbox to complete or reopen it, its title, when it is due, and its link.
// A memo: a save draws again only the row of the task that changed (docs/06).
import { Link } from '@tanstack/react-router';
import { memo } from 'react';
import { selectCanWrite, useApp } from '@/app/store.ts';
import { Checkbox } from '@/components/ui/checkbox';
import type { Task } from '@/core/schemas.ts';
import type { VersionedRecord } from '@/storage/workspace-repository.ts';
import { ArchivedBadge } from '@/ui/record-page.tsx';
import { RelatedLink } from '../RelatedRecord.tsx';
import { dueText } from './due-text.ts';
import { isOverdue } from './task-list.ts';

type Props = { saved: VersionedRecord<Task>; today: string; pending: boolean; onToggle: (saved: VersionedRecord<Task>) => unknown; showRelated: boolean };

export const TaskItem = memo(function TaskItem({ saved, today, pending, onToggle, showRelated }: Props) {
  const canWrite = useApp(selectCanWrite);
  const task = saved.record;
  // While the commit is pending, the checkbox shows the new state, and the task stays in its group.
  const checked = (task.completedAt !== null) !== pending;
  return (
    <li className="flex items-start gap-3 py-2">
      <Checkbox className="mt-0.5" aria-label={`Complete ${task.title}`} checked={checked} disabled={!canWrite} onCheckedChange={() => void onToggle(saved)} />
      <div className="flex min-w-0 flex-col gap-0.5 text-sm">
        <span className="flex flex-wrap items-center gap-2">
          <Link to="/tasks/$taskId" params={{ taskId: task.id }} className="font-medium break-words hover:underline">
            {task.title}
          </Link>
          {task.archivedAt && <ArchivedBadge />}
          {pending && <span role="status">Saving…</span>}
        </span>
        <span className={isOverdue(task, today) ? 'font-medium text-destructive' : 'text-muted-foreground'}>{dueText(task, today)}</span>
        {showRelated && task.related && (
          <span className="break-words text-muted-foreground">
            For <RelatedLink related={task.related} />
          </span>
        )}
      </div>
    </li>
  );
});

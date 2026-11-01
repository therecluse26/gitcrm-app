// One task (spec 04): details, its link, Complete or Reopen, Edit, Archive or Restore, and Delete.
import { Link, useParams } from '@tanstack/react-router';
import { selectCanWrite, selectReadOnly, useApp } from '@/app/store.ts';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { linkButton } from '@/ui/link-button.ts';
import { ArchivedBadge, Detail, Problem, RecordNotFound } from '@/ui/record-page.tsx';
import { formatCalendarDate, formatDate, useRecord } from '../records.ts';
import { RelatedLink } from '../RelatedRecord.tsx';
import { useArchive } from '../use-archive.ts';
import { useToday } from '../use-today.ts';
import { isOverdue } from './task-list.ts';
import { useCompletion } from './use-completion.ts';

const none = <span className="text-muted-foreground">None</span>;

export function TaskPage() {
  const { taskId } = useParams({ from: '/tasks/$taskId' });
  const saved = useRecord('task', taskId);
  const readOnly = useApp(selectReadOnly);
  const canWrite = useApp(selectCanWrite);
  const archive = useArchive(saved);
  const completion = useCompletion();
  const today = useToday();
  if (!saved) return <RecordNotFound singular="task" back={<Link to="/tasks" className="underline">Back to tasks</Link>} />;
  const task = saved.record;
  const completed = task.completedAt !== null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold break-words">{task.title}</h1>
        {archive.archived && <ArchivedBadge />}
        {!readOnly && (
          <div className="ml-auto flex flex-wrap gap-2">
            <Button disabled={!canWrite} onClick={() => void completion.toggle(saved)}>
              {completion.pending ? 'Saving…' : completed ? 'Reopen' : 'Mark complete'}
            </Button>
            <Link to="/tasks/$taskId/edit" params={{ taskId }} className={linkButton({ variant: 'outline' })}>Edit</Link>
            <Button variant="outline" disabled={!canWrite} onClick={() => void archive.toggle()}>
              {archive.saving ? 'Saving…' : archive.archived ? 'Restore' : 'Archive'}
            </Button>
            <Link to="/tasks/$taskId/delete" params={{ taskId }} className={linkButton({ variant: 'outline' })}>Delete</Link>
          </div>
        )}
      </div>
      {completion.message && <Problem>{completion.message}</Problem>}
      {archive.message && <Problem>{archive.message}</Problem>}
      <Card>
        <CardContent>
          <dl className="flex flex-col gap-3 text-sm">
            <Detail label="Status">{completed ? `Completed ${formatDate(task.completedAt!)}` : isOverdue(task, today) ? 'Overdue' : task.dueDate === today ? 'Due today' : 'Open'}</Detail>
            <Detail label="Due date">{task.dueDate ? formatCalendarDate(task.dueDate) : none}</Detail>
            <Detail label="Related to">{task.related ? <RelatedLink related={task.related} /> : none}</Detail>
            <Detail label="Description">{task.description ? <p className="break-words whitespace-pre-wrap">{task.description}</p> : none}</Detail>
            <Detail label="Last updated">{formatDate(task.updatedAt)}</Detail>
          </dl>
        </CardContent>
      </Card>
    </>
  );
}

// Home's due and overdue tasks (docs/08): the first 10 (spec 08). Each one can be completed here.
import { Link } from '@tanstack/react-router';
import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Problem } from '@/ui/record-page.tsx';
import { useRecords } from '../records.ts';
import { useToday } from '../use-today.ts';
import { compareOpen, isDue } from './task-list.ts';
import { TaskItem } from './TaskItem.tsx';
import { useCompletion } from './use-completion.ts';

const FIRST = 10;

export function DueTasks() {
  const today = useToday();
  const completion = useCompletion();
  const tasks = useRecords('task');
  const { pending } = completion;
  // A task stays on the list while its completion is saving, so the checkbox does not jump away.
  const due = useMemo(
    () => tasks.filter((v) => v.record.archivedAt === null && (isDue(v.record, today) || pending === v.record.id)).sort((a, b) => compareOpen(a.record, b.record)),
    [tasks, today, pending],
  );
  const shown = due.slice(0, FIRST);

  return (
    <section aria-labelledby="due-tasks-heading">
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>
            <h2 id="due-tasks-heading">Tasks due</h2>
          </CardTitle>
          <Link to="/tasks" className="text-sm underline">All tasks</Link>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {completion.message && <Problem>{completion.message}</Problem>}
          {due.length === 0 ? (
            <p className="text-sm text-muted-foreground">No task is due today or overdue.</p>
          ) : (
            <ul aria-label="Tasks due" className="flex flex-col divide-y">
              {shown.map((saved) => (
                <TaskItem key={saved.record.id} saved={saved} today={today} pending={pending === saved.record.id} onToggle={completion.toggle} showRelated />
              ))}
            </ul>
          )}
          {shown.length < due.length && (
            <p className="text-sm text-muted-foreground">
              Showing {shown.length} of {due.length} tasks due.
            </p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

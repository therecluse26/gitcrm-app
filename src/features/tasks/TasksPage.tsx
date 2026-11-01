// Tasks (spec 04): open tasks grouped into Overdue and Upcoming, or the completed tasks, in pages
// of 50 (spec 08).
import { Link } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useMemo, useRef } from 'react';
import { selectReadOnly, useApp } from '@/app/store.ts';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { selectClassName } from '@/ui/form-fields.tsx';
import { linkButton } from '@/ui/link-button.ts';
import { ListSummary, Pager, Problem } from '@/ui/record-page.tsx';
import { useRecords } from '../records.ts';
import { useToday } from '../use-today.ts';
import { listTasks, pageGroups, type TaskView } from './task-list.ts';
import { TaskItem } from './TaskItem.tsx';
import { useCompletion } from './use-completion.ts';

export function TasksPage() {
  const view = useApp((s) => s.tasks);
  const readOnly = useApp(selectReadOnly);
  const saved = useRecords('task');
  const completion = useCompletion();
  const today = useToday();
  const list = useRef<HTMLDivElement>(null);
  const { show, showArchived } = view;
  const listed = useMemo(() => listTasks(saved.map((v) => v.record), today, { show, showArchived }), [saved, today, show, showArchived]);
  const versions = useMemo(() => new Map(saved.map((v) => [v.record.id, v])), [saved]);
  const { groups, page } = pageGroups(listed.groups, view.page);
  const set = useApp.getState().setTaskView;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Tasks</h1>
        {!readOnly && (
          <Link to="/tasks/new" className={linkButton()}>
            <Plus aria-hidden />
            New task
          </Link>
        )}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tasks-show">Show</Label>
          <select id="tasks-show" className={selectClassName} value={view.show} onChange={(e) => set({ show: e.target.value as TaskView['show'] })}>
            <option value="open">Open tasks</option>
            <option value="completed">Completed tasks</option>
          </select>
        </div>
        <div className="flex h-8 items-center gap-2">
          <Checkbox id="tasks-archived" aria-labelledby="tasks-archived-label" checked={view.showArchived} onCheckedChange={(checked) => set({ showArchived: checked === true })} />
          <Label id="tasks-archived-label" htmlFor="tasks-archived">Show archived</Label>
        </div>
      </div>
      <ListSummary shown={listed.shown} hiddenArchived={listed.hiddenArchived} singular={show === 'open' ? 'open task' : 'completed task'} plural={show === 'open' ? 'open tasks' : 'completed tasks'} page={page} />
      {completion.message && <Problem>{completion.message}</Problem>}
      {/* The page's groups. Focus moves here after a page change, so this element stays. */}
      <div ref={list} tabIndex={-1} role="group" aria-label="Tasks" className="flex flex-col gap-4 outline-none">
        {groups.map((group) => (
          <section key={group.name} aria-labelledby={`tasks-${group.name}`} className="flex flex-col gap-1">
            <h2 id={`tasks-${group.name}`} className="text-lg font-medium">{group.name}</h2>
            <ul className="flex flex-col divide-y">
              {group.tasks.map((task) => (
                <TaskItem key={task.id} saved={versions.get(task.id)!} today={today} pending={completion.pending === task.id} onToggle={completion.toggle} showRelated />
              ))}
            </ul>
          </section>
        ))}
      </div>
      <Pager page={page} label="Tasks" list={list} onPage={(page) => set({ page })} />
    </>
  );
}

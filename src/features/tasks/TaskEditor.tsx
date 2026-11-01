// The new-task and edit-task forms (spec 04).
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useState } from 'react';
import type { Task } from '@/core/schemas.ts';
import type { VersionedRecord } from '@/storage/workspace-repository.ts';
import { ConflictPanel } from '@/ui/ConflictPanel.tsx';
import { EditorForm } from '@/ui/EditorForm.tsx';
import { TextAreaField, TextField } from '@/ui/form-fields.tsx';
import { linkButton } from '@/ui/link-button.ts';
import { RecordNotFound } from '@/ui/record-page.tsx';
import { formatCalendarDate, useRecord } from '../records.ts';
import { readRelated } from '../related.ts';
import { RelatedField } from '../RelatedRecord.tsx';
import { pageOf, useRelatable } from '../use-relatable.ts';
import { useRecordEditor } from '../use-record-editor.ts';
import { readTaskForm, taskFields, taskValues, type TaskFields, type TaskFormValues } from './task-form.ts';

const LABELS: Record<keyof TaskFields, string> = { title: 'Title', description: 'Description', dueDate: 'Due date', related: 'Related to' };

export function NewTaskPage() {
  const { related } = useSearch({ from: '/tasks/new' });
  return <TaskEditor saved={null} related={related ?? ''} />;
}

export function EditTaskPage() {
  const { taskId } = useParams({ from: '/tasks/$taskId/edit' });
  const current = useRecord('task', taskId);
  // The form edits the version it opened with; a later change on GitHub shows up as a conflict on save.
  const [opened] = useState(current);
  if (!opened) return <RecordNotFound singular="task" back={<Link to="/tasks" className="underline">Back to tasks</Link>} />;
  return <TaskEditor saved={opened} related="" />;
}

function TaskEditor({ saved, related }: { saved: VersionedRecord<Task> | null; related: string }) {
  const navigate = useNavigate();
  const relatable = useRelatable();
  // A link from the address bar counts only when its record exists.
  const linked = readRelated(related, relatable.ids, null);
  const editor = useRecordEditor({
    type: 'task',
    saved,
    initial: saved ? undefined : { ...taskValues(null), related: linked.error ? '' : related },
    fieldsOf: taskFields,
    valuesOf: taskValues,
    read: (values, base) => readTaskForm(values, { ids: relatable.ids, current: base && taskFields(base) }),
    newFields: (fields) => ({ ...fields, completedAt: null }),
    onSaved: (result) => void navigate({ to: '/tasks/$taskId', params: { taskId: result.record.id } }),
  });
  const { values, errors } = editor;
  const set = (changes: Partial<TaskFormValues>) => editor.setValues({ ...values, ...changes });

  const shown = (key: keyof TaskFields, fields: TaskFields): string => {
    if (key === 'dueDate') return fields.dueDate ? formatCalendarDate(fields.dueDate) : 'None';
    if (key === 'related') return relatable.name(fields.related);
    return fields[key] || 'None';
  };
  const remoteFields = editor.remote && taskFields(editor.remote.record);
  const conflict = editor.conflict && (
    <ConflictPanel
      noun="task"
      remoteDeleted={!editor.remote}
      rows={
        remoteFields && editor.attempt
          ? editor.rows.map((row) => ({ label: LABELS[row.key], remote: shown(row.key, remoteFields), mine: shown(row.key, editor.attempt!), changedByMe: row.changedByMe }))
          : []
      }
      copyText={editor.attempt ? (Object.keys(LABELS) as (keyof TaskFields)[]).map((key) => `${LABELS[key]}: ${shown(key, editor.attempt!)}`).join('\n') : ''}
      onRetry={() => void editor.retryAfterReview()}
      onDiscard={() => {
        if (editor.remote) return editor.discardMine();
        editor.allowLeave();
        void navigate({ to: '/tasks' });
      }}
    />
  );

  return (
    <EditorForm
      heading={saved ? `Edit ${saved.record.title}` : 'New task'}
      saveLabel="Save task"
      state={editor.state}
      errors={errors}
      dirty={editor.dirty}
      onSubmit={() => void editor.submit()}
      conflict={conflict}
      cancel={
        saved ? (
          <Link to="/tasks/$taskId" params={{ taskId: saved.record.id }} className={linkButton({ variant: 'ghost' })}>Cancel</Link>
        ) : (
          <Link {...(linked.related && !linked.error ? pageOf(linked.related) : { to: '/tasks' })} className={linkButton({ variant: 'ghost' })}>Cancel</Link>
        )
      }
    >
      <TextField id="title" label="Title" autoComplete="off" value={values.title} error={errors.title} onChange={(e) => set({ title: e.target.value })} />
      <TextAreaField id="description" label="Description" value={values.description} error={errors.description} onChange={(e) => set({ description: e.target.value })} />
      <TextField id="due-date" label="Due date" type="date" hint="Optional. A task is overdue from the day after this date." value={values.dueDate} error={errors.dueDate} onChange={(e) => set({ dueDate: e.target.value })} />
      <RelatedField value={values.related} current={editor.base?.record.related ?? null} error={errors.related} onChange={(key) => set({ related: key })} />
    </EditorForm>
  );
}

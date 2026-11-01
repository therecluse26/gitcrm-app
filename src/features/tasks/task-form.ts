// The task form (spec 04): form values to task fields, with an error for each bad field.
// Completing a task is a separate action, so the form never changes completedAt.
import { taskSchema, type Task } from '@/core/schemas.ts';
import type { FieldErrors, FormResult } from '../record-form.ts';
import { readRelated, relatedKey, type RelatedIds } from '../related.ts';

export type TaskFields = Pick<Task, 'title' | 'description' | 'dueDate' | 'related'>;
export type TaskFormValues = { title: string; description: string; dueDate: string; related: string };

export function taskFields({ title, description, dueDate, related }: Task): TaskFields {
  return { title, description, dueDate, related };
}

export function taskValues(fields: TaskFields | null): TaskFormValues {
  return { title: fields?.title ?? '', description: fields?.description ?? '', dueDate: fields?.dueDate ?? '', related: relatedKey(fields?.related ?? null) };
}

export function readTaskForm(values: TaskFormValues, { ids, current }: { ids: RelatedIds; current: TaskFields | null }): FormResult<TaskFields> {
  const errors: FieldErrors = {};
  const title = values.title.trim();
  if (!taskSchema.shape.title.safeParse(title).success) errors.title = 'Enter a title.';
  const dueDate = values.dueDate || null;
  if (dueDate && !taskSchema.shape.dueDate.safeParse(dueDate).success) errors.dueDate = 'Enter a real date, such as 2026-11-30.';
  const { related, error } = readRelated(values.related, ids, current?.related ?? null);
  if (error) errors.related = error;
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, fields: { title, description: values.description.trim(), dueDate, related } };
}

import { describe, expect, it } from 'vitest';
import type { RelatedIds } from '../related.ts';
import { readTaskForm, taskValues, type TaskFormValues } from './task-form.ts';

const deal = 'e8c756c7-f1b2-4c47-9d3d-26457c6b0979';
const gone = '5c1f5f8e-9a3b-4f6e-8d2c-0b7a1e4d3c21';
const ids: RelatedIds = { contact: new Set(), company: new Set(), opportunity: new Set([deal]) };
const values = (changes: Partial<TaskFormValues> = {}): TaskFormValues => ({ ...taskValues(null), title: 'Follow up on proposal', ...changes });

describe('readTaskForm', () => {
  it('reads a task with a due date and a link to an opportunity', () => {
    const result = readTaskForm(values({ title: '  Follow up on proposal ', description: 'Ask about next steps', dueDate: '2026-11-02', related: `opportunity:${deal}` }), { ids, current: null });
    expect(result).toEqual({
      ok: true,
      fields: { title: 'Follow up on proposal', description: 'Ask about next steps', dueDate: '2026-11-02', related: { type: 'opportunity', id: deal } },
    });
  });

  it('stores an empty due date and no link as null', () => {
    expect(readTaskForm(values(), { ids, current: null })).toEqual({ ok: true, fields: { title: 'Follow up on proposal', description: '', dueDate: null, related: null } });
  });

  it('gives an error for each bad field', () => {
    const result = readTaskForm(values({ title: ' ', dueDate: '2026-02-30', related: `opportunity:${gone}` }), { ids, current: null });
    expect(result).toEqual({
      ok: false,
      errors: {
        title: 'Enter a title.',
        dueDate: 'Enter a real date, such as 2026-11-30.',
        related: 'The chosen record is no longer in the workspace. Choose another one, or none.',
      },
    });
  });

  it('round-trips the fields of a saved task', () => {
    const fields = { title: 'Call back', description: 'Line one\nLine two', dueDate: '2026-11-02', related: { type: 'opportunity' as const, id: gone } };
    expect(readTaskForm(taskValues(fields), { ids, current: fields })).toEqual({ ok: true, fields });
  });
});

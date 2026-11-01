// The edit flow that every record form shares (docs/08, "Important system states"): unsaved,
// saving, committed, conflict, and failed. A conflict keeps the form values until the user
// discards them or retries on top of the remote version (spec 07).
import { useBlocker } from '@tanstack/react-router';
import { useRef, useState } from 'react';
import { useApp } from '@/app/store.ts';
import { editRecord, newRecord, type RecordFields } from '@/core/records.ts';
import type { RecordOf, RecordType } from '@/core/schemas.ts';
import { stateForError, type OperationState } from '@/storage/operation-state.ts';
import type { VersionedRecord } from '@/storage/workspace-repository.ts';
import { changedKeys, conflictRows, rebaseFields, type ConflictRow, type FieldErrors, type FieldGroups, type FormResult } from './record-form.ts';

export type EditorOptions<T extends RecordType, F extends object, V> = {
  type: T;
  saved: VersionedRecord<RecordOf<T>> | null; // null for a new record
  initial?: V; // the starting values of a new record, if not empty
  fieldsOf: (record: RecordOf<T>) => F;
  valuesOf: (fields: F | null) => V;
  read: (values: V, base: RecordOf<T> | null) => FormResult<F>;
  groups?: FieldGroups<F>; // fields that a conflict retry takes from one side only
  // A new record's fields, when the form does not edit all of them, such as a task's completedAt.
  newFields?: (fields: F) => RecordFields<T>;
  onSaved: (saved: VersionedRecord<RecordOf<T>>) => void;
};

export function useRecordEditor<T extends RecordType, F extends object, V>(options: EditorOptions<T, F, V>) {
  const { type, fieldsOf, valuesOf, read, groups } = options;
  const [base, setBase] = useState(options.saved); // the version this form edits
  const [initial, setInitial] = useState<V>(() => options.initial ?? valuesOf(options.saved && fieldsOf(options.saved.record)));
  const [values, setValues] = useState<V>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [state, setState] = useState<OperationState>({ status: 'idle' });
  const [attempt, setAttempt] = useState<F | null>(null); // the fields of the save that met a conflict
  // A new record keeps one ID across retries, so a retry after a lost response cannot make a duplicate.
  const [id] = useState(() => crypto.randomUUID());
  const leaving = useRef(false);
  const busy = useRef(false); // a second click must not start a second save

  const dirty = JSON.stringify(values) !== JSON.stringify(initial);
  useBlocker({
    shouldBlockFn: () => !leaving.current && !window.confirm('Leave this page? Your unsaved changes will be lost.'),
    enableBeforeUnload: () => !leaving.current,
    disabled: !dirty,
  });

  async function save(fields: F, from: VersionedRecord<RecordOf<T>> | null) {
    if (busy.current) return;
    busy.current = true;
    setState({ status: 'saving' });
    try {
      const now = new Date();
      const created = options.newFields ? options.newFields(fields) : (fields as unknown as RecordFields<T>);
      const record = from ? editRecord(from.record, fields, now) : newRecord(type, created, { now, id });
      const saved = await useApp.getState().saveRecord(record, from?.blobSha ?? null);
      leaving.current = true;
      setState({ status: 'committed', commitSha: saved.commitSha });
      options.onSaved(saved);
    } catch (error) {
      setAttempt(fields);
      setState(stateForError(error));
    } finally {
      busy.current = false;
    }
  }

  async function submit() {
    const result = read(values, base?.record ?? null);
    setErrors(result.ok ? {} : result.errors);
    if (!result.ok) return;
    // Nothing changed: no commit, and no "Saved" notice.
    if (base && changedKeys(result.fields, fieldsOf(base.record)).length === 0) {
      leaving.current = true;
      return options.onSaved(base);
    }
    await save(result.fields, base);
  }

  const conflict = state.status === 'conflict' ? state : null;
  const remote = (conflict?.remote ?? null) as VersionedRecord<RecordOf<T>> | null;

  // Take the remote version and drop my changes.
  function discardMine() {
    if (!remote) return;
    const next = valuesOf(fieldsOf(remote.record));
    setBase(remote);
    setInitial(next);
    setValues(next);
    setState({ status: 'idle' });
  }

  // Save my changes on top of the remote version.
  async function retryAfterReview() {
    if (!remote || !attempt) return;
    const rebased = base ? rebaseFields(attempt, fieldsOf(base.record), fieldsOf(remote.record), groups) : attempt;
    setBase(remote);
    setInitial(valuesOf(fieldsOf(remote.record)));
    setValues(valuesOf(rebased));
    await save(rebased, remote);
  }

  const rows: ConflictRow<F>[] =
    conflict && remote && attempt ? conflictRows(attempt, fieldsOf((base ?? remote).record), fieldsOf(remote.record), groups) : [];

  // The user chose to leave, for example after "Discard mine" on a deleted record.
  function allowLeave() {
    leaving.current = true;
  }

  return { base, values, setValues, errors, state, dirty, conflict, remote, attempt, rows, submit, discardMine, retryAfterReview, allowLeave };
}

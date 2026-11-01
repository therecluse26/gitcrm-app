// One small change saved at once, such as a stage move or a completed task (spec 03, spec 04): one
// commit to that record's file. `pending` shows the change until the commit lands. On failure the
// record stays as it was, and `message` says why. `save` is the same function on every render, so
// list rows with a memo do not draw again because of it (docs/06).
import { useCallback, useRef, useState } from 'react';
import { useApp } from '@/app/store.ts';
import { editRecord, type RecordChanges } from '@/core/records.ts';
import type { CRMRecord } from '@/core/schemas.ts';
import { stateForError } from '@/storage/operation-state.ts';
import type { VersionedRecord } from '@/storage/workspace-repository.ts';

export function useQuickSave<R extends CRMRecord>() {
  const [pending, setPending] = useState<{ id: string; changes: RecordChanges<R> } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const running = useRef(false);

  // `failed` starts the message, such as "Website rebuild was not moved."
  const save = useCallback(async (saved: VersionedRecord<R>, changes: RecordChanges<R>, failed: string) => {
    if (running.current) return;
    running.current = true;
    setPending({ id: saved.record.id, changes });
    setMessage(null);
    try {
      await useApp.getState().saveRecord(editRecord(saved.record, changes, new Date()), saved.blobSha);
    } catch (error) {
      const state = stateForError(error);
      const why =
        state.status === 'conflict'
          ? 'Someone else changed it after it was loaded. The page shows their version; try again if you still want to.'
          : 'message' in state
            ? state.message
            : '';
      setMessage(`${failed} ${why}`);
    } finally {
      running.current = false;
      setPending(null);
    }
  }, []);

  return { pending, message, save };
}

// Archive and restore (spec 06): the same file and UUID, with archivedAt set or cleared, saved
// against the loaded blob SHA.
import { useState } from 'react';
import { useApp } from '@/app/store.ts';
import { editRecord, isoTimestamp } from '@/core/records.ts';
import type { CRMRecord } from '@/core/schemas.ts';
import { stateForError, type OperationState } from '@/storage/operation-state.ts';
import type { VersionedRecord } from '@/storage/workspace-repository.ts';

export function useArchive(saved: VersionedRecord<CRMRecord> | undefined) {
  const [state, setState] = useState<OperationState>({ status: 'idle' });
  const archived = saved?.record.archivedAt != null;

  async function toggle() {
    if (!saved) return;
    setState({ status: 'saving' });
    try {
      const now = new Date();
      await useApp.getState().saveRecord(editRecord(saved.record, { archivedAt: archived ? null : isoTimestamp(now) }, now), saved.blobSha);
      setState({ status: 'idle' });
    } catch (error) {
      setState(stateForError(error));
    }
  }

  const message = 'message' in state ? (state.status === 'conflict' ? `${state.message}. Check the latest version, then try again.` : state.message) : null;
  return { archived, saving: state.status === 'saving', message, toggle };
}

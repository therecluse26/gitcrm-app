// Complete and reopen a task (spec 04): completedAt is set to the UTC time, or cleared, in one
// commit. The task moves to Completed only after the commit lands.
import { useCallback } from 'react';
import { isoTimestamp } from '@/core/records.ts';
import type { Task } from '@/core/schemas.ts';
import type { VersionedRecord } from '@/storage/workspace-repository.ts';
import { useQuickSave } from '../use-quick-save.ts';

export function useCompletion() {
  const { pending, message, save } = useQuickSave<Task>();
  const toggle = useCallback(
    (saved: VersionedRecord<Task>) => {
      const completing = saved.record.completedAt === null;
      return save(saved, { completedAt: completing ? isoTimestamp(new Date()) : null }, `${saved.record.title} was not ${completing ? 'marked complete' : 'reopened'}.`);
    },
    [save],
  );
  return { pending: pending?.id ?? null, message, toggle };
}

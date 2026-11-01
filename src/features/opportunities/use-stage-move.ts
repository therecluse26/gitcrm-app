// Moving an opportunity to another stage (spec 03): one commit to that opportunity's file.
import { useCallback } from 'react';
import type { Opportunity } from '@/core/schemas.ts';
import type { VersionedRecord } from '@/storage/workspace-repository.ts';
import { useQuickSave } from '../use-quick-save.ts';

export function useStageMove() {
  const { pending, message, save } = useQuickSave<Opportunity>();
  const move = useCallback(
    (saved: VersionedRecord<Opportunity>, stageId: string) => (stageId === saved.record.stageId ? undefined : save(saved, { stageId }, `${saved.record.title} was not moved.`)),
    [save],
  );
  return { pending: pending && { id: pending.id, stageId: pending.changes.stageId! }, message, move };
}

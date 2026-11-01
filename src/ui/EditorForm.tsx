// The frame of every record form: the unsaved and saving states, a failed save, and the conflict
// panel (docs/08, "Important system states"). A failed save never clears the form.
import type { FormEvent, ReactNode } from 'react';
import { selectCanWrite, selectReadOnly, useApp } from '@/app/store.ts';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { FieldErrors } from '@/features/record-form.ts';
import type { OperationState } from '@/storage/operation-state.ts';
import { useFocusFirstError } from './use-focus-first-error.ts';

export function EditorForm({
  heading,
  saveLabel,
  state,
  errors,
  dirty,
  onSubmit,
  cancel,
  conflict,
  children,
}: {
  heading: string;
  saveLabel: string;
  state: OperationState;
  errors: FieldErrors;
  dirty: boolean;
  onSubmit: () => void;
  cancel: ReactNode;
  conflict: ReactNode | null;
  children: ReactNode;
}) {
  const canWrite = useApp(selectCanWrite);
  const readOnly = useApp(selectReadOnly);
  const otherSave = useApp((s) => s.saving); // one write at a time, such as a task checked off before this page opened
  const form = useFocusFirstError(errors);
  const saving = state.status === 'saving';
  const failure = state.status === 'failed' || state.status === 'unauthorized' || state.status === 'rate-limited' ? state.message : null;

  function submit(event: FormEvent) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <>
      <h1 className="text-2xl font-semibold">{heading}</h1>
      <form ref={form} onSubmit={submit} noValidate className="flex max-w-xl flex-col gap-4">
        <fieldset disabled={saving || conflict !== null} className="flex flex-col gap-4">
          {children}
        </fieldset>
        {failure && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{failure} Your changes are still in this form.</AlertDescription>
          </Alert>
        )}
        {conflict}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={!canWrite || saving || conflict !== null}>
            {saving ? 'Saving…' : saveLabel}
          </Button>
          {cancel}
          {dirty && !saving && <span className="text-sm text-muted-foreground">Unsaved changes</span>}
        </div>
        {!canWrite && !saving && (
          <p className="text-sm text-muted-foreground">
            {readOnly
              ? 'GitCRM is read-only here, so changes cannot be saved.'
              : otherSave
                ? 'You can save when the other save finishes.'
                : 'You can save when GitCRM finishes checking GitHub.'}
          </p>
        )}
      </form>
    </>
  );
}

// Log an activity, and edit one (spec 04). After a save, the page of the linked record shows it on
// its timeline; an activity with no link shows on Home.
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useState } from 'react';
import { isoTimestamp } from '@/core/records.ts';
import { toLocalInput } from '@/core/local-time.ts';
import type { Activity } from '@/core/schemas.ts';
import type { VersionedRecord } from '@/storage/workspace-repository.ts';
import { ConflictPanel } from '@/ui/ConflictPanel.tsx';
import { EditorForm } from '@/ui/EditorForm.tsx';
import { SelectField, TextAreaField, TextField } from '@/ui/form-fields.tsx';
import { linkButton } from '@/ui/link-button.ts';
import { RecordNotFound } from '@/ui/record-page.tsx';
import { formatDateTime, useRecord } from '../records.ts';
import { parseRelatedKey, readRelated } from '../related.ts';
import { RelatedField } from '../RelatedRecord.tsx';
import { pageOf, useRelatable } from '../use-relatable.ts';
import { useRecordEditor } from '../use-record-editor.ts';
import { ACTIVITY_KINDS, activityFields, activityValues, kindLabel, readActivityForm, type ActivityFields, type ActivityFormValues } from './activity-form.ts';

const LABELS: Record<keyof ActivityFields, string> = { kind: 'Kind', body: 'What happened', occurredAt: 'When', related: 'Related to' };

export function NewActivityPage() {
  const { related } = useSearch({ from: '/activities/new' });
  return <ActivityEditor saved={null} related={related ?? ''} />;
}

export function EditActivityPage() {
  const { activityId } = useParams({ from: '/activities/$activityId/edit' });
  const current = useRecord('activity', activityId);
  // The form edits the version it opened with; a later change on GitHub shows up as a conflict on save.
  const [opened] = useState(current);
  if (!opened) return <RecordNotFound singular="activity" back={<Link to="/" className="underline">Back to Home</Link>} />;
  return <ActivityEditor saved={opened} related="" />;
}

function ActivityEditor({ saved, related }: { saved: VersionedRecord<Activity> | null; related: string }) {
  const navigate = useNavigate();
  const relatable = useRelatable();
  // A link from the address bar counts only when its record exists.
  const linked = readRelated(related, relatable.ids, null);
  // A new activity starts at the current minute.
  const [now] = useState(() => toLocalInput(isoTimestamp(new Date())).slice(0, 16));
  const defaults = { occurredAt: now, related: linked.error ? '' : related };
  const valuesOf = (fields: ActivityFields | null) => activityValues(fields, defaults);
  const editor = useRecordEditor({
    type: 'activity',
    saved,
    fieldsOf: activityFields,
    valuesOf,
    read: (values, base) => readActivityForm(values, { ids: relatable.ids, current: base && activityFields(base) }),
    onSaved: (result) => void navigate(pageOf(result.record.related)),
  });
  const { values, errors } = editor;
  const set = (changes: Partial<ActivityFormValues>) => editor.setValues({ ...values, ...changes });

  const shown = (key: keyof ActivityFields, fields: ActivityFields): string => {
    if (key === 'kind') return kindLabel(fields.kind);
    if (key === 'occurredAt') return formatDateTime(fields.occurredAt);
    if (key === 'related') return relatable.name(fields.related);
    return fields.body;
  };
  const remoteFields = editor.remote && activityFields(editor.remote.record);
  const back = pageOf(saved ? saved.record.related : parseRelatedKey(defaults.related));
  const conflict = editor.conflict && (
    <ConflictPanel
      noun="activity"
      remoteDeleted={!editor.remote}
      rows={
        remoteFields && editor.attempt
          ? editor.rows.map((row) => ({ label: LABELS[row.key], remote: shown(row.key, remoteFields), mine: shown(row.key, editor.attempt!), changedByMe: row.changedByMe }))
          : []
      }
      copyText={editor.attempt ? (Object.keys(LABELS) as (keyof ActivityFields)[]).map((key) => `${LABELS[key]}: ${shown(key, editor.attempt!)}`).join('\n') : ''}
      onRetry={() => void editor.retryAfterReview()}
      onDiscard={() => {
        if (editor.remote) return editor.discardMine();
        editor.allowLeave();
        void navigate(back);
      }}
    />
  );

  return (
    <EditorForm
      heading={saved ? 'Edit activity' : 'Log activity'}
      saveLabel="Save activity"
      state={editor.state}
      errors={errors}
      dirty={editor.dirty}
      onSubmit={() => void editor.submit()}
      conflict={conflict}
      cancel={
        <Link {...back} className={linkButton({ variant: 'ghost' })}>
          Cancel
        </Link>
      }
    >
      <SelectField id="kind" label="Kind" value={values.kind} error={errors.kind} onChange={(e) => set({ kind: e.target.value })}>
        {ACTIVITY_KINDS.map(({ kind, label }) => (
          <option key={kind} value={kind}>{label}</option>
        ))}
      </SelectField>
      <TextAreaField
        id="body"
        label="What happened"
        hint="Plain text. GitCRM does not send or read email; write down what you want to remember."
        value={values.body}
        error={errors.body}
        onChange={(e) => set({ body: e.target.value })}
      />
      <TextField id="occurred-at" label="When" type="datetime-local" value={values.occurredAt} error={errors.occurredAt} onChange={(e) => set({ occurredAt: e.target.value })} />
      <RelatedField value={values.related} current={editor.base?.record.related ?? null} error={errors.related} onChange={(key) => set({ related: key })} />
    </EditorForm>
  );
}

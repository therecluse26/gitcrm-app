// The new-company and edit-company forms (spec 02).
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useState } from 'react';
import type { Company } from '@/core/schemas.ts';
import type { VersionedRecord } from '@/storage/workspace-repository.ts';
import { ConflictPanel } from '@/ui/ConflictPanel.tsx';
import { EditorForm } from '@/ui/EditorForm.tsx';
import { TextField } from '@/ui/form-fields.tsx';
import { linkButton } from '@/ui/link-button.ts';
import { RecordNotFound } from '@/ui/record-page.tsx';
import { CustomFieldInputs } from '../custom-fields/CustomFields.tsx';
import { customConflictRow, customCopyLines, useCustomFields } from '../custom-fields/custom-values.ts';
import { useRecord } from '../records.ts';
import { useRecordEditor } from '../use-record-editor.ts';
import { companyFields, companyValues, readCompanyForm, type CompanyFields, type CompanyFormValues } from './company-form.ts';

const LABELS: Record<Exclude<keyof CompanyFields, 'customFields'>, string> = { name: 'Name', website: 'Website', tags: 'Tags' };

export function NewCompanyPage() {
  return <CompanyEditor saved={null} />;
}

export function EditCompanyPage() {
  const { companyId } = useParams({ from: '/companies/$companyId/edit' });
  const current = useRecord('company', companyId);
  // The form edits the version it opened with; a later change on GitHub shows up as a conflict on save.
  const [opened] = useState(current);
  if (!opened) return <RecordNotFound singular="company" back={<Link to="/companies" className="underline">Back to companies</Link>} />;
  return <CompanyEditor saved={opened} />;
}

function CompanyEditor({ saved }: { saved: VersionedRecord<Company> | null }) {
  const navigate = useNavigate();
  const custom = useCustomFields('company');
  const editor = useRecordEditor({
    type: 'company',
    saved,
    fieldsOf: companyFields,
    valuesOf: (fields) => companyValues(fields, custom.shown),
    read: (values, base) => readCompanyForm(values, { custom: custom.shown, stored: base?.customFields }),
    onSaved: (result) => void navigate({ to: '/companies/$companyId', params: { companyId: result.record.id } }),
  });
  const { values, errors } = editor;
  const set = (changes: Partial<CompanyFormValues>) => editor.setValues({ ...values, ...changes });

  const shown = (value: unknown) => (value === null ? 'None' : (value as string | string[]));
  const asText = (value: string | string[]) => (Array.isArray(value) ? value.join(', ') || 'None' : value);
  const conflict = editor.conflict && (
    <ConflictPanel
      noun="company"
      remoteDeleted={!editor.remote}
      rows={editor.rows.map((row) =>
        row.customId ? customConflictRow(custom.all, row) : { label: LABELS[row.key as keyof typeof LABELS], remote: shown(row.remote), mine: shown(row.mine), changedByMe: row.changedByMe },
      )}
      copyText={
        editor.attempt
          ? [...(Object.keys(LABELS) as (keyof typeof LABELS)[]).map((key) => `${LABELS[key]}: ${asText(shown(editor.attempt![key]))}`), ...customCopyLines(custom.shown, editor.attempt.customFields)].join('\n')
          : ''
      }
      onRetry={() => void editor.retryAfterReview()}
      onDiscard={() => {
        if (editor.remote) return editor.discardMine();
        editor.allowLeave();
        void navigate({ to: '/companies' });
      }}
    />
  );

  return (
    <EditorForm
      heading={saved ? `Edit ${saved.record.name}` : 'New company'}
      saveLabel="Save company"
      state={editor.state}
      errors={errors}
      dirty={editor.dirty}
      onSubmit={() => void editor.submit()}
      conflict={conflict}
      cancel={
        saved ? (
          <Link to="/companies/$companyId" params={{ companyId: saved.record.id }} className={linkButton({ variant: 'ghost' })}>Cancel</Link>
        ) : (
          <Link to="/companies" className={linkButton({ variant: 'ghost' })}>Cancel</Link>
        )
      }
    >
      <TextField id="name" label="Name" autoComplete="off" value={values.name} error={errors.name} onChange={(e) => set({ name: e.target.value })} />
      <TextField
        id="website"
        label="Website"
        type="url"
        inputMode="url"
        autoComplete="off"
        hint="For example, https://example.com."
        value={values.website}
        error={errors.website}
        onChange={(e) => set({ website: e.target.value })}
      />
      <TextField id="tags" label="Tags" autoComplete="off" hint="Separate tags with commas." value={values.tags} onChange={(e) => set({ tags: e.target.value })} />
      <CustomFieldInputs fields={custom.shown} values={values.custom} errors={errors} onChange={(changed) => set({ custom: changed })} />
    </EditorForm>
  );
}

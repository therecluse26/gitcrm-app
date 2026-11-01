// The new-contact and edit-contact forms (spec 02).
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import type { Contact } from '@/core/schemas.ts';
import type { VersionedRecord } from '@/storage/workspace-repository.ts';
import { ConflictPanel } from '@/ui/ConflictPanel.tsx';
import { EditorForm } from '@/ui/EditorForm.tsx';
import { SelectField, TextField, ValueListField } from '@/ui/form-fields.tsx';
import { linkButton } from '@/ui/link-button.ts';
import { RecordNotFound } from '@/ui/record-page.tsx';
import { CustomFieldInputs } from '../custom-fields/CustomFields.tsx';
import { customConflictRow, customCopyLines, useCustomFields } from '../custom-fields/custom-values.ts';
import { useRecord, useRecords } from '../records.ts';
import { useRecordEditor } from '../use-record-editor.ts';
import { contactFields, contactValues, duplicateEmails, readContactForm, type ContactFields, type ContactFormValues } from './contact-form.ts';

const LABELS: Record<Exclude<keyof ContactFields, 'customFields'>, string> = { name: 'Name', emails: 'Email', phones: 'Phone', companyId: 'Company', tags: 'Tags' };

export function NewContactPage() {
  const { companyId } = useSearch({ from: '/contacts/new' });
  return <ContactEditor saved={null} companyId={companyId} />;
}

export function EditContactPage() {
  const { contactId } = useParams({ from: '/contacts/$contactId/edit' });
  const current = useRecord('contact', contactId);
  // The form edits the version it opened with; a later change on GitHub shows up as a conflict on save.
  const [opened] = useState(current);
  if (!opened) return <RecordNotFound singular="contact" back={<Link to="/contacts" className="underline">Back to contacts</Link>} />;
  return <ContactEditor saved={opened} />;
}

function ContactEditor({ saved, companyId }: { saved: VersionedRecord<Contact> | null; companyId?: string }) {
  const navigate = useNavigate();
  const companies = useRecords('company');
  const contacts = useRecords('contact');
  const companyIds = useMemo(() => new Set(companies.map((c) => c.record.id)), [companies]);
  const custom = useCustomFields('contact');
  const editor = useRecordEditor({
    type: 'contact',
    saved,
    initial: saved ? undefined : { ...contactValues(null, custom.shown), companyId: companyId && companyIds.has(companyId) ? companyId : '' },
    fieldsOf: contactFields,
    valuesOf: (fields) => contactValues(fields, custom.shown),
    read: (values, base) => readContactForm(values, { companies: companyIds, currentCompanyId: base?.companyId ?? null, custom: custom.shown, stored: base?.customFields }),
    onSaved: (result) => void navigate({ to: '/contacts/$contactId', params: { contactId: result.record.id } }),
  });
  const { values, errors } = editor;
  const set = (changes: Partial<ContactFormValues>) => editor.setValues({ ...values, ...changes });

  const currentCompany = editor.base?.record.companyId ?? null;
  const companyName = (id: string | null) => (id ? (companies.find((c) => c.record.id === id)?.record.name ?? `Missing company (${id.slice(0, 8)})`) : 'None');
  const choices = companies
    .filter(({ record }) => record.archivedAt === null || record.id === currentCompany)
    .sort((a, b) => a.record.name.localeCompare(b.record.name, undefined, { sensitivity: 'base' }));
  const duplicates = duplicateEmails(values.emails, contacts.map((c) => c.record), saved?.record.id ?? null);

  const shown = (key: keyof ContactFields, value: unknown) => (key === 'companyId' ? companyName(value as string | null) : (value as string | string[]));
  const asText = (value: string | string[]) => (Array.isArray(value) ? value.join(', ') || 'None' : value);
  const conflict = editor.conflict && (
    <ConflictPanel
      noun="contact"
      remoteDeleted={!editor.remote}
      rows={editor.rows.map((row) =>
        row.customId ? customConflictRow(custom.all, row) : { label: LABELS[row.key as keyof typeof LABELS], remote: shown(row.key, row.remote), mine: shown(row.key, row.mine), changedByMe: row.changedByMe },
      )}
      copyText={
        editor.attempt
          ? [...(Object.keys(LABELS) as (keyof typeof LABELS)[]).map((key) => `${LABELS[key]}: ${asText(shown(key, editor.attempt![key]))}`), ...customCopyLines(custom.shown, editor.attempt.customFields)].join('\n')
          : ''
      }
      onRetry={() => void editor.retryAfterReview()}
      onDiscard={() => {
        if (editor.remote) return editor.discardMine();
        editor.allowLeave();
        void navigate({ to: '/contacts' });
      }}
    />
  );

  return (
    <EditorForm
      heading={saved ? `Edit ${saved.record.name}` : 'New contact'}
      saveLabel="Save contact"
      state={editor.state}
      errors={errors}
      dirty={editor.dirty}
      onSubmit={() => void editor.submit()}
      conflict={conflict}
      cancel={
        saved ? (
          <Link to="/contacts/$contactId" params={{ contactId: saved.record.id }} className={linkButton({ variant: 'ghost' })}>Cancel</Link>
        ) : (
          <Link to="/contacts" className={linkButton({ variant: 'ghost' })}>Cancel</Link>
        )
      }
    >
      <TextField id="name" label="Name" autoComplete="off" value={values.name} error={errors.name} onChange={(e) => set({ name: e.target.value })} />
      <ValueListField name="emails" label="Email addresses" itemLabel="Email" type="email" autoComplete="off" values={values.emails} errors={errors} onChange={(emails) => set({ emails })} />
      {duplicates.map(({ email, contact }) => (
        <p key={email} className="text-sm">
          <Link to="/contacts/$contactId" params={{ contactId: contact.id }} className="underline">{contact.name}</Link> also has {email}. Duplicates are allowed.
        </p>
      ))}
      <ValueListField name="phones" label="Phone numbers" itemLabel="Phone" type="tel" autoComplete="off" values={values.phones} errors={errors} onChange={(phones) => set({ phones })} />
      <SelectField id="company" label="Company" value={values.companyId} error={errors.companyId} onChange={(e) => set({ companyId: e.target.value })}>
        <option value="">No company</option>
        {choices.map(({ record }) => (
          <option key={record.id} value={record.id}>
            {record.name}
            {record.archivedAt ? ' (archived)' : ''}
          </option>
        ))}
        {currentCompany && !companyIds.has(currentCompany) && <option value={currentCompany}>{companyName(currentCompany)}</option>}
      </SelectField>
      <TextField id="tags" label="Tags" autoComplete="off" hint="Separate tags with commas." value={values.tags} onChange={(e) => set({ tags: e.target.value })} />
      <CustomFieldInputs fields={custom.shown} values={values.custom} errors={errors} onChange={(changed) => set({ custom: changed })} />
    </EditorForm>
  );
}

// The new-opportunity and edit-opportunity forms (spec 03).
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useApp } from '@/app/store.ts';
import { Button } from '@/components/ui/button';
import { formatMoney } from '@/core/money.ts';
import type { Opportunity } from '@/core/schemas.ts';
import type { VersionedRecord } from '@/storage/workspace-repository.ts';
import { ConflictPanel } from '@/ui/ConflictPanel.tsx';
import { EditorForm } from '@/ui/EditorForm.tsx';
import { SelectField, TextField } from '@/ui/form-fields.tsx';
import { linkButton } from '@/ui/link-button.ts';
import { RecordNotFound } from '@/ui/record-page.tsx';
import { CustomFieldInputs } from '../custom-fields/CustomFields.tsx';
import { customConflictRow, customCopyLines, useCustomFields } from '../custom-fields/custom-values.ts';
import { formatCalendarDate, useRecord, useRecords, useStages, type NewRecordSearch } from '../records.ts';
import { useRecordEditor } from '../use-record-editor.ts';
import { opportunityFields, opportunityValues, readOpportunityForm, type OpportunityFields, type OpportunityFormValues } from './opportunity-form.ts';
import { stageName } from './pipeline.ts';

const LABELS: Record<Exclude<keyof OpportunityFields, 'customFields'>, string> = {
  title: 'Title',
  stageId: 'Stage',
  valueMinor: 'Value',
  currency: 'Currency',
  expectedCloseDate: 'Expected close date',
  companyId: 'Company',
  contactIds: 'Contacts',
};
const CURRENCIES = Intl.supportedValuesOf('currency');
// An amount means nothing without its currency, so a conflict retry keeps both from one side.
const GROUPS: (keyof OpportunityFields)[][] = [['valueMinor', 'currency']];
const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

export function NewOpportunityPage() {
  const search = useSearch({ from: '/opportunities/new' });
  return <OpportunityEditor saved={null} search={search} />;
}

export function EditOpportunityPage() {
  const { opportunityId } = useParams({ from: '/opportunities/$opportunityId/edit' });
  const current = useRecord('opportunity', opportunityId);
  // The form edits the version it opened with; a later change on GitHub shows up as a conflict on save.
  const [opened] = useState(current);
  if (!opened) return <RecordNotFound singular="opportunity" back={<Link to="/pipeline" className="underline">Back to the pipeline</Link>} />;
  return <OpportunityEditor saved={opened} search={{}} />;
}

function OpportunityEditor({ saved, search }: { saved: VersionedRecord<Opportunity> | null; search: NewRecordSearch }) {
  const navigate = useNavigate();
  const stages = useStages();
  const defaultCurrency = useApp((s) => s.snapshot?.workspace?.config.defaultCurrency ?? 'USD');
  const companies = useRecords('company');
  const contacts = useRecords('contact');
  const ids = useMemo(
    () => ({ stages: new Set(stages.map((s) => s.id)), companies: new Set(companies.map((c) => c.record.id)), contacts: new Set(contacts.map((c) => c.record.id)) }),
    [stages, companies, contacts],
  );
  const contactOf = (id: string) => contacts.find((c) => c.record.id === id)?.record;
  const defaults = { stageId: stages[0]?.id ?? 'lead', currency: defaultCurrency };
  const custom = useCustomFields('opportunity');
  const valuesOf = (fields: OpportunityFields | null) => opportunityValues(fields, defaults, custom.shown);

  // "Add opportunity" on a company or contact page fills in that link.
  const linked = contactOf(search.contactId ?? '');
  const companyId = search.companyId ?? linked?.companyId ?? '';
  const editor = useRecordEditor({
    type: 'opportunity',
    saved,
    initial: saved ? undefined : { ...valuesOf(null), companyId: ids.companies.has(companyId) ? companyId : '', contactIds: linked ? [linked.id] : [] },
    fieldsOf: opportunityFields,
    valuesOf,
    read: (values, base) => readOpportunityForm(values, { ...ids, current: base && opportunityFields(base), custom: custom.shown }),
    groups: GROUPS,
    onSaved: (result) => void navigate({ to: '/opportunities/$opportunityId', params: { opportunityId: result.record.id } }),
  });
  const { values, errors } = editor;
  const set = (changes: Partial<OpportunityFormValues>) => editor.setValues({ ...values, ...changes });

  const current = editor.base?.record;
  const companyName = (id: string | null) => (id ? (companies.find((c) => c.record.id === id)?.record.name ?? `Missing company (${id.slice(0, 8)})`) : 'None');
  const contactName = (id: string) => contactOf(id)?.name ?? `Missing contact (ID ${id.slice(0, 8)})`;
  const companyChoices = companies
    .map((c) => c.record)
    .filter((c) => c.archivedAt === null || c.id === current?.companyId)
    .sort(byName);
  const contactChoices = contacts
    .map((c) => c.record)
    .filter((c) => c.archivedAt === null && !values.contactIds.includes(c.id))
    .sort(byName);

  // The conflict panel shows each side's value in that side's currency.
  const shown = (key: keyof OpportunityFields, fields: OpportunityFields): string | string[] => {
    const value = fields[key];
    if (key === 'stageId') return stageName(stages, fields.stageId);
    if (key === 'valueMinor') return fields.valueMinor === null ? 'None' : formatMoney(fields.valueMinor, fields.currency);
    if (key === 'expectedCloseDate') return fields.expectedCloseDate ? formatCalendarDate(fields.expectedCloseDate) : 'None';
    if (key === 'companyId') return companyName(fields.companyId);
    if (key === 'contactIds') return fields.contactIds.map(contactName);
    return value as string;
  };
  const asText = (value: string | string[]) => (Array.isArray(value) ? value.join(', ') || 'None' : value);
  const remoteFields = editor.remote && opportunityFields(editor.remote.record);
  const conflict = editor.conflict && (
    <ConflictPanel
      noun="opportunity"
      remoteDeleted={!editor.remote}
      rows={
        remoteFields && editor.attempt
          ? editor.rows.map((row) =>
              row.customId
                ? customConflictRow(custom.all, row)
                : { label: LABELS[row.key as keyof typeof LABELS], remote: shown(row.key, remoteFields), mine: shown(row.key, editor.attempt!), changedByMe: row.changedByMe },
            )
          : []
      }
      copyText={
        editor.attempt
          ? [...(Object.keys(LABELS) as (keyof typeof LABELS)[]).map((key) => `${LABELS[key]}: ${asText(shown(key, editor.attempt!))}`), ...customCopyLines(custom.shown, editor.attempt.customFields)].join('\n')
          : ''
      }
      onRetry={() => void editor.retryAfterReview()}
      onDiscard={() => {
        if (editor.remote) return editor.discardMine();
        editor.allowLeave();
        void navigate({ to: '/pipeline' });
      }}
    />
  );

  return (
    <EditorForm
      heading={saved ? `Edit ${saved.record.title}` : 'New opportunity'}
      saveLabel="Save opportunity"
      state={editor.state}
      errors={errors}
      dirty={editor.dirty}
      onSubmit={() => void editor.submit()}
      conflict={conflict}
      cancel={
        saved ? (
          <Link to="/opportunities/$opportunityId" params={{ opportunityId: saved.record.id }} className={linkButton({ variant: 'ghost' })}>Cancel</Link>
        ) : (
          <Link to="/pipeline" className={linkButton({ variant: 'ghost' })}>Cancel</Link>
        )
      }
    >
      <TextField id="title" label="Title" autoComplete="off" value={values.title} error={errors.title} onChange={(e) => set({ title: e.target.value })} />
      <SelectField id="stage" label="Stage" value={values.stageId} error={errors.stageId} onChange={(e) => set({ stageId: e.target.value })}>
        {stages.map((stage) => (
          <option key={stage.id} value={stage.id}>{stage.label}</option>
        ))}
        {!ids.stages.has(values.stageId) && <option value={values.stageId}>{stageName(stages, values.stageId)}</option>}
      </SelectField>
      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <TextField
          id="value"
          label="Value"
          inputMode="decimal"
          autoComplete="off"
          hint="For example 2500.00. Leave it empty when there is no amount."
          value={values.value}
          error={errors.value}
          onChange={(e) => set({ value: e.target.value })}
        />
        <TextField
          id="currency"
          label="Currency"
          list="currencies"
          maxLength={3}
          autoComplete="off"
          value={values.currency}
          error={errors.currency}
          onChange={(e) => set({ currency: e.target.value.toUpperCase() })}
        />
        <datalist id="currencies">
          {CURRENCIES.map((code) => (
            <option key={code} value={code} />
          ))}
        </datalist>
      </div>
      <TextField id="close-date" label="Expected close date" type="date" value={values.expectedCloseDate} error={errors.expectedCloseDate} onChange={(e) => set({ expectedCloseDate: e.target.value })} />
      <SelectField id="company" label="Company" value={values.companyId} error={errors.companyId} onChange={(e) => set({ companyId: e.target.value })}>
        <option value="">No company</option>
        {companyChoices.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
            {c.archivedAt ? ' (archived)' : ''}
          </option>
        ))}
        {current?.companyId && !ids.companies.has(current.companyId) && <option value={current.companyId}>{companyName(current.companyId)}</option>}
      </SelectField>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-medium">Contacts</legend>
        {values.contactIds.length > 0 ? (
          <ul aria-label="Chosen contacts" className="flex flex-col gap-1 text-sm">
            {values.contactIds.map((id) => (
              <li key={id} className="flex items-center gap-2">
                <span className="min-w-0 break-words">{contactName(id)}</span>
                <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${contactName(id)}`} onClick={() => set({ contactIds: values.contactIds.filter((c) => c !== id) })}>
                  <X aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No contacts.</p>
        )}
        <SelectField id="add-contact" label="Add a contact" value="" error={errors.contactIds} onChange={(e) => e.target.value && set({ contactIds: [...values.contactIds, e.target.value] })}>
          <option value="">Choose a contact</option>
          {contactChoices.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.companyId && companies.some((co) => co.record.id === c.companyId) ? ` (${companyName(c.companyId)})` : ''}
            </option>
          ))}
        </SelectField>
      </fieldset>
      <CustomFieldInputs fields={custom.shown} values={values.custom} errors={errors} onChange={(changed) => set({ custom: changed })} />
    </EditorForm>
  );
}

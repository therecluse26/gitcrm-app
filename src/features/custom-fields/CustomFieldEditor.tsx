// The custom field editor in Settings (spec 10): add, rename, move, remove, and restore fields and
// the options of a choice list. Edits stay in a draft until "Save custom fields" writes
// .gitcrm/workspace.json in one commit, the same as the stage editor.
import { useBlocker } from '@tanstack/react-router';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { selectCanWrite, selectReadOnly, useApp } from '@/app/store.ts';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  addField,
  addOption,
  fieldSets,
  moveField,
  nameErrors,
  removeField,
  removeOption,
  renameField,
  renameOption,
  restoreField,
  restoreOption,
  sortFields,
  TYPE_LABELS,
  withCustomFields,
  type CustomField,
  type CustomFieldSets,
  type CustomFieldType,
  type CustomRecordType,
} from '@/core/custom-fields.ts';
import { CUSTOM_FIELD_TYPES, CUSTOM_RECORD_TYPES } from '@/core/schemas.ts';
import { saveBase } from '@/core/workspace.ts';
import { stateForError, type OperationState } from '@/storage/operation-state.ts';
import type { WorkspaceSnapshot } from '@/storage/workspace-repository.ts';
import { SelectField, TextField } from '@/ui/form-fields.tsx';
import { useFocusFirstError } from '@/ui/use-focus-first-error.ts';
import { useFieldSets } from '../records.ts';

type Workspace = NonNullable<WorkspaceSnapshot['workspace']>;
type Errors = Record<string, string>;

const HEADINGS: Record<CustomRecordType, string> = { contact: 'Contact fields', company: 'Company fields', opportunity: 'Opportunity fields' };
const nameOf = (item: { id: string; label: string }) => item.label.trim() || item.id;
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// Enter in a "new" box adds, instead of saving the whole form.
const onEnter = (add: () => void) => (e: KeyboardEvent) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  add();
};

export function CustomFieldEditor() {
  const workspace = useApp((s) => s.snapshot?.workspace);
  const latest = useFieldSets();
  const readOnly = useApp(selectReadOnly);
  const canWrite = useApp(selectCanWrite);
  // null until the first edit; until then the editor shows the latest fields.
  const [draft, setDraft] = useState<{ base: Workspace; sets: CustomFieldSets } | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [state, setState] = useState<OperationState>({ status: 'idle' });
  const form = useFocusFirstError(errors);
  const sets = draft?.sets ?? latest;
  const saved = fieldSets(draft?.base.config ?? workspace?.config);
  const dirty = draft !== null && JSON.stringify(draft.sets) !== JSON.stringify(saved);
  const saving = state.status === 'saving';
  const conflict = state.status === 'conflict';

  useBlocker({ shouldBlockFn: () => !window.confirm('Leave this page? Your unsaved custom field changes will be lost.'), enableBeforeUnload: true, disabled: !dirty });

  if (!workspace) return null;
  const edit = (type: CustomRecordType, fields: CustomField[]) => {
    setDraft({ base: draft?.base ?? workspace, sets: { ...sets, [type]: fields } });
    if (state.status !== 'idle') setState({ status: 'idle' });
  };

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || !dirty) return;
    const found = nameErrors(draft.sets);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setState({ status: 'saving' });
    try {
      const target = saveBase(draft.base, workspace, (config) => config.customFields);
      await useApp.getState().saveWorkspace(withCustomFields(target.config, draft.sets), target.blobSha);
      setDraft(null);
      setState({ status: 'idle' });
    } catch (error) {
      setState(stateForError(error));
    }
  }

  function loadLatest() {
    setDraft(null);
    setErrors({});
    setState({ status: 'idle' });
  }

  const failure = 'message' in state && !conflict ? state.message : null;
  const any = CUSTOM_RECORD_TYPES.some((type) => sets[type].some((f) => !f.archived));

  return (
    <section aria-labelledby="custom-fields-heading">
      <Card>
        <CardHeader>
          <CardTitle>
            <h2 id="custom-fields-heading">Custom fields</h2>
          </CardTitle>
          <CardDescription>
            Fields of your own on contacts, companies, and opportunities. A field's type never changes. Removing a field hides its values; restoring it shows them again.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {readOnly ? (
            any ? (
              CUSTOM_RECORD_TYPES.map((type) => {
                const active = sets[type].filter((f) => !f.archived);
                return (
                  active.length > 0 && (
                    <div key={type} className="mb-3 flex flex-col gap-1 text-sm">
                      <h3 className="font-medium">{HEADINGS[type]}</h3>
                      <ul className="list-disc pl-5">
                        {active.map((f) => (
                          <li key={f.id}>
                            {f.label} ({TYPE_LABELS[f.type]})
                          </li>
                        ))}
                      </ul>
                    </div>
                  )
                );
              })
            ) : (
              <p className="text-sm">No custom fields.</p>
            )
          ) : (
            <form ref={form} onSubmit={(e) => void save(e)} noValidate className="flex max-w-xl flex-col gap-6">
              <fieldset disabled={saving || conflict} className="flex flex-col gap-6">
                {CUSTOM_RECORD_TYPES.map((type) => (
                  <FieldList key={type} type={type} fields={sets[type]} saved={saved[type]} errors={errors} setErrors={setErrors} onEdit={(fields) => edit(type, fields)} />
                ))}
              </fieldset>
              {failure && (
                <Alert variant="destructive" role="alert">
                  <AlertDescription>{failure} Your custom field changes are still here.</AlertDescription>
                </Alert>
              )}
              {conflict && (
                <Alert role="alert">
                  <AlertDescription className="flex flex-col items-start gap-2">
                    Someone else changed the workspace settings, so your custom field changes were not saved. Load the latest custom fields, then make your changes again.
                    <Button type="button" variant="outline" size="sm" onClick={loadLatest}>Load the latest custom fields</Button>
                  </AlertDescription>
                </Alert>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" disabled={!dirty || !canWrite || conflict}>{saving ? 'Saving…' : 'Save custom fields'}</Button>
                {dirty && !saving && !conflict && (
                  <Button type="button" variant="ghost" onClick={loadLatest}>Discard changes</Button>
                )}
                {dirty && <span className="text-sm text-muted-foreground">Unsaved changes</span>}
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

// The fields of one record type. `saved` is the last saved version: removing a field or option
// that was never saved drops it, and removing a saved one hides it.
function FieldList({
  type,
  fields,
  saved,
  errors,
  setErrors,
  onEdit,
}: {
  type: CustomRecordType;
  fields: CustomField[];
  saved: CustomField[];
  errors: Errors;
  setErrors: (errors: Errors) => void;
  onEdit: (fields: CustomField[]) => void;
}) {
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<CustomFieldType>('text');
  const active = fields.filter((f) => !f.archived);
  const removed = fields.filter((f) => f.archived);
  const heading = `custom-${type}-heading`;

  function add() {
    const taken = fields.find((f) => same(f.label, newName));
    const error = !newName.trim()
      ? 'Enter a field name.'
      : taken?.archived
        ? `A removed ${type} field is called "${nameOf(taken)}". Restore it, or choose another name.`
        : taken
          ? `Another ${type} field is already called "${nameOf(taken)}".`
          : null;
    if (error) return setErrors({ [`new.${type}`]: error });
    setErrors({});
    setNewName('');
    onEdit(addField(fields, newName, newType));
  }

  function remove(field: CustomField) {
    onEdit(saved.some((f) => f.id === field.id) ? removeField(fields, field.id) : sortFields(fields.filter((f) => f.id !== field.id)));
  }

  return (
    <section aria-labelledby={heading} className="flex flex-col gap-3">
      <h3 id={heading} className="font-medium">{HEADINGS[type]}</h3>
      {active.length === 0 ? (
        <p className="text-sm text-muted-foreground">No {type} fields yet.</p>
      ) : (
        <ol aria-label={HEADINGS[type]} className="flex flex-col gap-3">
          {active.map((field, i) => {
            const key = `${type}.${field.id}`;
            return (
              <li key={field.id} className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-1">
                  <Input
                    aria-label={`Name of ${type} field ${i + 1}`}
                    aria-invalid={Boolean(errors[key])}
                    aria-describedby={errors[key] ? `${key}-error` : undefined}
                    className="w-auto min-w-0 flex-1 basis-40"
                    value={field.label}
                    onChange={(e) => onEdit(renameField(fields, field.id, e.target.value))}
                  />
                  {/* The type and the buttons wrap together under a narrow name box. */}
                  <div className="flex items-center gap-1">
                    <span className="w-24 text-xs text-muted-foreground">{TYPE_LABELS[field.type]}</span>
                    <Button type="button" variant="ghost" size="icon" aria-label={`Move ${nameOf(field)} up`} disabled={i === 0} onClick={() => onEdit(moveField(fields, field.id, -1))}>
                      <ArrowUp aria-hidden />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" aria-label={`Move ${nameOf(field)} down`} disabled={i === active.length - 1} onClick={() => onEdit(moveField(fields, field.id, 1))}>
                      <ArrowDown aria-hidden />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${nameOf(field)}`} onClick={() => remove(field)}>
                      <X aria-hidden />
                    </Button>
                  </div>
                </div>
                {errors[key] && <p id={`${key}-error`} className="text-sm text-destructive">{errors[key]}</p>}
                {field.type === 'select' && (
                  <OptionList type={type} field={field} saved={saved.find((f) => f.id === field.id)} errors={errors} setErrors={setErrors} onEdit={(change) => onEdit(change(fields))} />
                )}
              </li>
            );
          })}
        </ol>
      )}
      {removed.length > 0 && (
        <div className="flex flex-col gap-1 text-sm">
          <h4 className="font-medium">Removed {type} fields</h4>
          <ul className="flex flex-col gap-1">
            {removed.map((field) => (
              <li key={field.id} className="flex flex-col gap-1">
                <span className="flex flex-wrap items-center gap-2">
                  {nameOf(field)} <span className="text-muted-foreground">({TYPE_LABELS[field.type]})</span>
                  <Button type="button" variant="outline" size="sm" aria-label={`Restore ${nameOf(field)}`} onClick={() => onEdit(restoreField(fields, field.id))}>Restore</Button>
                </span>
                {errors[`${type}.${field.id}`] && <span className="text-destructive">{errors[`${type}.${field.id}`]}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1">
          <TextField id={`new-${type}-field`} label={`New ${type} field name`} autoComplete="off" value={newName} error={errors[`new.${type}`]} onChange={(e) => setNewName(e.target.value)} onKeyDown={onEnter(add)} />
        </div>
        <div className="w-36">
          <SelectField id={`new-${type}-field-type`} label="Type" value={newType} onChange={(e) => setNewType(e.target.value as CustomFieldType)}>
            {CUSTOM_FIELD_TYPES.map((t) => (
              <option key={t} value={t}>{TYPE_LABELS[t]}</option>
            ))}
          </SelectField>
        </div>
        <Button type="button" variant="outline" onClick={add}>
          <Plus aria-hidden />
          Add field
        </Button>
      </div>
    </section>
  );
}

function OptionList({
  type,
  field,
  saved,
  errors,
  setErrors,
  onEdit,
}: {
  type: CustomRecordType;
  field: CustomField;
  saved: CustomField | undefined;
  errors: Errors;
  setErrors: (errors: Errors) => void;
  onEdit: (change: (fields: CustomField[]) => CustomField[]) => void;
}) {
  const [newName, setNewName] = useState('');
  const active = field.options.filter((o) => !o.archived);
  const removed = field.options.filter((o) => o.archived);
  const name = nameOf(field);
  const newKey = `new.${type}.${field.id}`;

  function add() {
    const taken = field.options.find((o) => same(o.label, newName));
    const error = !newName.trim()
      ? 'Enter an option name.'
      : taken?.archived
        ? `A removed option of ${name} is called "${nameOf(taken)}". Restore it, or choose another name.`
        : taken
          ? `Another option of ${name} is already called "${nameOf(taken)}".`
          : null;
    if (error) return setErrors({ [newKey]: error });
    setErrors({});
    setNewName('');
    onEdit((fields) => addOption(fields, field.id, newName));
  }

  function remove(optionId: string) {
    const kept = saved?.options.some((o) => o.id === optionId);
    onEdit((fields) =>
      kept ? removeOption(fields, field.id, optionId) : fields.map((f) => (f.id === field.id ? { ...f, options: f.options.filter((o) => o.id !== optionId) } : f)),
    );
  }

  return (
    <div className="ml-6 flex flex-col gap-2 border-l pl-3">
      {active.length > 0 && (
        <ul aria-label={`Options of ${name}`} className="flex flex-col gap-1">
          {active.map((option, j) => {
            const key = `${type}.${field.id}.${option.id}`;
            return (
              <li key={option.id} className="flex flex-col gap-1">
                <div className="flex items-center gap-1">
                  <Input
                    aria-label={`Option ${j + 1} of ${name}`}
                    aria-invalid={Boolean(errors[key])}
                    aria-describedby={errors[key] ? `${key}-error` : undefined}
                    className="min-w-0 flex-1"
                    value={option.label}
                    onChange={(e) => onEdit((fields) => renameOption(fields, field.id, option.id, e.target.value))}
                  />
                  <Button type="button" variant="ghost" size="icon" aria-label={`Remove option ${nameOf(option)} of ${name}`} onClick={() => remove(option.id)}>
                    <X aria-hidden />
                  </Button>
                </div>
                {errors[key] && <p id={`${key}-error`} className="text-sm text-destructive">{errors[key]}</p>}
              </li>
            );
          })}
        </ul>
      )}
      {removed.length > 0 && (
        <ul aria-label={`Removed options of ${name}`} className="flex flex-col gap-1 text-sm">
          {removed.map((option) => (
            <li key={option.id} className="flex flex-col gap-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground">Removed:</span> {nameOf(option)}
                <Button type="button" variant="outline" size="sm" aria-label={`Restore option ${nameOf(option)} of ${name}`} onClick={() => onEdit((fields) => restoreOption(fields, field.id, option.id))}>
                  Restore
                </Button>
              </span>
              {errors[`${type}.${field.id}.${option.id}`] && <span className="text-destructive">{errors[`${type}.${field.id}.${option.id}`]}</span>}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-40 flex-1">
          <TextField id={`new-option-${type}-${field.id}`} label={`New option of ${name}`} autoComplete="off" value={newName} error={errors[newKey]} onChange={(e) => setNewName(e.target.value)} onKeyDown={onEnter(add)} />
        </div>
        <Button type="button" variant="outline" size="sm" onClick={add}>
          <Plus aria-hidden />
          Add option
        </Button>
      </div>
    </div>
  );
}

// Delete with a cascade preview (spec 06, "Delete rules"): the page lists every change, then one
// commit makes them (ADR-021). The lists come from the current records, so they are what the
// commit changes.
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useId, useMemo, useState, type ReactNode } from 'react';
import { selectCanWrite, selectReadOnly, useApp } from '@/app/store.ts';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { RECORD_TYPES, type CRMRecord, type RecordType } from '@/core/schemas.ts';
import { stateForError, type OperationState } from '@/storage/operation-state.ts';
import type { VersionedRecord } from '@/storage/workspace-repository.ts';
import { linkButton } from '@/ui/link-button.ts';
import { ArchivedBadge, Problem, RecordNotFound } from '@/ui/record-page.tsx';
import { kindLabel } from './activities/activity-form.ts';
import { deleteBlocker, deleteSummary, planDelete, previewDelete } from './delete-plan.ts';
import { formatDateTime, useRecord } from './records.ts';
import { nameOf, pageOf } from './use-relatable.ts';

const TYPE_LABELS: Record<RecordType, string> = { contact: 'Contact', company: 'Company', opportunity: 'Opportunity', task: 'Task', activity: 'Activity' };

// An activity has no name: "Note from Oct 26, 2026, 4:15 PM".
const labelOf = (record: CRMRecord) => (record.type === 'activity' ? `${kindLabel(record.kind)} from ${formatDateTime(record.occurredAt)}` : nameOf(record));

function RecordList({ heading, records, note }: { heading: string; records: VersionedRecord[]; note?: string }) {
  const id = useId();
  if (records.length === 0) return null;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h2 id={id} className="text-lg font-semibold">{heading}</h2>
      {note && <p className="text-sm text-muted-foreground">{note}</p>}
      <ul className="flex flex-col gap-1 text-sm">
        {/* In record type order, as in the summary sentence. */}
        {records.toSorted((a, b) => RECORD_TYPES.indexOf(a.record.type) - RECORD_TYPES.indexOf(b.record.type)).map(({ record }) => (
          <li key={record.id} className="flex flex-wrap items-center gap-2 break-words">
            <span>
              <span className="text-muted-foreground">{TYPE_LABELS[record.type]}:</span> {labelOf(record)}
            </span>
            {record.archivedAt && <ArchivedBadge />}
          </li>
        ))}
      </ul>
    </section>
  );
}

function DeleteRecord<R extends CRMRecord>({
  saved,
  cancel,
  notFound,
  onDeleted,
}: {
  saved: VersionedRecord<R> | undefined;
  cancel: ReactNode;
  notFound: ReactNode;
  onDeleted: (record: R) => void;
}) {
  const snapshot = useApp((s) => s.snapshot);
  const canWrite = useApp(selectCanWrite);
  const readOnly = useApp(selectReadOnly);
  const otherSave = useApp((s) => s.saving);
  const [state, setState] = useState<OperationState>({ status: 'idle' });
  const preview = useMemo(() => saved && snapshot && previewDelete(saved, snapshot.records), [saved, snapshot]);
  const deleting = state.status === 'saving';
  if (!saved || !preview) return deleting ? null : <RecordNotFound singular={saved?.record.type ?? 'record'} back={notFound} />;

  const record = saved.record;
  const blocker = deleteBlocker(snapshot?.issues ?? []);
  const name = record.type === 'activity' ? `the ${kindLabel(record.kind).toLowerCase()} from ${formatDateTime(record.occurredAt)}` : nameOf(record);
  const problem =
    state.status === 'conflict'
      ? 'Someone changed the records after this page listed them. The lists now show the latest records. Check them, then delete again.'
      : 'message' in state
        ? state.message
        : null;

  async function confirm() {
    setState({ status: 'saving' });
    try {
      await useApp.getState().deleteRecords(planDelete(preview!, new Date()));
      onDeleted(record);
    } catch (error) {
      setState(stateForError(error));
    }
  }

  return (
    <>
      <h1 className="text-2xl font-semibold break-words">Delete {name}?</h1>
      <p>{deleteSummary(preview)}</p>
      <RecordList heading="Also deleted" records={preview.deleted} />
      <RecordList heading="Unlinked" records={preview.unlinked} note={`These records stay. Only their link to ${labelOf(record)} goes.`} />
      {/* A note, not an alert: a screen reader reads it with the page, and does not interrupt. */}
      <Alert role="note">
        <AlertDescription>
          Delete removes these records from the current data. Previous Git versions remain: anyone who can read the repository can still find them in its history. To
          hide a record and keep it, archive it instead.
        </AlertDescription>
      </Alert>
      {blocker && <Problem><span className="wrap-anywhere">{blocker}</span></Problem>}
      {problem && <Problem>{problem}</Problem>}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="destructive" disabled={!canWrite || blocker !== null || deleting} onClick={() => void confirm()}>
          {deleting ? 'Deleting…' : `Delete ${record.type}`}
        </Button>
        {cancel}
      </div>
      {!canWrite && !deleting && (
        <p className="text-sm text-muted-foreground">
          {readOnly
            ? 'GitCRM is read-only here, so nothing can be deleted.'
            : otherSave
              ? 'You can delete when the other save finishes.'
              : 'You can delete when GitCRM finishes checking GitHub.'}
        </p>
      )}
    </>
  );
}

const cancelClass = linkButton({ variant: 'ghost' });

export function DeleteContactPage() {
  const { contactId } = useParams({ from: '/contacts/$contactId/delete' });
  const navigate = useNavigate();
  return (
    <DeleteRecord
      saved={useRecord('contact', contactId)}
      cancel={<Link to="/contacts/$contactId" params={{ contactId }} className={cancelClass}>Cancel</Link>}
      notFound={<Link to="/contacts" className="underline">Back to contacts</Link>}
      onDeleted={() => void navigate({ to: '/contacts' })}
    />
  );
}

export function DeleteCompanyPage() {
  const { companyId } = useParams({ from: '/companies/$companyId/delete' });
  const navigate = useNavigate();
  return (
    <DeleteRecord
      saved={useRecord('company', companyId)}
      cancel={<Link to="/companies/$companyId" params={{ companyId }} className={cancelClass}>Cancel</Link>}
      notFound={<Link to="/companies" className="underline">Back to companies</Link>}
      onDeleted={() => void navigate({ to: '/companies' })}
    />
  );
}

export function DeleteOpportunityPage() {
  const { opportunityId } = useParams({ from: '/opportunities/$opportunityId/delete' });
  const navigate = useNavigate();
  return (
    <DeleteRecord
      saved={useRecord('opportunity', opportunityId)}
      cancel={<Link to="/opportunities/$opportunityId" params={{ opportunityId }} className={cancelClass}>Cancel</Link>}
      notFound={<Link to="/pipeline" className="underline">Back to the pipeline</Link>}
      onDeleted={() => void navigate({ to: '/pipeline' })}
    />
  );
}

export function DeleteTaskPage() {
  const { taskId } = useParams({ from: '/tasks/$taskId/delete' });
  const navigate = useNavigate();
  return (
    <DeleteRecord
      saved={useRecord('task', taskId)}
      cancel={<Link to="/tasks/$taskId" params={{ taskId }} className={cancelClass}>Cancel</Link>}
      notFound={<Link to="/tasks" className="underline">Back to tasks</Link>}
      onDeleted={() => void navigate({ to: '/tasks' })}
    />
  );
}

// An activity has no page of its own: Cancel and a finished delete open its related record.
export function DeleteActivityPage() {
  const { activityId } = useParams({ from: '/activities/$activityId/delete' });
  const navigate = useNavigate();
  const saved = useRecord('activity', activityId);
  return (
    <DeleteRecord
      saved={saved}
      cancel={<Link {...pageOf(saved?.record.related ?? null)} className={cancelClass}>Cancel</Link>}
      notFound={<Link to="/" className="underline">Back to Home</Link>}
      onDeleted={(activity) => void navigate(pageOf(activity.related))}
    />
  );
}

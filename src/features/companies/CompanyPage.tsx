// One company (spec 02): details, its contacts, opportunities, tasks, and activity, Edit,
// Archive or Restore, and Delete.
import { Link, useParams } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { useRef, useState } from 'react';
import { selectCanWrite, selectReadOnly, useApp } from '@/app/store.ts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { linkButton } from '@/ui/link-button.ts';
import { ArchivedBadge, Detail, Pager, Problem, RecordNotFound, Tags } from '@/ui/record-page.tsx';
import { CustomFieldDetails } from '../custom-fields/CustomFields.tsx';
import { onePage } from '../list-page.ts';
import { RelatedOpportunities } from '../opportunities/RelatedOpportunities.tsx';
import { ActivityTimeline } from '../activities/ActivityTimeline.tsx';
import { RelatedTasks } from '../tasks/RelatedTasks.tsx';
import { formatDate, useRecord, useRecords } from '../records.ts';
import { useArchive } from '../use-archive.ts';

export function CompanyPage() {
  const { companyId } = useParams({ from: '/companies/$companyId' });
  const saved = useRecord('company', companyId);
  const contacts = useRecords('contact')
    .map((v) => v.record)
    .filter((c) => c.companyId === companyId)
    // Active contacts first, then by name.
    .sort((a, b) => Number(a.archivedAt !== null) - Number(b.archivedAt !== null) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  const [index, setIndex] = useState(0);
  const list = useRef<HTMLUListElement>(null);
  const page = onePage(contacts, index);
  const readOnly = useApp(selectReadOnly);
  const canWrite = useApp(selectCanWrite);
  const archive = useArchive(saved);
  if (!saved) return <RecordNotFound singular="company" back={<Link to="/companies" className="underline">Back to companies</Link>} />;
  const company = saved.record;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold break-words">{company.name}</h1>
        {archive.archived && <ArchivedBadge />}
        {!readOnly && (
          <div className="ml-auto flex gap-2">
            <Link to="/companies/$companyId/edit" params={{ companyId }} className={linkButton({ variant: 'outline' })}>Edit</Link>
            <Button variant="outline" disabled={!canWrite} onClick={() => void archive.toggle()}>
              {archive.saving ? 'Saving…' : archive.archived ? 'Restore' : 'Archive'}
            </Button>
            <Link to="/companies/$companyId/delete" params={{ companyId }} className={linkButton({ variant: 'outline' })}>Delete</Link>
          </div>
        )}
      </div>
      {archive.message && <Problem>{archive.message}</Problem>}
      <Card>
        <CardContent>
          <dl className="flex flex-col gap-3 text-sm">
            <Detail label="Website">
              {company.website ? (
                <a className="underline" href={company.website} target="_blank" rel="noopener noreferrer">{company.website}</a>
              ) : (
                <span className="text-muted-foreground">None</span>
              )}
            </Detail>
            <Detail label="Tags">
              <Tags tags={company.tags} />
            </Detail>
            <CustomFieldDetails type="company" values={company.customFields} />
            <Detail label="Last updated">{formatDate(company.updatedAt)}</Detail>
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>
            <h2>Contacts</h2>
          </CardTitle>
          {!readOnly && (
            <Link to="/contacts/new" search={{ companyId }} className={linkButton({ variant: 'outline', size: 'sm' })}>
              <Plus aria-hidden />
              Add contact
            </Link>
          )}
        </CardHeader>
        <CardContent>
          {contacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No contacts at this company yet.</p>
          ) : (
            <ul ref={list} tabIndex={-1} aria-label={`Contacts at ${company.name}`} className="flex flex-col gap-1 text-sm outline-none">
              {page.rows.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-2">
                  <Link to="/contacts/$contactId" params={{ contactId: c.id }} className="underline">{c.name}</Link>
                  {c.archivedAt && <ArchivedBadge />}
                </li>
              ))}
            </ul>
          )}
          <Pager page={page} label={`Contacts at ${company.name}`} list={list} onPage={setIndex} />
        </CardContent>
      </Card>
      <RelatedOpportunities name={company.name} linked={(o) => o.companyId === companyId} search={{ companyId }} />
      <RelatedTasks name={company.name} related={{ type: 'company', id: companyId }} />
      <ActivityTimeline name={company.name} related={{ type: 'company', id: companyId }} />
    </>
  );
}

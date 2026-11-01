// One opportunity (spec 03): details, its company and contacts, its tasks and activity, Edit,
// Archive or Restore, and Delete.
import { Link, useParams } from '@tanstack/react-router';
import { selectCanWrite, selectReadOnly, useApp } from '@/app/store.ts';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { formatMoney } from '@/core/money.ts';
import { linkButton } from '@/ui/link-button.ts';
import { ArchivedBadge, Detail, Problem, RecordNotFound } from '@/ui/record-page.tsx';
import { CustomFieldDetails } from '../custom-fields/CustomFields.tsx';
import { formatCalendarDate, formatDate, useRecord, useRecords, useStages } from '../records.ts';
import { useArchive } from '../use-archive.ts';
import { ActivityTimeline } from '../activities/ActivityTimeline.tsx';
import { RelatedTasks } from '../tasks/RelatedTasks.tsx';
import { stageName } from './pipeline.ts';

const none = <span className="text-muted-foreground">None</span>;

export function OpportunityPage() {
  const { opportunityId } = useParams({ from: '/opportunities/$opportunityId' });
  const saved = useRecord('opportunity', opportunityId);
  const company = useRecord('company', saved?.record.companyId ?? '');
  const contacts = useRecords('contact');
  const stages = useStages();
  const readOnly = useApp(selectReadOnly);
  const canWrite = useApp(selectCanWrite);
  const archive = useArchive(saved);
  if (!saved) return <RecordNotFound singular="opportunity" back={<Link to="/pipeline" className="underline">Back to the pipeline</Link>} />;
  const opportunity = saved.record;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold break-words">{opportunity.title}</h1>
        {archive.archived && <ArchivedBadge />}
        {!readOnly && (
          <div className="ml-auto flex gap-2">
            <Link to="/opportunities/$opportunityId/edit" params={{ opportunityId }} className={linkButton({ variant: 'outline' })}>Edit</Link>
            <Button variant="outline" disabled={!canWrite} onClick={() => void archive.toggle()}>
              {archive.saving ? 'Saving…' : archive.archived ? 'Restore' : 'Archive'}
            </Button>
            <Link to="/opportunities/$opportunityId/delete" params={{ opportunityId }} className={linkButton({ variant: 'outline' })}>Delete</Link>
          </div>
        )}
      </div>
      {archive.message && <Problem>{archive.message}</Problem>}
      <Card>
        <CardContent>
          <dl className="flex flex-col gap-3 text-sm">
            <Detail label="Stage">{stageName(stages, opportunity.stageId)}</Detail>
            <Detail label="Value">{opportunity.valueMinor !== null ? formatMoney(opportunity.valueMinor, opportunity.currency) : none}</Detail>
            <Detail label="Expected close">{opportunity.expectedCloseDate ? formatCalendarDate(opportunity.expectedCloseDate) : none}</Detail>
            <Detail label="Company">
              {company ? (
                <span className="flex flex-wrap items-center gap-2">
                  <Link to="/companies/$companyId" params={{ companyId: company.record.id }} className="underline">{company.record.name}</Link>
                  {company.record.archivedAt && <ArchivedBadge />}
                </span>
              ) : opportunity.companyId ? (
                <span>
                  Missing company (ID {opportunity.companyId.slice(0, 8)}). <Link to="/settings" className="underline">See Settings</Link>.
                </span>
              ) : (
                none
              )}
            </Detail>
            <Detail label="Contacts">
              {opportunity.contactIds.length === 0 ? (
                none
              ) : (
                <ul>
                  {opportunity.contactIds.map((id) => {
                    const contact = contacts.find((c) => c.record.id === id)?.record;
                    return (
                      <li key={id} className="flex flex-wrap items-center gap-2">
                        {contact ? (
                          <>
                            <Link to="/contacts/$contactId" params={{ contactId: id }} className="underline">{contact.name}</Link>
                            {contact.archivedAt && <ArchivedBadge />}
                          </>
                        ) : (
                          `Missing contact (ID ${id.slice(0, 8)})`
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Detail>
            <CustomFieldDetails type="opportunity" values={opportunity.customFields} />
            <Detail label="Last updated">{formatDate(opportunity.updatedAt)}</Detail>
          </dl>
        </CardContent>
      </Card>
      <RelatedTasks name={opportunity.title} related={{ type: 'opportunity', id: opportunityId }} />
      <ActivityTimeline name={opportunity.title} related={{ type: 'opportunity', id: opportunityId }} />
    </>
  );
}

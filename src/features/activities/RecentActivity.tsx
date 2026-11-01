// Home's recent activity (docs/08): the 5 latest activities that are not archived.
import { Link } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { selectReadOnly, useApp } from '@/app/store.ts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { linkButton } from '@/ui/link-button.ts';
import { formatDateTime, useRecords } from '../records.ts';
import { RelatedLink } from '../RelatedRecord.tsx';
import { kindLabel } from './activity-form.ts';
import { timeline } from './timeline.ts';

const SHOWN = 5;

export function RecentActivity() {
  const readOnly = useApp(selectReadOnly);
  const recent = timeline(
    useRecords('activity')
      .map((v) => v.record)
      .filter((a) => a.archivedAt === null),
  ).slice(0, SHOWN);

  return (
    <section aria-labelledby="recent-activity-heading">
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>
            <h2 id="recent-activity-heading">Recent activity</h2>
          </CardTitle>
          {!readOnly && (
            <Link to="/activities/new" className={linkButton({ variant: 'outline', size: 'sm' })}>
              <Plus aria-hidden />
              Log activity
            </Link>
          )}
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity yet.</p>
          ) : (
            <ol aria-label="Recent activity" className="flex flex-col divide-y">
              {recent.map((activity) => (
                <li key={activity.id} className="flex flex-col gap-0.5 py-2 text-sm">
                  <span className="flex flex-wrap items-center gap-x-2">
                    <span className="font-medium">{kindLabel(activity.kind)}</span>
                    <span className="text-muted-foreground">{formatDateTime(activity.occurredAt)}</span>
                    {activity.related && (
                      <span className="text-muted-foreground">
                        with <RelatedLink related={activity.related} />
                      </span>
                    )}
                  </span>
                  <p className="line-clamp-2 break-words whitespace-pre-wrap">{activity.body}</p>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

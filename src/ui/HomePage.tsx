// Home (docs/08): counts of active records, the open pipeline by stage, tasks due, and recent
// activity.
import { Link } from '@tanstack/react-router';
import { useApp } from '@/app/store.ts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { RecordType } from '@/core/schemas.ts';
import { isTerminal } from '@/core/stages.ts';
import { RecentActivity } from '@/features/activities/RecentActivity.tsx';
import { useStages } from '@/features/records.ts';
import { DueTasks } from '@/features/tasks/DueTasks.tsx';

const COUNTED: { type: RecordType; label: string; to: '/contacts' | '/companies' | '/pipeline' }[] = [
  { type: 'contact', label: 'Contacts', to: '/contacts' },
  { type: 'company', label: 'Companies', to: '/companies' },
  { type: 'opportunity', label: 'Opportunities', to: '/pipeline' },
];

export function HomePage() {
  const snapshot = useApp((s) => s.snapshot);
  const active = (type: RecordType) => snapshot?.records.filter(({ record }) => record.type === type && record.archivedAt === null).length ?? 0;
  const issues = snapshot?.issues.length ?? 0;
  const open = useStages().filter((s) => !isTerminal(s.id));
  const inStage = (id: string) => snapshot?.records.filter(({ record }) => record.type === 'opportunity' && record.archivedAt === null && record.stageId === id).length ?? 0;

  return (
    <>
      <h1 className="text-2xl font-semibold">{snapshot?.workspace?.config.name}</h1>
      {issues > 0 && (
        <p className="text-sm">
          {issues === 1 ? '1 file in the repository needs attention.' : `${issues} files in the repository need attention.`}{' '}
          <Link to="/settings" className="underline">See Settings</Link>.
        </p>
      )}
      <section aria-label="Active records" className="grid gap-4 sm:grid-cols-3">
        {COUNTED.map(({ type, label, to }) => (
          <Card key={type}>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                <Link to={to} className="underline">
                  {label}
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-semibold">{active(type)}</CardContent>
          </Card>
        ))}
      </section>
      <DueTasks />
      <section aria-labelledby="open-pipeline-heading">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2 id="open-pipeline-heading">Open opportunities by stage</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm sm:max-w-sm">
              {open.map((stage) => (
                <div key={stage.id} className="contents">
                  <dt>{stage.label}</dt>
                  <dd className="text-right tabular-nums">{inStage(stage.id)}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </section>
      <RecentActivity />
    </>
  );
}

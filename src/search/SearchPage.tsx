// The Search page (spec 05): every record type, from the records in memory. The search stays in
// the store, never in the page address (docs/07), so Back to this page shows it again.
import { Link } from '@tanstack/react-router';
import { useMemo, useRef, type ReactNode } from 'react';
import { useApp } from '@/app/store.ts';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatMoney } from '@/core/money.ts';
import type { RecordType } from '@/core/schemas.ts';
import { ActivityItem } from '@/features/activities/ActivityTimeline.tsx';
import { stageName } from '@/features/opportunities/pipeline.ts';
import { useFieldSets, useRecords, useStages } from '@/features/records.ts';
import { TaskItem } from '@/features/tasks/TaskItem.tsx';
import { useCompletion } from '@/features/tasks/use-completion.ts';
import { useToday } from '@/features/use-today.ts';
import { selectClassName } from '@/ui/form-fields.tsx';
import { onePage } from '@/features/list-page.ts';
import { ArchivedBadge, ListSummary, Pager, Problem } from '@/ui/record-page.tsx';
import { indexRecords, search, type SearchView } from './search.ts';

const GROUPS: Record<RecordType, string> = { contact: 'Contacts', company: 'Companies', opportunity: 'Opportunities', task: 'Tasks', activity: 'Activities' };
const linkClass = 'font-medium break-words hover:underline';
// With "All types", a group shows this many results. Drawing every row of a short search, such as one
// letter, took 0.7 s at 2,000 records (docs/06).
const FIRST = 10;

export function SearchPage() {
  const snapshot = useApp((s) => s.snapshot);
  const view = useApp((s) => s.search);
  const stages = useStages();
  const fields = useFieldSets();
  const companies = useRecords('company');
  const completion = useCompletion();
  const today = useToday();
  const index = useMemo(() => indexRecords(snapshot?.records ?? [], stages, fields), [snapshot, stages, fields]);
  const { query, type, showArchived } = view;
  const { found, shown, hiddenArchived } = useMemo(() => search(index, { query, type, showArchived }), [index, query, type, showArchived]);
  const companyNames = useMemo(() => new Map(companies.map(({ record }) => [record.id, record.name])), [companies]);
  const companyOf = (companyId: string | null) => (companyId && companyNames.get(companyId)) || '';
  const set = (changes: Partial<SearchView>) => useApp.getState().setSearchView(changes);

  return (
    <>
      <h1 className="text-2xl font-semibold">Search</h1>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-48 flex-1 flex-col gap-1.5">
          <Label htmlFor="search-query">Search records</Label>
          <Input id="search-query" type="search" autoComplete="off" value={view.query} onChange={(e) => set({ query: e.target.value })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="search-type">Record type</Label>
          <select id="search-type" className={selectClassName} value={view.type} onChange={(e) => set({ type: e.target.value as SearchView['type'] })}>
            <option value="all">All types</option>
            {Object.entries(GROUPS).map(([type, label]) => (
              <option key={type} value={type}>{label}</option>
            ))}
          </select>
        </div>
        <div className="flex h-8 items-center gap-2">
          <Checkbox id="search-archived" aria-labelledby="search-archived-label" checked={view.showArchived} onCheckedChange={(checked) => set({ showArchived: checked === true })} />
          <Label id="search-archived-label" htmlFor="search-archived">Show archived</Label>
        </div>
      </div>
      {view.query.trim() === '' ? (
        <p className="text-muted-foreground">Search by name, email, phone, tag, title, or what happened.</p>
      ) : (
        <>
          <ListSummary shown={shown} hiddenArchived={hiddenArchived} singular="record" plural="records" />
          {completion.message && <Problem>{completion.message}</Problem>}
          <Group type="contact" items={found.contact} all={view.type !== 'all'}>
            {({ record: c }) => (
              <Row key={c.id} archived={c.archivedAt !== null} details={[companyOf(c.companyId), c.emails[0]]}>
                <Link to="/contacts/$contactId" params={{ contactId: c.id }} className={linkClass}>{c.name}</Link>
              </Row>
            )}
          </Group>
          <Group type="company" items={found.company} all={view.type !== 'all'}>
            {({ record: c }) => (
              <Row key={c.id} archived={c.archivedAt !== null} details={[c.website && new URL(c.website).host]}>
                <Link to="/companies/$companyId" params={{ companyId: c.id }} className={linkClass}>{c.name}</Link>
              </Row>
            )}
          </Group>
          <Group type="opportunity" items={found.opportunity} all={view.type !== 'all'}>
            {({ record: o }) => (
              <Row key={o.id} archived={o.archivedAt !== null} details={[stageName(stages, o.stageId), companyOf(o.companyId), o.valueMinor !== null && formatMoney(o.valueMinor, o.currency)]}>
                <Link to="/opportunities/$opportunityId" params={{ opportunityId: o.id }} className={linkClass}>{o.title}</Link>
              </Row>
            )}
          </Group>
          <Group type="task" items={found.task} all={view.type !== 'all'}>
            {(saved) => <TaskItem key={saved.record.id} saved={saved} today={today} pending={completion.pending === saved.record.id} onToggle={completion.toggle} showRelated />}
          </Group>
          <Group type="activity" items={found.activity} all={view.type !== 'all'}>
            {(saved) => <ActivityItem key={saved.record.id} saved={saved} showRelated />}
          </Group>
        </>
      )}
    </>
  );
}

// "Show all" chooses the record type, and focus moves to the heading, above the first new result.
// One record type shows in pages of 50 (spec 08).
function Group<V>({ type, items, all, children }: { type: RecordType; items: V[]; all: boolean; children: (item: V) => ReactNode }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const index = useApp((s) => s.search.page);
  if (items.length === 0) return null;
  const page = onePage(items, index);
  const shown = all ? page.rows : items.slice(0, FIRST);
  const noun = GROUPS[type].toLowerCase();
  return (
    <section aria-labelledby={`results-${type}`} className="flex flex-col gap-2">
      <h2 ref={heading} id={`results-${type}`} tabIndex={-1} className="text-lg font-semibold">{GROUPS[type]}</h2>
      <ul ref={list} tabIndex={-1} aria-labelledby={`results-${type}`} className="divide-y rounded-lg border px-3 outline-none">{shown.map(children)}</ul>
      {all && page.count > 1 && (
        <p className="text-sm text-muted-foreground">
          Showing {page.from}–{page.to} of {items.length} {noun}.
        </p>
      )}
      {all && <Pager page={page} label={GROUPS[type]} list={list} onPage={(page) => useApp.getState().setSearchView({ page })} />}
      {!all && shown.length < items.length && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          Showing {shown.length} of {items.length} {noun}.
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto p-0"
            onClick={() => {
              useApp.getState().setSearchView({ type });
              heading.current?.focus();
            }}
          >
            Show all {items.length} {noun}
          </Button>
        </p>
      )}
    </section>
  );
}

function Row({ archived, details, children }: { archived: boolean; details: (string | false | null | undefined)[]; children: ReactNode }) {
  const line = details.filter(Boolean).join(' · ');
  return (
    <li className="flex flex-col gap-0.5 py-2">
      <span className="flex flex-wrap items-center gap-2">
        {children}
        {archived && <ArchivedBadge />}
      </span>
      {line && <span className="text-sm break-words text-muted-foreground">{line}</span>}
    </li>
  );
}

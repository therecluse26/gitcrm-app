// The pipeline (spec 03): a board with a column per stage, and a list view for keyboard users and
// narrow screens. Each opportunity has a Move to stage menu; on the board, drag and drop works too.
// The list and each column come in pages of 50 (spec 08). Cards and rows are memos, so a move draws
// again only the opportunity that moved (docs/06).
import { Link } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { memo, useId, useMemo, useRef, useState, type DragEvent, type RefObject } from 'react';
import { selectCanWrite, selectReadOnly, useApp } from '@/app/store.ts';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { formatMoney } from '@/core/money.ts';
import type { Opportunity } from '@/core/schemas.ts';
import { isTerminal, type Stage } from '@/core/stages.ts';
import type { VersionedRecord } from '@/storage/workspace-repository.ts';
import { table as tableStyle, tableBox, td, th } from '@/ui/data-table.ts';
import { selectClassName } from '@/ui/form-fields.tsx';
import { linkButton } from '@/ui/link-button.ts';
import { ArchivedBadge, ListSummary, Pager, Problem } from '@/ui/record-page.tsx';
import { onePage } from '../list-page.ts';
import { formatCalendarDate, useRecords, useStages } from '../records.ts';
import { pipelineColumns, stageName, type PipelineColumn } from './pipeline.ts';
import { StageMark } from './StageMark.tsx';
import { useStageMove } from './use-stage-move.ts';

// Only GitCRM's own columns accept the drag, and the drag carries an ID, never record data.
const DRAG_TYPE = 'application/x-gitcrm-opportunity';

type Names = { company: (id: string | null) => string; contacts: (ids: string[]) => string };
// What every card and row shares. Each part stays the same object until its records change.
type Shared = { stages: Stage[]; names: Names; versions: Map<string, VersionedRecord<Opportunity>>; pendingId: string | null; onMove: ReturnType<typeof useStageMove>['move'] };

export function PipelinePage() {
  const stages = useStages();
  const view = useApp((s) => s.pipeline);
  const readOnly = useApp(selectReadOnly);
  const saved = useRecords('opportunity');
  const companies = useRecords('company');
  const contacts = useRecords('contact');
  const moves = useStageMove();
  const table = useRef<HTMLTableElement>(null);
  const pendingId = moves.pending?.id ?? null;
  const pendingStage = moves.pending?.stageId ?? null;
  const { openOnly, showArchived } = view;
  // A pending move shows the card in its new stage until the commit lands.
  const { columns, shown, hiddenArchived } = useMemo(() => {
    const shownRecords = saved.map(({ record }) => (record.id === pendingId ? { ...record, stageId: pendingStage! } : record));
    return pipelineColumns(shownRecords, stages, { openOnly, showArchived });
  }, [saved, pendingId, pendingStage, stages, openOnly, showArchived]);
  const names = useMemo((): Names => {
    const companyNames = new Map(companies.map(({ record }) => [record.id, record.name]));
    const contactNames = new Map(contacts.map(({ record }) => [record.id, record.name]));
    return {
      company: (id) => (id && companyNames.get(id)) || '',
      // The first contact by name, and how many more; a missing contact is left out.
      contacts: (ids) => {
        const found = ids.flatMap((id) => contactNames.get(id) ?? []);
        return found.length > 1 ? `${found[0]} and ${found.length - 1} more` : (found[0] ?? '');
      },
    };
  }, [companies, contacts]);
  const versions = useMemo(() => new Map(saved.map((v) => [v.record.id, v])), [saved]);
  const shared: Shared = { stages, names, versions, pendingId, onMove: moves.move };
  const page = onePage(
    columns.flatMap((column) => column.opportunities),
    view.page,
  );
  const set = useApp.getState().setPipelineView;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Pipeline</h1>
        {!readOnly && (
          <Link to="/opportunities/new" className={linkButton()}>
            <Plus aria-hidden />
            New opportunity
          </Link>
        )}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pipeline-layout">View</Label>
          <select id="pipeline-layout" className={selectClassName} value={view.layout} onChange={(e) => set({ layout: e.target.value as typeof view.layout })}>
            <option value="board">Board</option>
            <option value="list">List</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="pipeline-show">Show</Label>
          <select id="pipeline-show" className={selectClassName} value={view.openOnly ? 'open' : 'all'} onChange={(e) => set({ openOnly: e.target.value === 'open' })}>
            <option value="all">All stages</option>
            <option value="open">Open only</option>
          </select>
        </div>
        <div className="flex h-8 items-center gap-2">
          <Checkbox id="pipeline-archived" aria-labelledby="pipeline-archived-label" checked={view.showArchived} onCheckedChange={(checked) => set({ showArchived: checked === true })} />
          <Label id="pipeline-archived-label" htmlFor="pipeline-archived">Show archived</Label>
        </div>
      </div>
      <ListSummary shown={shown} hiddenArchived={hiddenArchived} singular="opportunity" plural="opportunities" page={view.layout === 'list' ? page : undefined} />
      {moves.message && <Problem>{moves.message}</Problem>}
      {view.layout === 'board' ? (
        <Board columns={columns} shared={shared} />
      ) : (
        <>
          <OpportunityTable rows={page.rows} table={table} shared={shared} />
          <Pager page={page} label="Opportunities" list={table} onPage={(page) => set({ page })} />
        </>
      )}
    </>
  );
}

function Board({ columns, shared }: { columns: PipelineColumn[]; shared: Shared }) {
  return (
    <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
      {columns.map((column) => (
        <Column key={column.stage?.id ?? '?'} column={column} shared={shared} />
      ))}
    </div>
  );
}

function Column({ column, shared }: { column: PipelineColumn; shared: Shared }) {
  const headingId = useId();
  const canWrite = useApp(selectCanWrite);
  const [index, setIndex] = useState(0);
  const list = useRef<HTMLUListElement>(null);
  const { stage, opportunities } = column;
  const page = onePage(opportunities, index);
  // Won and Lost differ by border and by the word "Closed", not by color alone (docs/08).
  const closed = stage !== null && isTerminal(stage.id);
  const accepts = (event: DragEvent) => canWrite && stage !== null && event.dataTransfer.types.includes(DRAG_TYPE);

  return (
    <section
      aria-labelledby={headingId}
      className={`flex w-64 shrink-0 flex-col gap-2 rounded-lg p-2 ${closed ? 'border border-dashed' : 'bg-muted/50'}`}
      onDragOver={(event) => {
        if (!accepts(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
      }}
      onDrop={(event) => {
        if (!accepts(event)) return;
        event.preventDefault();
        // A drag from another GitCRM tab can carry an ID this workspace does not have.
        const dragged = shared.versions.get(event.dataTransfer.getData(DRAG_TYPE));
        if (dragged) void shared.onMove(dragged, stage!.id);
      }}
    >
      <div className="flex items-baseline justify-between gap-2 px-1">
        <h2 id={headingId} className="flex items-center gap-2 font-medium break-words">
          <StageMark stages={shared.stages} id={stage?.id ?? ''} />
          {stage?.label ?? 'Unknown stage'}
        </h2>
        <span className="text-sm text-muted-foreground">
          {closed && 'Closed · '}
          {opportunities.length}
        </span>
      </div>
      {stage === null && <p className="px-1 text-sm text-muted-foreground">These stages are not in the workspace settings. Move each opportunity to a stage.</p>}
      <ul ref={list} tabIndex={-1} aria-labelledby={headingId} className="flex flex-col gap-2 outline-none">
        {page.rows.map((opportunity) => (
          <OpportunityCard
            key={opportunity.id}
            opportunity={opportunity}
            saved={shared.versions.get(opportunity.id)!}
            names={shared.names}
            stages={shared.stages}
            pending={shared.pendingId === opportunity.id}
            onMove={shared.onMove}
          />
        ))}
      </ul>
      <Pager page={page} label={stage?.label ?? 'Unknown stage'} list={list} onPage={setIndex} />
    </section>
  );
}

// `opportunity` shows the pending stage during a move; `saved` is the version that the move changes.
type ItemProps = { opportunity: Opportunity; saved: VersionedRecord<Opportunity>; names: Names; stages: Stage[]; pending: boolean; onMove: Shared['onMove'] };

const OpportunityCard = memo(function OpportunityCard({ opportunity, saved, names, stages, pending, onMove }: ItemProps) {
  const canWrite = useApp(selectCanWrite);
  const details = [names.company(opportunity.companyId), names.contacts(opportunity.contactIds), opportunity.valueMinor !== null && formatMoney(opportunity.valueMinor, opportunity.currency)].filter(Boolean);
  return (
    <li
      draggable={canWrite}
      onDragStart={(event) => {
        event.dataTransfer.setData(DRAG_TYPE, opportunity.id);
        event.dataTransfer.effectAllowed = 'move';
      }}
      className="flex flex-col gap-1.5 rounded-lg border bg-card p-2.5 text-sm shadow-xs"
    >
      <span className="flex flex-wrap items-center gap-2">
        <Link to="/opportunities/$opportunityId" params={{ opportunityId: opportunity.id }} className="font-medium break-words hover:underline">
          {opportunity.title}
        </Link>
        {opportunity.archivedAt && <ArchivedBadge />}
      </span>
      {details.length > 0 && <span className="break-words text-muted-foreground">{details.join(' · ')}</span>}
      {opportunity.expectedCloseDate && <span className="text-muted-foreground">Closes {formatCalendarDate(opportunity.expectedCloseDate)}</span>}
      <StageMenu opportunity={opportunity} saved={saved} stages={stages} onMove={onMove} />
      {pending && <span role="status">Moving…</span>}
    </li>
  );
});

// The keyboard path for a move (spec 03): a native select works without a mouse.
function StageMenu({ opportunity, saved, stages, onMove }: Pick<ItemProps, 'opportunity' | 'saved' | 'stages' | 'onMove'>) {
  const canWrite = useApp(selectCanWrite);
  const known = stages.some((s) => s.id === opportunity.stageId);
  return (
    <select aria-label={`Move ${opportunity.title} to stage`} className={selectClassName} value={opportunity.stageId} disabled={!canWrite} onChange={(e) => void onMove(saved, e.target.value)}>
      {!known && (
        <option value={opportunity.stageId} disabled>
          {stageName(stages, opportunity.stageId)}
        </option>
      )}
      {stages.map((stage) => (
        <option key={stage.id} value={stage.id}>{stage.label}</option>
      ))}
    </select>
  );
}

function OpportunityTable({ rows, table, shared }: { rows: Opportunity[]; table: RefObject<HTMLTableElement | null>; shared: Shared }) {
  if (rows.length === 0) return null;
  return (
    <div className={tableBox}>
      <table ref={table} tabIndex={-1} aria-label="Opportunities" className={tableStyle}>
        <thead>
          <tr>
            {['Opportunity', 'Stage', 'Value', 'Company', 'Contacts', 'Expected close'].map((name) => (
              <th key={name} className={th}>{name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((opportunity) => (
            <OpportunityRow
              key={opportunity.id}
              opportunity={opportunity}
              saved={shared.versions.get(opportunity.id)!}
              names={shared.names}
              stages={shared.stages}
              pending={shared.pendingId === opportunity.id}
              onMove={shared.onMove}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

const OpportunityRow = memo(function OpportunityRow({ opportunity, saved, names, stages, pending, onMove }: ItemProps) {
  return (
    <tr>
      <td className={td}>
        <span className="flex flex-wrap items-center gap-2">
          <Link to="/opportunities/$opportunityId" params={{ opportunityId: opportunity.id }} className="font-medium hover:underline">
            {opportunity.title}
          </Link>
          {opportunity.archivedAt && <ArchivedBadge />}
          {pending && <span role="status">Moving…</span>}
        </span>
      </td>
      <td className={`${td} min-w-48 py-1`}>
        <span className="flex items-center gap-2">
          <StageMark stages={stages} id={opportunity.stageId} />
          <StageMenu opportunity={opportunity} saved={saved} stages={stages} onMove={onMove} />
        </span>
      </td>
      <td className={`${td} text-right whitespace-nowrap tabular-nums`}>{opportunity.valueMinor !== null ? formatMoney(opportunity.valueMinor, opportunity.currency) : ''}</td>
      <td className={td}>{names.company(opportunity.companyId)}</td>
      <td className={td}>{names.contacts(opportunity.contactIds)}</td>
      <td className={`${td} whitespace-nowrap`}>{opportunity.expectedCloseDate ? formatCalendarDate(opportunity.expectedCloseDate) : ''}</td>
    </tr>
  );
});

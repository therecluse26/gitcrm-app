// The company list (spec 02): search, sort, and archived companies on request, in pages of 50
// (spec 08). A table with a column per field (spec 12).
import { Link } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { memo, useMemo, useRef } from 'react';
import { selectReadOnly, useApp } from '@/app/store.ts';
import type { Company } from '@/core/schemas.ts';
import { table, tableBox, td, th } from '@/ui/data-table.ts';
import { linkButton } from '@/ui/link-button.ts';
import { ArchivedBadge, ListSummary, ListToolbar, Pager } from '@/ui/record-page.tsx';
import { onePage } from '../list-page.ts';
import { listRecords } from '../list-query.ts';
import { formatDate, useRecords } from '../records.ts';

export function CompaniesPage() {
  const companies = useRecords('company');
  const contacts = useRecords('contact');
  const { query, showArchived, sort, page: index } = useApp((s) => s.lists.company);
  const readOnly = useApp(selectReadOnly);
  const list = useRef<HTMLTableElement>(null);
  const contactCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const { record } of contacts) if (record.companyId && record.archivedAt === null) counts.set(record.companyId, (counts.get(record.companyId) ?? 0) + 1);
    return counts;
  }, [contacts]);
  const { shown, hiddenArchived } = useMemo(
    () =>
      listRecords(
        companies.map((v) => v.record),
        { query, showArchived, sort },
        (c) => [c.name, c.website ?? '', ...c.tags],
      ),
    [companies, query, showArchived, sort],
  );
  const page = onePage(shown, index);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Companies</h1>
        {!readOnly && (
          <Link to="/companies/new" className={linkButton()}>
            <Plus aria-hidden />
            New company
          </Link>
        )}
      </div>
      {companies.length === 0 ? (
        <p>No companies yet.</p>
      ) : (
        <>
          <ListToolbar type="company" plural="companies" />
          <ListSummary shown={shown.length} hiddenArchived={hiddenArchived} singular="company" plural="companies" page={page} />
          {shown.length > 0 && (
            <div className={tableBox}>
              <table ref={list} tabIndex={-1} aria-label="Companies" className={table}>
                <thead>
                  <tr>
                    {['Name', 'Website', 'Contacts', 'Tags', 'Updated'].map((name) => (
                      <th key={name} className={th}>{name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {page.rows.map((c) => (
                    <CompanyRow key={c.id} company={c} contacts={contactCounts.get(c.id) ?? 0} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pager page={page} label="Companies" list={list} onPage={(page) => useApp.getState().setListView('company', { page })} />
        </>
      )}
    </>
  );
}

// A memo: a save draws again only the row of the record that changed (docs/06).
const CompanyRow = memo(function CompanyRow({ company: c, contacts }: { company: Company; contacts: number }) {
  return (
    <tr>
      <td className={td}>
        <span className="flex items-center gap-2">
          <Link to="/companies/$companyId" params={{ companyId: c.id }} className="font-medium hover:underline">
            {c.name}
          </Link>
          {c.archivedAt && <ArchivedBadge />}
        </span>
      </td>
      <td className={`${td} text-muted-foreground`}>{c.website && new URL(c.website).host}</td>
      <td className={`${td} text-right tabular-nums`}>{contacts}</td>
      <td className={td}>{c.tags.join(', ')}</td>
      <td className={`${td} whitespace-nowrap text-muted-foreground`}>{formatDate(c.updatedAt)}</td>
    </tr>
  );
});

// The contact list (spec 02): search, sort, and archived contacts on request, in pages of 50
// (spec 08).
import { Link } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { memo, useCallback, useMemo, useRef } from 'react';
import { selectReadOnly, useApp } from '@/app/store.ts';
import type { Contact } from '@/core/schemas.ts';
import { linkButton } from '@/ui/link-button.ts';
import { ArchivedBadge, ListSummary, ListToolbar, Pager } from '@/ui/record-page.tsx';
import { onePage } from '../list-page.ts';
import { listRecords } from '../list-query.ts';
import { useRecords } from '../records.ts';

export function ContactsPage() {
  const contacts = useRecords('contact');
  const companies = useRecords('company');
  const { query, showArchived, sort, page: index } = useApp((s) => s.lists.contact);
  const readOnly = useApp(selectReadOnly);
  const list = useRef<HTMLUListElement>(null);
  const companyNames = useMemo(() => new Map(companies.map(({ record }) => [record.id, record.name])), [companies]);
  const companyOf = useCallback((companyId: string | null) => (companyId && companyNames.get(companyId)) || '', [companyNames]);
  const { shown, hiddenArchived } = useMemo(
    () =>
      listRecords(
        contacts.map((v) => v.record),
        { query, showArchived, sort },
        (c) => [c.name, ...c.emails, ...c.phones, ...c.tags, companyOf(c.companyId)],
      ),
    [contacts, companyOf, query, showArchived, sort],
  );
  const page = onePage(shown, index);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Contacts</h1>
        {!readOnly && (
          <Link to="/contacts/new" className={linkButton()}>
            <Plus aria-hidden />
            New contact
          </Link>
        )}
      </div>
      {contacts.length === 0 ? (
        <p>No contacts yet.</p>
      ) : (
        <>
          <ListToolbar type="contact" plural="contacts" />
          <ListSummary shown={shown.length} hiddenArchived={hiddenArchived} singular="contact" plural="contacts" page={page} />
          {shown.length > 0 && (
            <ul ref={list} tabIndex={-1} aria-label="Contacts" className="divide-y rounded-lg border outline-none">
              {page.rows.map((c) => (
                <ContactRow key={c.id} contact={c} company={companyOf(c.companyId)} />
              ))}
            </ul>
          )}
          <Pager page={page} label="Contacts" list={list} onPage={(page) => useApp.getState().setListView('contact', { page })} />
        </>
      )}
    </>
  );
}

// A memo: a save draws again only the row of the record that changed (docs/06).
const ContactRow = memo(function ContactRow({ contact: c, company }: { contact: Contact; company: string }) {
  return (
    <li className="flex flex-col gap-0.5 px-3 py-2">
      <span className="flex flex-wrap items-center gap-2">
        <Link to="/contacts/$contactId" params={{ contactId: c.id }} className="font-medium break-words hover:underline">
          {c.name}
        </Link>
        {c.archivedAt && <ArchivedBadge />}
      </span>
      <span className="text-sm break-words text-muted-foreground">{[company, c.emails[0]].filter(Boolean).join(' · ')}</span>
    </li>
  );
});

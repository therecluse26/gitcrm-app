// Search across every record type (spec 05). It reads only the current records in memory, never
// Git history or a server (docs/06). Archived records stay hidden unless asked for (spec 06).
import { activeFields, NO_FIELDS, searchText as customText, type CustomFieldSets } from '@/core/custom-fields.ts';
import { formatMoney, minorToInput } from '@/core/money.ts';
import { RECORD_TYPES, type CRMRecord, type RecordOf, type RecordType } from '@/core/schemas.ts';
import type { Stage } from '@/core/stages.ts';
import { latestFirst } from '@/features/activities/timeline.ts';
import { fold, searchWords } from '@/features/list-query.ts';
import { stageName } from '@/features/opportunities/pipeline.ts';
import type { Related } from '@/features/related.ts';
import type { VersionedRecord } from '@/storage/workspace-repository.ts';

export type SearchView = { query: string; type: RecordType | 'all'; showArchived: boolean; page: number };
export const DEFAULT_SEARCH_VIEW: SearchView = { query: '', type: 'all', showArchived: false, page: 0 };

// Each record with its folded search text, in the order the results show.
export type SearchIndex = { saved: VersionedRecord; text: string }[];
export type SearchResults = { found: { [T in RecordType]: VersionedRecord<RecordOf<T>>[] }; shown: number; hiddenArchived: number };

const label = (r: CRMRecord) => ('name' in r ? r.name : 'title' in r ? r.title : r.body);
const byName = (a: CRMRecord, b: CRMRecord) => label(a).localeCompare(label(b), undefined, { sensitivity: 'base' }) || (a.id < b.id ? -1 : 1);
// Groups in RECORD_TYPES order. Activities come latest first, as on a timeline.
const resultOrder = ({ record: a }: VersionedRecord, { record: b }: VersionedRecord) =>
  RECORD_TYPES.indexOf(a.type) - RECORD_TYPES.indexOf(b.type) || (a.type === 'activity' && b.type === 'activity' ? latestFirst(a, b) : byName(a, b));

// Built once per snapshot, so a keystroke only filters. Custom fields add the values they show (spec 10).
export function indexRecords(records: VersionedRecord[], stages: Stage[], fields: CustomFieldSets = NO_FIELDS): SearchIndex {
  const names = new Map<string, string>();
  for (const { record: r } of records) if (r.type === 'contact' || r.type === 'company' || r.type === 'opportunity') names.set(`${r.type}:${r.id}`, label(r));
  // A linked record that is not in the workspace adds no text.
  const nameOf = (type: Related['type'], id: string | null) => names.get(`${type}:${id}`) ?? '';
  const shown = { contact: activeFields(fields.contact), company: activeFields(fields.company), opportunity: activeFields(fields.opportunity) };
  const custom = (record: RecordOf<keyof CustomFieldSets>) => shown[record.type].map((field) => customText(field, record.customFields?.[field.id]));

  function searchText(record: CRMRecord): string[] {
    switch (record.type) {
      case 'contact':
        return [record.name, ...record.emails, ...record.phones, ...record.tags, nameOf('company', record.companyId), ...custom(record)];
      case 'company':
        return [record.name, record.website ?? '', ...record.tags, ...custom(record)];
      case 'opportunity': {
        const amount = record.valueMinor === null ? [] : [formatMoney(record.valueMinor, record.currency), minorToInput(record.valueMinor, record.currency)];
        return [record.title, stageName(stages, record.stageId), nameOf('company', record.companyId), ...record.contactIds.map((id) => nameOf('contact', id)), ...amount, ...custom(record)];
      }
      case 'task':
        return [record.title, record.description, record.related ? nameOf(record.related.type, record.related.id) : ''];
      case 'activity':
        return [record.body, record.related ? nameOf(record.related.type, record.related.id) : ''];
    }
  }

  return records.toSorted(resultOrder).map((saved) => ({ saved, text: fold(searchText(saved.record).join('\n')) }));
}

// `hiddenArchived` counts the archived records that match but are not shown.
export function search(index: SearchIndex, view: Pick<SearchView, 'query' | 'type' | 'showArchived'>): SearchResults {
  const results: SearchResults = { found: { contact: [], company: [], opportunity: [], task: [], activity: [] }, shown: 0, hiddenArchived: 0 };
  const words = searchWords(view.query);
  if (words.length === 0) return results;
  for (const { saved, text } of index) {
    if ((view.type !== 'all' && saved.record.type !== view.type) || !words.every((word) => text.includes(word))) continue;
    if (saved.record.archivedAt !== null && !view.showArchived) {
      results.hiddenArchived += 1;
    } else {
      (results.found[saved.record.type] as VersionedRecord[]).push(saved);
      results.shown += 1;
    }
  }
  return results;
}

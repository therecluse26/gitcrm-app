// Filtering and sorting for record lists (spec 02): search in memory, archived records hidden
// unless asked for (spec 06).

export type ListView = { query: string; showArchived: boolean; sort: 'name' | 'updated'; page: number };
export const DEFAULT_LIST_VIEW: ListView = { query: '', showArchived: false, sort: 'name', page: 0 };

type Listed = { id: string; name: string; updatedAt: string; archivedAt: string | null };

// Case and accents do not matter: "zoe" finds "Zoë".
export const fold = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
// Every word of a search must appear in a record's search text.
export const searchWords = (query: string) => fold(query).split(/\s+/).filter(Boolean);

const compare = {
  name: (a: Listed, b: Listed) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || (a.id < b.id ? -1 : 1),
  updated: (a: Listed, b: Listed) => (a.updatedAt === b.updatedAt ? compare.name(a, b) : a.updatedAt > b.updatedAt ? -1 : 1),
};

// `hiddenArchived` counts the archived records that match but are not shown.
export function listRecords<R extends Listed>(records: R[], view: Pick<ListView, 'query' | 'showArchived' | 'sort'>, searchText: (record: R) => string[]): { shown: R[]; hiddenArchived: number } {
  const words = searchWords(view.query);
  const matching = records.filter((record) => {
    const text = fold(searchText(record).join('\n'));
    return words.every((word) => text.includes(word));
  });
  const shown = view.showArchived ? matching : matching.filter((record) => record.archivedAt === null);
  return { shown: shown.sort(compare[view.sort]), hiddenArchived: matching.length - shown.length };
}

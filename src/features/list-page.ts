// Long lists in pages of 50 (spec 08): a page draws only its own rows (docs/06).

export const PAGE_SIZE = 50;

// `index` counts from 0. `from` and `to` count from 1, for "Showing 51–100 of 120".
export type Page<T> = { rows: T[]; index: number; count: number; from: number; to: number; total: number };

// An index past the end shows the last page, for example after the list got shorter.
export function onePage<T>(items: T[], index: number): Page<T> {
  const count = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const at = Math.min(Math.max(index, 0), count - 1);
  const rows = items.slice(at * PAGE_SIZE, (at + 1) * PAGE_SIZE);
  return { rows, index: at, count, from: rows.length > 0 ? at * PAGE_SIZE + 1 : 0, to: at * PAGE_SIZE + rows.length, total: items.length };
}

// A changed search, sort, or filter starts at the first page. A page change keeps the rest.
export function changeView<V extends { page: number }>(view: V, changes: Partial<V>): V {
  return { ...view, page: 0, ...changes };
}
